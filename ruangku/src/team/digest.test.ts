import { describe, expect, it } from "vitest";
import { buildDigest, digestDue, DEFAULT_DIGEST } from "./digest";
import { DEFAULT_STATUSES, type Project, type Task } from "../lib/tasks";
import type { Item, Reminder, TimeBlock } from "../lib/types";

const P: Item<Project>[] = [{ id: "p", updatedAt: 0, name: "Thesis", color: "ungu", statuses: DEFAULT_STATUSES }];
const t = (id: string, extra: Partial<Task>): Item<Task> => ({ id, updatedAt: 0, title: id, projectId: "p", status: "todo", tags: [], checklist: [], dependsOn: [], order: 0, createdAt: 0, ...extra });

describe("rangkuman pagi", () => {
  const base = {
    date: "2026-10-27",
    hijri: "15 Jumadil Awal 1448 H",
    projects: P,
    tasks: [t("bab3", { title: "Tulis bab 3", due: "2026-10-27", dueTime: 600, priority: "tinggi" }), t("domain", { title: "Perpanjang domain", due: "2026-10-25" }), t("rina", { title: "Tugas Rina", due: "2026-10-27", assignees: ["m-rina"] }), t("seminar", { title: "Slide seminar", due: "2026-10-29" })],
    blocks: [{ id: "b", updatedAt: 0, date: "2026-10-27", start: 540, end: 600, title: "Stand-up" }] as Item<TimeBlock>[],
    reminders: [{ id: "r", updatedAt: 0, title: "Minum obat", dueAt: new Date(2026, 9, 20, 7, 0).getTime(), repeat: "daily", done: false }] as Item<Reminder>[],
    events: [
      { title: "Rapat dosen", start: 780, end: 840, layer: "luar" as const },
      { title: "Sumpah Pemuda", holiday: true, layer: "luar" as const },
    ],
    bands: [{ id: "dzuhur" as const, name: "Dzuhur", start: 699, end: 714 }],
  };

  it("untuk saya: agenda gabungan, tugas terlambat & hari ini, sholat, libur", () => {
    const s = buildDigest({ ...base, member: { id: "m-saya", name: "Saya Sendiri", isMe: true } });
    expect(s).toContain("*Selamat pagi, Saya!*");
    expect(s).toContain("Selasa, 27 Oktober 2026 · 15 Jumadil Awal 1448 H");
    expect(s).toContain("🕌 Dzuhur 11:39");
    expect(s).toContain("🎉 Libur: Sumpah Pemuda");
    const agenda = s.split("📅 *Agenda hari ini*")[1].split("\n\n")[0];
    expect(agenda.trim().split("\n")).toEqual(["• 07:00 Minum obat", "• 09:00–10:00 Stand-up", "• 10:00 tenggat: Tulis bab 3", "• 13:00–14:00 Rapat dosen"]);
    expect(s).toContain("(1 hari ini, 1 terlambat)");
    expect(s).toMatch(/\[DOMA\] Perpanjang domain — terlambat sejak 25 Okt/);
    expect(s).not.toContain("Tugas Rina");
    expect(s).toContain("3 hari ke depan: Slide seminar");
  });

  it("untuk anggota: hanya tugas yang ditugaskan, tanpa blok pribadi", () => {
    const s = buildDigest({ ...base, member: { id: "m-rina", name: "Rina", isMe: false } });
    expect(s).toContain("Tugas Rina");
    expect(s).not.toContain("Stand-up");
    expect(s).not.toContain("Tulis bab 3");
  });

  it("jadwal kirim sekali sehari", () => {
    const cfg = { ...DEFAULT_DIGEST, enabled: true, time: "06:30" };
    expect(digestDue(cfg, new Date(2026, 9, 27, 6, 29), null)).toBe(false);
    expect(digestDue(cfg, new Date(2026, 9, 27, 6, 30), null)).toBe(true);
    expect(digestDue(cfg, new Date(2026, 9, 27, 9, 0), "2026-10-26")).toBe(true);
    expect(digestDue(cfg, new Date(2026, 9, 27, 9, 0), "2026-10-27")).toBe(false);
    expect(digestDue(cfg, new Date(2026, 9, 27, 13, 0), null)).toBe(false);
    expect(digestDue({ ...cfg, enabled: false }, new Date(2026, 9, 27, 7, 0), null)).toBe(false);
  });
});

describe("rangkuman pagi: rapat & kuliah", () => {
  it("rapat untuk pesertanya, kuliah hanya untuk saya, kelas batal dilewati", () => {
    const blocks = [
      { id: "blk-r", updatedAt: 0, date: "2026-10-27", start: 600, end: 660, title: "Sprint review", kind: "rapat", meetingId: "r", link: "https://meet.google.com/x" },
      { id: "k1", updatedAt: 0, date: "2026-10-27", start: 450, end: 550, title: "AI5101 Pemrograman", kind: "kuliah", courseId: "c", location: "R. 7602" },
      { id: "k2", updatedAt: 0, date: "2026-10-27", start: 780, end: 880, title: "MA5181 Statistika", kind: "kuliah", courseId: "c2", attendance: "batal" },
    ] as Item<TimeBlock>[];
    const base = { date: "2026-10-27", projects: P, tasks: [], blocks, reminders: [], events: [], bands: [], meetingAttendees: { r: ["m-saya", "m-rina"] } };
    const me = buildDigest({ ...base, member: { id: "m-saya", name: "Saya", isMe: true } });
    expect(me).toContain("• 07:30–09:10 🎓 AI5101 Pemrograman · R. 7602");
    expect(me).toContain("• 10:00–11:00 🤝 Sprint review · https://meet.google.com/x");
    expect(me).not.toContain("Statistika");
    const rina = buildDigest({ ...base, member: { id: "m-rina", name: "Rina", isMe: false } });
    expect(rina).toContain("🤝 Sprint review");
    expect(rina).not.toContain("AI5101");
  });
});

describe("rangkuman pagi: tagihan", () => {
  it("menampilkan tagihan jatuh tempo hanya untuk pemilik", () => {
    const base = { date: "2026-10-27", projects: [], tasks: [], blocks: [], reminders: [], events: [], bands: [], bills: [{ title: "Token listrik", amount: 250000, type: "keluar" as const, date: "2026-10-20" }] };
    const me = buildDigest({ ...base, member: { id: "m", name: "Saya", isMe: true } });
    expect(me).toContain("Tagihan jatuh tempo");
    expect(me).toContain("Token listrik −Rp250.000 (telat sejak 20 Okt)");
    expect(buildDigest({ ...base, member: { id: "r", name: "Rina", isMe: false } })).not.toContain("Token listrik");
  });
});
