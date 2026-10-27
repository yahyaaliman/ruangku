import { describe, expect, it } from "vitest";
import { occurrences, parseIcs, toIcs } from "./ics";
import { dateKey } from "./date";

const SAMPLE = [
  "BEGIN:VCALENDAR",
  "VERSION:2.0",
  "BEGIN:VEVENT",
  "UID:libur-1",
  "DTSTART;VALUE=DATE:20261225",
  "DTEND;VALUE=DATE:20261226",
  "SUMMARY:Hari Raya Natal",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "UID:cuti-1",
  "DTSTART;VALUE=DATE:20261224",
  "DTEND;VALUE=DATE:20261227",
  "SUMMARY:Cuti bersama\\, panjang",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "UID:rapat-1",
  "DTSTART;TZID=Asia/Jakarta:20261102T090000",
  "DTEND;TZID=Asia/Jakarta:20261102T103000",
  "RRULE:FREQ=WEEKLY;BYDAY=MO,WE;COUNT=4",
  "EXDATE;TZID=Asia/Jakarta:20261104T090000",
  "SUMMARY:Rapat mingguan",
  "LOCATION:Ruang 2",
  "DESCRIPTION:Baris satu\\nBaris dua yang sangat panjang sehingga dilipat oleh server kalender ke baris ber",
  " ikutnya",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "UID:batal",
  "DTSTART:20261103T020000Z",
  "STATUS:CANCELLED",
  "SUMMARY:Dibatalkan",
  "END:VEVENT",
  "END:VCALENDAR",
].join("\r\n");

describe("parseIcs", () => {
  const evs = parseIcs(SAMPLE);

  it("membaca acara sepanjang hari dengan DTEND eksklusif", () => {
    const natal = evs.find((e) => e.uid === "libur-1")!;
    expect(natal).toMatchObject({ date: "2026-12-25", allDay: true, title: "Hari Raya Natal" });
    expect(natal.endDate).toBeUndefined();
    const cuti = evs.find((e) => e.uid === "cuti-1")!;
    expect(cuti).toMatchObject({ date: "2026-12-24", endDate: "2026-12-26", title: "Cuti bersama, panjang" });
  });

  it("membaca waktu ber-TZID, baris terlipat, dan EXDATE", () => {
    const r = evs.find((e) => e.uid === "rapat-1")!;
    // 09:00 WIB = 02:00 UTC, dibandingkan dalam zona waktu lokal mesin uji.
    const local = new Date(Date.UTC(2026, 10, 2, 2, 0));
    expect(r.start).toBe(local.getHours() * 60 + local.getMinutes());
    expect(r.end! - r.start!).toBe(90);
    expect(r.description).toContain("baris berikutnya");
    expect(r.location).toBe("Ruang 2");
    expect(r.exdates).toEqual([dateKey(new Date(Date.UTC(2026, 10, 4, 2, 0)))]);
  });

  it("melewati acara yang dibatalkan", () => {
    expect(evs.some((e) => e.uid === "batal")).toBe(false);
  });
});

describe("occurrences", () => {
  it("mingguan dengan BYDAY, COUNT, dan EXDATE", () => {
    const d = occurrences({ date: "2026-11-02", rrule: "FREQ=WEEKLY;BYDAY=MO,WE;COUNT=4", exdates: ["2026-11-04"] }, "2026-10-01", "2026-12-31");
    expect(d).toEqual(["2026-11-02", "2026-11-09", "2026-11-11"]);
  });

  it("bulanan melewati tanggal yang tidak ada", () => {
    const d = occurrences({ date: "2026-01-31", rrule: "FREQ=MONTHLY;COUNT=4" }, "2026-01-01", "2026-12-31");
    expect(d).toEqual(["2026-01-31", "2026-03-31", "2026-05-31", "2026-07-31"]);
  });

  it("tahunan dengan UNTIL", () => {
    const d = occurrences({ date: "2024-08-17", rrule: "FREQ=YEARLY;UNTIL=20270101T000000Z" }, "2025-01-01", "2030-12-31");
    expect(d).toEqual(["2025-08-17", "2026-08-17"]);
  });

  it("harian dengan INTERVAL dibatasi rentang", () => {
    expect(occurrences({ date: "2026-10-01", rrule: "FREQ=DAILY;INTERVAL=10" }, "2026-10-15", "2026-11-05")).toEqual(["2026-10-21", "2026-10-31"]);
  });
});

describe("toIcs", () => {
  it("menghasilkan VCALENDAR yang bisa dibaca kembali", () => {
    const text = toIcs([
      { uid: "a", title: "Blok; fokus, thesis", date: "2026-10-26", start: 9 * 60, end: 11 * 60 },
      { uid: "b", title: "Tenggat proposal", date: "2026-10-30" },
    ]);
    expect(text.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    const back = parseIcs(text);
    expect(back).toHaveLength(2);
    expect(back[0]).toMatchObject({ title: "Blok; fokus, thesis", date: "2026-10-26", start: 540, end: 660 });
    expect(back[1]).toMatchObject({ title: "Tenggat proposal", date: "2026-10-30", allDay: true });
  });

  it("melipat baris panjang", () => {
    const text = toIcs([{ uid: "x", title: "a".repeat(200), date: "2026-10-26" }]);
    expect(text.split("\r\n").every((l) => l.length <= 75)).toBe(true);
    expect(parseIcs(text)[0].title).toBe("a".repeat(200));
  });
});
