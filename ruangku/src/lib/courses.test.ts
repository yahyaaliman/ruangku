import { describe, expect, it } from "vitest";
import { attendanceStats, classBlockId, courseGrade, courseOccurrences, gpa, GRADE_SCALES, letterFor, nextClasses, numberedMeetings, planCourseBlocks, semesterOf, weightedScore, type Course } from "./courses";
import type { Item, TimeBlock } from "./types";

const course: Course = {
  name: "Pemrograman AI",
  code: "AI5101",
  sks: 3,
  semester: "Ganjil 2026/2027",
  start: "2026-10-26",
  end: "2026-11-08",
  sessions: [
    { id: "s1", weekday: 2, start: 480, end: 600, location: "R. 7602" },
    { id: "s2", weekday: 4, start: 780, end: 900, location: "Lab 2", type: "praktikum" },
  ],
  color: "laut",
  skipHolidays: true,
  exams: [{ id: "uts", kind: "UTS", date: "2026-11-05", start: 480, end: 600 }],
  grading: [
    { id: "t", name: "Tugas", weight: 30, score: 90 },
    { id: "uts", name: "UTS", weight: 30, score: 70 },
    { id: "uas", name: "UAS", weight: 40 },
  ],
  minAttendance: 80,
};

describe("kuliah", () => {
  it("pertemuan mingguan dengan libur dilewati", () => {
    const occ = courseOccurrences(course, new Set(["2026-11-03"]));
    expect(occ.map((o) => `${o.date}/${o.session.id}`)).toEqual(["2026-10-27/s1", "2026-10-29/s2", "2026-11-05/s2"]);
  });

  it("rencana blok: buat, perbarui masa depan, jangan sentuh yang sudah dipakai", () => {
    const fresh = planCourseBlocks("c1", course, [], "2026-10-28");
    expect(fresh.create).toHaveLength(5);
    const lab = fresh.create.find((c) => c.id === classBlockId("c1", "s2", "2026-10-29"))!;
    expect(lab.data).toMatchObject({ kind: "kuliah", title: "AI5101 Pemrograman AI (Praktikum)", location: "Lab 2", courseId: "c1" });
    expect(fresh.create.some((c) => c.id === "ujian-c1-uts" && c.data.title === "UTS AI5101 Pemrograman AI")).toBe(true);

    const blocks: Item<TimeBlock>[] = fresh.create.map((c) => ({ id: c.id, updatedAt: 0, ...c.data }));
    const moved = { ...course, sessions: [{ ...course.sessions[0], weekday: 3, location: "R. 9" }, course.sessions[1]] };
    // Pertemuan Selasa 27/10 sudah lewat & diberi presensi → tetap; Selasa 3/11 (belum) dihapus; Rabu baru dibuat.
    blocks[0] = { ...blocks[0], attendance: "hadir" };
    const p = planCourseBlocks("c1", moved, blocks, "2026-10-28");
    expect(p.remove).toEqual([classBlockId("c1", "s1", "2026-11-03")]);
    expect(p.create.map((c) => c.id)).toEqual([classBlockId("c1", "s1", "2026-10-28"), classBlockId("c1", "s1", "2026-11-04")]);
    expect(p.remove).not.toContain(classBlockId("c1", "s1", "2026-10-27"));
    // Arsip: blok mendatang yang belum dipakai dihapus.
    const arch = planCourseBlocks("c1", { ...course, archived: true }, blocks, "2026-10-28");
    expect(arch.create).toEqual([]);
    expect(arch.remove).toContain("ujian-c1-uts");
    expect(arch.remove).not.toContain(classBlockId("c1", "s1", "2026-10-27"));
  });

  it("nomor pertemuan & presensi", () => {
    const b = (date: string, attendance?: TimeBlock["attendance"], id = date): Item<TimeBlock> => ({ id, updatedAt: 0, date, start: 480, end: 600, title: "x", kind: "kuliah", courseId: "c1", sessionId: "s1", attendance });
    const blocks = [b("2026-10-06", "hadir"), b("2026-10-13", "batal"), b("2026-10-20", "izin"), b("2026-10-27"), b("2026-11-03"), { ...b("2026-11-05", undefined, "ujian"), sessionId: "ujian:uts" }];
    expect(numberedMeetings(blocks, "c1").map((x) => x.n)).toEqual([1, null, 2, 3, 4]);
    const st = attendanceStats(blocks, "c1", "2026-10-28");
    expect(st).toMatchObject({ held: 3, hadir: 1, izin: 1, unrecorded: 1, percent: 50 });
  });

  it("nilai, huruf, dan IP", () => {
    expect(weightedScore(course.grading)).toEqual({ score: 80, covered: 60, totalWeight: 100 });
    expect(letterFor(80).letter).toBe("A");
    expect(letterFor(72).letter).toBe("B");
    expect(letterFor(72, GRADE_SCALES[1]).letter).toBe("B");
    expect(courseGrade(course)).toEqual({ letter: "A", point: 4, projected: true });
    expect(courseGrade({ ...course, finalLetter: "ab" })).toEqual({ letter: "AB", point: 3.5, projected: false });
    const list = [course, { ...course, sks: 2, finalLetter: "B" }, { ...course, sks: 4, semester: "Genap 2025/2026", finalLetter: "A" }, { ...course, grading: [] }];
    expect(gpa(list, GRADE_SCALES[0], "Ganjil 2026/2027")).toEqual({ ip: 3.6, sks: 5, projected: true });
    expect(gpa(list).sks).toBe(9);
  });

  it("semester & kelas berikutnya", () => {
    expect(semesterOf(new Date(2026, 9, 27))).toBe("Ganjil 2026/2027");
    expect(semesterOf(new Date(2027, 0, 10))).toBe("Ganjil 2026/2027");
    expect(semesterOf(new Date(2027, 2, 1))).toBe("Genap 2026/2027");
    const blocks: Item<TimeBlock>[] = [
      { id: "a", updatedAt: 0, date: "2026-10-27", start: 480, end: 540, title: "pagi", kind: "kuliah" },
      { id: "b", updatedAt: 0, date: "2026-10-27", start: 780, end: 900, title: "siang", kind: "kuliah" },
      { id: "c", updatedAt: 0, date: "2026-10-28", start: 480, end: 540, title: "besok", kind: "kuliah", attendance: "batal" },
      { id: "d", updatedAt: 0, date: "2026-10-27", start: 800, end: 900, title: "rapat", kind: "rapat" },
    ];
    expect(nextClasses(blocks, new Date(2026, 9, 27, 10)).map((b) => b.id)).toEqual(["b"]);
  });
});
