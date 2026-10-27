import { describe, expect, it } from "vitest";
import { actionsFromNotulen, extractSection, findMeetingLink, inviteText, linkPlatform, nextMeetings, notulenMarkdown, planSeries, reconcileMeetings, seriesDates, summaryText, type Meeting, type MeetingSeries } from "./meetings";
import type { Item, TimeBlock } from "./types";

const members = [{ id: "m-rina", name: "Rina Wulandari" }, { id: "m-bayu", name: "Bayu Pratama" }];
const mt = (id: string, extra: Partial<Meeting> = {}, updatedAt = 1000): Item<Meeting> => ({ id, updatedAt, title: "Rapat tim", date: "2026-10-28", start: 540, end: 600, attendees: ["m-rina"], agenda: [], actions: [], status: "terjadwal", createdAt: 0, ...extra });

describe("rapat", () => {
  it("mengenali platform tautan", () => {
    expect(linkPlatform("https://us02web.zoom.us/j/123")).toBe("Zoom");
    expect(linkPlatform("meet.google.com/abc-defg-hij")).toBe("Google Meet");
    expect(linkPlatform("https://teams.microsoft.com/l/meetup-join/x")).toBe("Microsoft Teams");
    expect(linkPlatform("https://contoh.id")).toBe("Tautan");
    expect(linkPlatform("")).toBeNull();
    expect(findMeetingLink("Silakan gabung https://contoh.id/info atau https://meet.google.com/aaa-bbbb-ccc ya")).toBe("https://meet.google.com/aaa-bbbb-ccc");
  });

  it("tanggal rapat berulang", () => {
    const s = { freq: "weekly" as const, from: "2026-10-27", weekdays: [2, 4] };
    expect(seriesDates(s, "2026-10-27", "2026-11-06")).toEqual(["2026-10-27", "2026-10-29", "2026-11-03", "2026-11-05"]);
    expect(seriesDates({ freq: "weekdays", from: "2026-10-30" }, "2026-10-30", "2026-11-03")).toEqual(["2026-10-30", "2026-11-02", "2026-11-03"]);
    expect(seriesDates({ freq: "biweekly", from: "2026-10-27" }, "2026-10-27", "2026-11-24")).toEqual(["2026-10-27", "2026-11-10", "2026-11-24"]);
    expect(seriesDates({ freq: "monthly", from: "2026-08-31" }, "2026-09-01", "2026-12-31")).toEqual(["2026-10-31", "2026-12-31"]);
    expect(seriesDates({ freq: "daily", from: "2026-10-27", until: "2026-10-29", skipHolidays: true }, "2026-10-01", "2026-12-01", new Set(["2026-10-28"]))).toEqual(["2026-10-27", "2026-10-29"]);
  });

  it("rencana seri: buat, perbarui, hapus yang tak terpakai", () => {
    const s: MeetingSeries = { title: "Stand-up", start: 540, end: 555, attendees: ["m-rina"], agenda: [{ id: "a", text: "Kemarin/hari ini", done: true }], freq: "weekly", from: "2026-10-20", weekdays: [2], active: true };
    const existing = [mt("mt-s1-2026-10-27", { seriesId: "s1", date: "2026-10-27", title: "Stand-up lama", start: 540, end: 555 }), mt("mt-s1-2026-10-29", { seriesId: "s1", date: "2026-10-29", title: "Stand-up", start: 540, end: 555 }), mt("mt-s1-2026-10-20", { seriesId: "s1", date: "2026-10-20" })];
    const p = planSeries("s1", s, existing, "2026-10-27", 5, new Set(), 14);
    expect(p.create.map((c) => c.id)).toEqual(["mt-s1-2026-11-03", "mt-s1-2026-11-10"]);
    expect(p.create[0].data.agenda[0].done).toBe(false);
    expect(p.update).toEqual([{ id: "mt-s1-2026-10-27", patch: { title: "Stand-up" } }]);
    expect(p.remove).toEqual(["mt-s1-2026-10-29"]);
    const off = planSeries("s1", { ...s, active: false }, existing, "2026-10-27", 5, new Set(), 14);
    expect(off.create).toEqual([]);
    expect(off.remove).toEqual(["mt-s1-2026-10-29"]);
  });

  it("sinkron rapat dan blok: yang terbaru menang", () => {
    const m = mt("r1", { location: "R. 2", link: "https://meet.google.com/x" }, 1000);
    const created = reconcileMeetings([m], []);
    expect(created.upsertBlocks[0].id).toBe("blk-r1");
    expect(created.upsertBlocks[0].data).toMatchObject({ kind: "rapat", meetingId: "r1", location: "R. 2", start: 540 });
    const b: Item<TimeBlock> = { id: "blk-r1", updatedAt: 2000, ...created.upsertBlocks[0].data, start: 600, end: 660 };
    const moved = reconcileMeetings([m], [b]);
    expect(moved.patchMeetings[0].patch).toMatchObject({ start: 600, end: 660 });
    const newer = reconcileMeetings([{ ...m, updatedAt: 3000, title: "Rapat evaluasi" }], [b]);
    expect(newer.upsertBlocks[0].data).toMatchObject({ title: "Rapat evaluasi", start: 540 });
    expect(reconcileMeetings([{ ...m, status: "batal" }], [b]).removeBlocks).toEqual(["blk-r1"]);
    expect(reconcileMeetings([], [{ ...b, updatedAt: 0 }], 10 * 60000).removeBlocks).toEqual(["blk-r1"]);
    expect(reconcileMeetings([], [b], 2500).removeBlocks).toEqual([]);
    // Geser satu kemunculan seri → terlepas dari seri.
    expect(reconcileMeetings([{ ...m, seriesId: "s" }], [b]).patchMeetings[0].patch.detached).toBe(true);
  });

  it("notulen, undangan, ringkasan, dan action item", () => {
    const m = mt("r1", { attendees: ["m-rina", "m-bayu"], agenda: [{ id: "1", text: "Evaluasi sprint", done: false, minutes: 15 }], actions: [{ id: "x", text: "Kirim laporan", assignee: "m-bayu", due: "2026-10-30" }], link: "https://zoom.us/j/1" });
    const md = notulenMarkdown(m, members);
    expect(md).toContain("**Peserta:** Rina Wulandari, Bayu Pratama");
    expect(md).toContain("1. Evaluasi sprint (15 mnt)");
    expect(md).toContain("- [ ] Kirim laporan — Bayu Pratama, tenggat 2026-10-30");
    expect(inviteText(m, members)).toContain("🔗 Zoom: https://zoom.us/j/1");
    const notulen = md.replace("## Keputusan\n\n- ", "## Keputusan\n\n- Rilis Jumat");
    expect(extractSection(notulen, "Keputusan")).toBe("- Rilis Jumat");
    expect(summaryText(m, members, notulen)).toContain("- Rilis Jumat");
    expect(actionsFromNotulen(md, members)).toEqual([{ text: "Kirim laporan", assignee: "m-bayu", due: "2026-10-30" }]);
    expect(actionsFromNotulen("## Tindak lanjut\n\n- [ ] Siapkan slide — Rina\n- [x] Booking ruang", members)).toEqual([{ text: "Siapkan slide", assignee: "m-rina", due: undefined }, { text: "Booking ruang", assignee: undefined, due: undefined }]);
  });

  it("rapat berikutnya", () => {
    const list = [mt("a", { date: "2026-10-27", start: 480, end: 500 }), mt("b", { date: "2026-10-27", start: 900, end: 960 }), mt("c", { date: "2026-10-28" }), mt("d", { date: "2026-10-29", status: "batal" })];
    expect(nextMeetings(list, new Date(2026, 9, 27, 10, 0)).map((m) => m.id)).toEqual(["b", "c"]);
  });
});
