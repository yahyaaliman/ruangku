// Penjaga konsistensi rapat & kuliah (jalan di jendela utama):
// - rapat berulang diisi sampai 8 minggu ke depan,
// - setiap rapat punya blok jadwal yang sama (dua arah),
// - setiap mata kuliah punya blok pertemuan & ujian sesuai jadwal mingguannya.
// Juga penghapusan blok yang "pintar": menghapus blok rapat = membatalkan rapat,
// menghapus pertemuan kuliah = kelas batal (presensi tidak dihitung).
import { useEffect, useRef } from "react";
import { api, onEvent } from "./api";
import { dataOf, type Item, type TimeBlock } from "./types";
import { MEETING_KIND, SERIES_KIND, planSeries, reconcileMeetings, type Meeting, type MeetingSeries } from "./meetings";
import { COURSE_KIND, planCourseBlocks, type Course } from "./courses";
import { builtinHolidays } from "./holidays";
import { dateKey } from "./date";
import { dueRecurring, LEDGER_KIND, markRecurring, postRecurring, RECURRING_KIND, recurringTxId, type Recurring } from "./finance";

const load = async <T>(kind: string): Promise<Item<T>[]> => (await api.list(kind)).map((r) => ({ ...dataOf<T>(r.data), id: r.id, updatedAt: r.updatedAt }));
const strip = <T>(x: Item<T>): T => {
  const { id: _i, updatedAt: _u, ...rest } = x as Item<T> & Record<string, unknown>;
  void _i;
  void _u;
  return rest as unknown as T;
};

export function nationalHolidays(): Set<string> {
  return new Set(builtinHolidays().filter((h) => !h.title.startsWith("Cuti bersama")).map((h) => h.date));
}

let running = false;

/** Satu putaran penyelarasan. Mengembalikan jumlah perubahan. */
export async function syncAgenda(now = new Date()): Promise<number> {
  if (running) return 0;
  running = true;
  let n = 0;
  try {
    const today = dateKey(now);
    const holidays = nationalHolidays();
    const [series, courses] = await Promise.all([load<MeetingSeries>(SERIES_KIND), load<Course>(COURSE_KIND)]);
    let meetings = await load<Meeting>(MEETING_KIND);
    // 1. Rapat berulang.
    for (const s of series) {
      const p = planSeries(s.id, s, meetings, today, now.getTime(), s.skipHolidays ? holidays : new Set());
      for (const c of p.create) (await api.save(c.id, MEETING_KIND, c.data), n++);
      for (const u of p.update) {
        const m = meetings.find((x) => x.id === u.id);
        if (m) (await api.save(u.id, MEETING_KIND, { ...strip(m), ...u.patch }), n++);
      }
      for (const r of p.remove) (await api.remove(r, MEETING_KIND), n++);
    }
    if (n) meetings = await load<Meeting>(MEETING_KIND);
    // 2. Rapat ↔ blok jadwal.
    let blocks = await load<TimeBlock>("timeblock");
    const ms = reconcileMeetings(meetings, blocks, now.getTime());
    for (const b of ms.upsertBlocks) (await api.save(b.id, "timeblock", b.data), n++);
    for (const id of ms.removeBlocks) (await api.remove(id, "timeblock"), n++);
    for (const p of ms.patchMeetings) {
      const m = meetings.find((x) => x.id === p.id);
      if (m) (await api.save(p.id, MEETING_KIND, { ...strip(m), ...p.patch }), n++);
    }
    // 3. Kuliah.
    if (courses.length || blocks.some((b) => b.courseId)) {
      if (ms.upsertBlocks.length || ms.removeBlocks.length) blocks = await load<TimeBlock>("timeblock");
      const ids = new Set(courses.map((c) => c.id));
      for (const c of courses) {
        const p = planCourseBlocks(c.id, c, blocks, today, c.skipHolidays ? holidays : new Set());
        for (const x of p.create) (await api.save(x.id, "timeblock", x.data), n++);
        for (const u of p.update) {
          const b = blocks.find((y) => y.id === u.id);
          if (b) (await api.save(u.id, "timeblock", { ...strip(b), ...u.patch }), n++);
        }
        for (const id of p.remove) (await api.remove(id, "timeblock"), n++);
      }
      // Blok kuliah yang mata kuliahnya sudah dihapus: hapus yang belum dipakai.
      for (const b of blocks) if (b.courseId && !ids.has(b.courseId) && !b.attendance && !b.noteId && now.getTime() - b.updatedAt > 120000) (await api.remove(b.id, "timeblock"), n++);
    }
    // 4. Tagihan/pemasukan rutin yang dicatat otomatis (id transaksi tetap → tidak ganda).
    const recs = (await load<Recurring>(RECURRING_KIND)).filter((r) => r.auto && r.active);
    if (recs.length) {
      const existing = new Set((await api.list(LEDGER_KIND)).map((r) => r.id));
      for (const { rec, date } of dueRecurring(recs, today)) {
        const id = recurringTxId(rec.id, date);
        if (!existing.has(id)) (await api.save(id, LEDGER_KIND, postRecurring(rec, date)), n++);
        const cur = (await load<Recurring>(RECURRING_KIND)).find((x) => x.id === rec.id);
        if (cur) await api.save(rec.id, RECURRING_KIND, { ...strip(cur), ...markRecurring(cur, date) });
      }
    }
  } finally {
    running = false;
  }
  return n;
}

