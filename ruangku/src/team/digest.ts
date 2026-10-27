// Rangkuman pagi: dikirim otomatis lewat bot (Telegram/WhatsApp/email) atau notifikasi desktop.
import type { Item, Reminder, TimeBlock } from "../lib/types";
import type { Member } from "../lib/team";
import { isTaskDone, priorityRank, type Project, type Task } from "../lib/tasks";
import { fmtMin, reminderTimesOn } from "../lib/timeblocks";
import { addDays, dateKey, parseDateKey } from "../lib/date";
import { shortCode } from "../lib/taskOps";
import type { Band } from "../lib/prayerGuard";
import type { CalEvent } from "../lib/calendar";

export interface DigestConfig {
  enabled: boolean;
  /** Jam kirim HH:MM */
  time: string;
  /** Anggota penerima (kosong = saya saja) */
  members: string[];
}
export const DEFAULT_DIGEST: DigestConfig = { enabled: false, time: "06:30", members: [] };

export interface DigestInput {
  member: Pick<Member, "name" | "isMe"> & { id: string };
  date: string;
  hijri?: string;
  tasks: Item<Task>[];
  projects: Item<Project>[];
  blocks: Item<TimeBlock>[];
  reminders: Item<Reminder>[];
  /** Acara kalender luar & milestone hari ini (sudah difilter) */
  events: Pick<CalEvent, "title" | "start" | "end" | "holiday" | "layer">[];
  bands: Band[];
  /** Peserta tiap rapat (id rapat → id anggota), supaya anggota juga diberi tahu rapatnya */
  meetingAttendees?: Record<string, string[]>;
  /** Tagihan/pemasukan rutin yang jatuh tempo hari ini atau terlambat (hanya untuk pemilik) */
  bills?: { title: string; amount: number; type: "masuk" | "keluar"; date: string }[];
}

const fDate = (d: string) => parseDateKey(d).toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

/** Teks rangkuman pagi (format chat: *tebal*, daftar dengan •). Kosong bila tidak ada isi berarti. */
export function buildDigest(x: DigestInput): string {
  const { member, date } = x;
  const mine = x.tasks.filter((t) => !t.parentId && !isTaskDone(t, x.projects) && ((t.assignees ?? []).includes(member.id) || (member.isMe && !t.assignees?.length)));
  const late = mine.filter((t) => t.due && t.due < date);
  const today = mine.filter((t) => t.due === date);
  const soon = mine.filter((t) => t.due && t.due > date && t.due <= dateKey(addDays(parseDateKey(date), 3)));
  const sortT = (a: Item<Task>, b: Item<Task>) => priorityRank(a.priority) - priorityRank(b.priority) || (a.dueTime ?? 9999) - (b.dueTime ?? 9999);
  const line = (t: Item<Task>, note: string) => `• [${shortCode(t.id)}] ${t.title}${note ? ` — ${note}` : ""}`;

  const agenda: { at: number; text: string }[] = [];
  if (member.isMe) {
    for (const b of x.blocks) if (b.date === date && !b.tracked && b.attendance !== "batal" && !b.meetingId && !b.courseId) agenda.push({ at: b.start, text: `${fmtMin(b.start)}–${fmtMin(b.end)} ${b.title}` });
  }
  // Rapat & kuliah: untuk saya semua; untuk anggota hanya rapat yang mereka ikuti.
  for (const b of x.blocks) {
    if (b.date !== date || b.attendance === "batal" || !(b.meetingId || b.courseId)) continue;
    if (!member.isMe && !(b.meetingId && x.meetingAttendees?.[b.meetingId]?.includes(member.id))) continue;
    const icon = b.kind === "rapat" ? "🤝" : "🎓";
    agenda.push({ at: b.start, text: `${fmtMin(b.start)}–${fmtMin(b.end)} ${icon} ${b.title}${b.location ? ` · ${b.location}` : ""}${b.link ? ` · ${b.link}` : ""}` });
  }
  if (member.isMe) {
    for (const r of x.reminders)
      for (const at of reminderTimesOn(r, date)) {
        const d = new Date(at);
        const m = d.getHours() * 60 + d.getMinutes();
        agenda.push({ at: m, text: `${fmtMin(m)} ${r.title}` });
      }
  }
  for (const t of today) if (t.dueTime !== undefined) agenda.push({ at: t.dueTime, text: `${fmtMin(t.dueTime)} tenggat: ${t.title}` });
  for (const e of x.events) if (!e.holiday && e.start !== undefined) agenda.push({ at: e.start, text: `${fmtMin(e.start)}${e.end && e.end > e.start ? `–${fmtMin(e.end)}` : ""} ${e.title}` });
  agenda.sort((a, b) => a.at - b.at);
  const allDay = x.events.filter((e) => e.start === undefined);
  const holidays = allDay.filter((e) => e.holiday).map((e) => e.title);
  const others = allDay.filter((e) => !e.holiday).map((e) => (e.layer === "milestone" ? `◆ ${e.title}` : e.title));

  const out: string[] = [];
  out.push(`🌅 *Selamat pagi, ${member.name.split(" ")[0]}!*`);
  out.push(`${fDate(date)}${x.hijri ? ` · ${x.hijri}` : ""}`);
  if (x.bands.length) out.push(`🕌 ${x.bands.map((b) => `${b.name === "Sholat Jumat" ? "Jumat" : b.name} ${fmtMin(b.id === "dzuhur" && b.name === "Sholat Jumat" ? b.start + 15 : b.start)}`).join(" · ")}`);
  if (holidays.length) out.push(`🎉 Libur: ${holidays.join(", ")}`);
  if (others.length) out.push(`📌 ${others.join(" · ")}`);
  if (agenda.length) out.push("", "📅 *Agenda hari ini*", ...agenda.slice(0, 12).map((a) => `• ${a.text}`), ...(agenda.length > 12 ? [`• …dan ${agenda.length - 12} lagi`] : []));
  if (late.length || today.length) {
    out.push("", `✅ *Tugas* (${today.length} hari ini${late.length ? `, ${late.length} terlambat` : ""})`);
    out.push(...[...late].sort(sortT).slice(0, 6).map((t) => line(t, `terlambat sejak ${parseDateKey(t.due!).toLocaleDateString("id-ID", { day: "numeric", month: "short" })}`)));
    out.push(...[...today].sort(sortT).slice(0, 8).map((t) => line(t, t.dueTime !== undefined ? `jam ${fmtMin(t.dueTime)}` : "")));
  }
  if (member.isMe && x.bills?.length) {
    out.push("", "💳 *Tagihan jatuh tempo*", ...x.bills.slice(0, 6).map((b) => `• ${b.title} ${b.type === "masuk" ? "+" : "−"}Rp${Math.round(b.amount).toLocaleString("id-ID")}${b.date < date ? ` (telat sejak ${parseDateKey(b.date).toLocaleDateString("id-ID", { day: "numeric", month: "short" })})` : ""}`));
  }
  if (soon.length) out.push("", `🔜 3 hari ke depan: ${soon.slice(0, 5).map((t) => t.title).join("; ")}`);
  if (!agenda.length && !late.length && !today.length) out.push("", "Tidak ada agenda maupun tugas jatuh tempo hari ini. Waktu yang baik untuk pekerjaan fokus. ✨");
  out.push("", "Balas *tugas* untuk daftar lengkap atau *selesai KODE* bila sudah beres.");
  return out.join("\n");
}

/** Sudah waktunya kirim? (sekali sehari, setelah jam yang diatur, sebelum tengah hari supaya tidak terlambat sekali). */
export function digestDue(cfg: DigestConfig, now: Date, lastSent: string | null): boolean {
  if (!cfg.enabled) return false;
  const today = dateKey(now);
  if (lastSent === today) return false;
  const [h, m] = cfg.time.split(":").map(Number);
  const target = (h || 0) * 60 + (m || 0);
  const cur = now.getHours() * 60 + now.getMinutes();
  return cur >= target && cur < Math.max(target + 1, 12 * 60);
}