/** Jalankan penyelarasan saat data rapat/kuliah/blok berubah (digabung) dan sekali sehari. */
export function useAgendaSync() {
  const t = useRef<number | undefined>(undefined);
  useEffect(() => {
    const kick = (delay = 900) => {
      window.clearTimeout(t.current);
      t.current = window.setTimeout(() => syncAgenda().catch(() => {}), delay);
    };
    kick(2500);
    const stop = onEvent<string>("records-changed", (k) => (k === "*" || k === MEETING_KIND || k === SERIES_KIND || k === COURSE_KIND || k === "timeblock" || k === RECURRING_KIND) && kick());
    const daily = window.setInterval(() => kick(0), 6 * 3600 * 1000);
    return () => {
      stop();
      window.clearInterval(daily);
      window.clearTimeout(t.current);
    };
  }, []);
}

export type RemoveOutcome = { kind: "removed" | "meeting-cancelled" | "class-cancelled" | "exam-removed"; undo: () => Promise<void> };

/** Hapus blok jadwal dengan aturan rapat/kuliah, plus fungsi batalkan. */
export async function removeBlockSmart(b: Item<TimeBlock>): Promise<RemoveOutcome> {
  const data = strip(b);
  if (b.meetingId) {
    const m = (await load<Meeting>(MEETING_KIND)).find((x) => x.id === b.meetingId);
    await api.remove(b.id, "timeblock");
    if (m) {
      await api.save(m.id, MEETING_KIND, { ...strip(m), status: "batal" });
      return { kind: "meeting-cancelled", undo: async () => void (await api.save(m.id, MEETING_KIND, { ...strip(m) })) };
    }
    return { kind: "removed", undo: async () => void (await api.save(b.id, "timeblock", data)) };
  }
  if (b.courseId && b.sessionId?.startsWith("ujian:")) {
    const c = (await load<Course>(COURSE_KIND)).find((x) => x.id === b.courseId);
    const examId = b.sessionId.slice(6);
    await api.remove(b.id, "timeblock");
    if (c) {
      await api.save(c.id, COURSE_KIND, { ...strip(c), exams: c.exams.filter((e) => e.id !== examId) });
      return { kind: "exam-removed", undo: async () => void (await api.save(c.id, COURSE_KIND, strip(c))) };
    }
    return { kind: "removed", undo: async () => void (await api.save(b.id, "timeblock", data)) };
  }
  if (b.courseId) {
    await api.save(b.id, "timeblock", { ...data, attendance: "batal" });
    return { kind: "class-cancelled", undo: async () => void (await api.save(b.id, "timeblock", data)) };
  }
  await api.remove(b.id, "timeblock");
  return { kind: "removed", undo: async () => void (await api.save(b.id, "timeblock", data)) };
}

export const REMOVE_MESSAGE: Record<RemoveOutcome["kind"], (title: string) => string> = {
  removed: (t) => `Blok "${t}" dihapus`,
  "meeting-cancelled": (t) => `Rapat "${t}" dibatalkan`,
  "class-cancelled": (t) => `Kelas "${t}" ditandai batal (tidak dihitung presensi)`,
  "exam-removed": (t) => `Ujian "${t}" dihapus dari mata kuliah`,
};
