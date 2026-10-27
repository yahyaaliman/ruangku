// Kuliah: mata kuliah dengan jadwal mingguan satu semester, pertemuan (blok jadwal kind "kuliah"),
// presensi, ujian, komponen nilai, dan IPS/IPK.
import type { BlockColor, Item, TimeBlock } from "./types";
import { addDays, dateKey, parseDateKey } from "./date";

export interface CourseSession {
  id: string;
  /** 0 = Minggu … 6 = Sabtu */
  weekday: number;
  start: number;
  end: number;
  location?: string;
  type?: "kuliah" | "praktikum" | "responsi" | "tutorial";
}
export interface CourseExam {
  id: string;
  kind: "UTS" | "UAS" | "Kuis" | "Presentasi" | "Lainnya";
  date: string;
  start: number;
  end: number;
  location?: string;
  note?: string;
}
export interface GradePart {
  id: string;
  name: string;
  /** Bobot % */
  weight: number;
  /** Nilai 0–100 (kosong = belum ada) */
  score?: number;
}

export interface Course {
  name: string;
  code?: string;
  sks: number;
  lecturer?: string;
  lecturerContact?: string;
  /** Mis. "Ganjil 2026/2027" */
  semester: string;
  /** Periode perkuliahan */
  start: string;
  end: string;
  sessions: CourseSession[];
  /** Tautan kelas daring / LMS */
  link?: string;
  color: BlockColor;
  projectId?: string;
  skipHolidays: boolean;
  exams: CourseExam[];
  grading: GradePart[];
  /** Nilai akhir manual (mis. dari SIX/portal akademik): huruf */
  finalLetter?: string;
  /** Minimal kehadiran (%) */
  minAttendance: number;
  notify?: number | "off";
  archived?: boolean;
  notes?: string;
}

export const COURSE_KIND = "course";
export const DAY_NAMES = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
export const SESSION_TYPE_LABEL: Record<NonNullable<CourseSession["type"]>, string> = { kuliah: "Kuliah", praktikum: "Praktikum", responsi: "Responsi", tutorial: "Tutorial" };
export const ATTENDANCE_LABEL = { hadir: "Hadir", izin: "Izin", sakit: "Sakit", alpa: "Alpa", batal: "Kelas batal" } as const;
export type Attendance = keyof typeof ATTENDANCE_LABEL;

export const classBlockId = (courseId: string, sessionId: string, date: string) => `kls-${courseId}-${sessionId}-${date}`;
export const examBlockId = (courseId: string, examId: string) => `ujian-${courseId}-${examId}`;
export const courseLabel = (c: Pick<Course, "code" | "name">) => (c.code ? `${c.code} ${c.name}` : c.name);

/** Semua pertemuan terjadwal (tanggal + sesi) dalam periode kuliah. */
export function courseOccurrences(c: Pick<Course, "start" | "end" | "sessions" | "skipHolidays">, holidays: Set<string> = new Set()): { date: string; session: CourseSession }[] {
  const out: { date: string; session: CourseSession }[] = [];
  if (!c.start || !c.end || c.end < c.start) return out;
  for (let d = parseDateKey(c.start); dateKey(d) <= c.end; d = addDays(d, 1)) {
    const k = dateKey(d);
    if (c.skipHolidays && holidays.has(k)) continue;
    for (const s of c.sessions) if (s.weekday === d.getDay()) out.push({ date: k, session: s });
    if (out.length > 400) break;
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.session.start - b.session.start);
}

function sessionTitle(c: Pick<Course, "code" | "name">, s: CourseSession) {
  return `${courseLabel(c)}${s.type && s.type !== "kuliah" ? ` (${SESSION_TYPE_LABEL[s.type]})` : ""}`;
}

function blockFor(courseId: string, c: Course, date: string, s: CourseSession): TimeBlock {
  return { date, start: s.start, end: s.end, title: sessionTitle(c, s), color: c.color, projectId: c.projectId, kind: "kuliah", courseId, sessionId: s.id, location: s.location, link: c.link, notify: c.notify };
}
function examBlock(courseId: string, c: Course, e: CourseExam): TimeBlock {
  return { date: e.date, start: e.start, end: e.end, title: `${e.kind} ${courseLabel(c)}`, color: "bata", projectId: c.projectId, kind: "kuliah", courseId, sessionId: `ujian:${e.id}`, location: e.location, note: e.note, notify: c.notify };
}

export interface CoursePlan {
  create: { id: string; data: TimeBlock }[];
  update: { id: string; patch: Partial<TimeBlock> }[];
  remove: string[];
}

const used = (b: Partial<TimeBlock>) => !!(b.attendance || b.topic || b.noteId || b.done);

/**
 * Samakan blok kuliah dengan jadwal mata kuliah. Pertemuan yang sudah lewat, yang diubah manual,
 * atau yang sudah berisi presensi/topik/catatan tidak dihapus atau ditimpa.
 */
export function planCourseBlocks(courseId: string, c: Course, blocks: Item<TimeBlock>[], today: string, holidays: Set<string> = new Set()): CoursePlan {
  const plan: CoursePlan = { create: [], update: [], remove: [] };
  const mine = blocks.filter((b) => b.courseId === courseId);
  const byId = new Map(mine.map((b) => [b.id, b]));
  const want = new Map<string, TimeBlock>();
  if (!c.archived) {
    for (const o of courseOccurrences(c, holidays)) want.set(classBlockId(courseId, o.session.id, o.date), blockFor(courseId, c, o.date, o.session));
    for (const e of c.exams) if (e.date) want.set(examBlockId(courseId, e.id), examBlock(courseId, c, e));
  }
  for (const [id, data] of want) {
    const ex = byId.get(id);
    if (!ex) {
      // Pertemuan yang sudah lewat juga dibuat supaya presensinya bisa diisi.
      plan.create.push({ id, data });
      continue;
    }
    if (ex.detached) continue;
    const patch: Partial<TimeBlock> = {};
    for (const k of ["date", "start", "end", "title", "color", "projectId", "location", "link", "notify"] as const) if ((ex[k] ?? null) !== (data[k] ?? null)) (patch as Record<string, unknown>)[k] = data[k];
    if (Object.keys(patch).length && (ex.date >= today || ex.sessionId?.startsWith("ujian:"))) plan.update.push({ id, patch });
  }
  for (const b of mine) {
    if (want.has(b.id) || b.detached || used(b)) continue;
    if (b.date >= today || b.sessionId?.startsWith("ujian:")) plan.remove.push(b.id);
  }
  return plan;
}

/** Pertemuan berurutan (tanpa ujian), dengan nomor pertemuan. Kelas batal tidak dihitung. */
export function numberedMeetings(blocks: Item<TimeBlock>[], courseId: string): { block: Item<TimeBlock>; n: number | null }[] {
  let n = 0;
  return blocks
    .filter((b) => b.courseId === courseId && !b.sessionId?.startsWith("ujian:"))
    .sort((a, b) => a.date.localeCompare(b.date) || a.start - b.start)
    .map((b) => ({ block: b, n: b.attendance === "batal" ? null : ++n }));
}

export interface AttendanceStats {
  held: number;
  hadir: number;
  izin: number;
  sakit: number;
  alpa: number;
  unrecorded: number;
  /** Persentase hadir dari pertemuan yang sudah berlangsung (izin/sakit dihitung tidak hadir) */
  percent: number | null;
}

export function attendanceStats(blocks: Item<TimeBlock>[], courseId: string, today: string, nowMin = 1440): AttendanceStats {
  const s: AttendanceStats = { held: 0, hadir: 0, izin: 0, sakit: 0, alpa: 0, unrecorded: 0, percent: null };
  for (const { block: b } of numberedMeetings(blocks, courseId)) {
    if (b.attendance === "batal") continue;
    const past = b.date < today || (b.date === today && b.end <= nowMin);
    if (!past && !b.attendance) continue;
    s.held++;
    if (b.attendance) s[b.attendance]++;
    else s.unrecorded++;
  }
  const recorded = s.held - s.unrecorded;
  s.percent = recorded ? Math.round((s.hadir / recorded) * 100) : null;
  return s;
}

// ---------- Nilai ----------
export interface GradeScale {
  id: string;
  name: string;
  steps: { min: number; letter: string; point: number }[];
}
export const GRADE_SCALES: GradeScale[] = [
  { id: "itb", name: "A/AB/B/BC/C/D/E (mis. ITB)", steps: [{ min: 80, letter: "A", point: 4 }, { min: 73, letter: "AB", point: 3.5 }, { min: 65, letter: "B", point: 3 }, { min: 57, letter: "BC", point: 2.5 }, { min: 50, letter: "C", point: 2 }, { min: 40, letter: "D", point: 1 }, { min: 0, letter: "E", point: 0 }] },
  { id: "umum", name: "A/A-/B+/B/B-/C+/C/D/E", steps: [{ min: 85, letter: "A", point: 4 }, { min: 80, letter: "A-", point: 3.7 }, { min: 75, letter: "B+", point: 3.3 }, { min: 70, letter: "B", point: 3 }, { min: 65, letter: "B-", point: 2.7 }, { min: 60, letter: "C+", point: 2.3 }, { min: 55, letter: "C", point: 2 }, { min: 40, letter: "D", point: 1 }, { min: 0, letter: "E", point: 0 }] },
];
export const scaleById = (id?: string) => GRADE_SCALES.find((s) => s.id === id) ?? GRADE_SCALES[0];

/** Nilai akhir berbobot dari komponen yang sudah ada nilainya, plus seberapa lengkap. */
export function weightedScore(parts: GradePart[]): { score: number | null; covered: number; totalWeight: number } {
  const totalWeight = parts.reduce((s, p) => s + (p.weight || 0), 0);
  const filled = parts.filter((p) => typeof p.score === "number" && p.weight > 0);
  const covered = filled.reduce((s, p) => s + p.weight, 0);
  if (!covered) return { score: null, covered: 0, totalWeight };
  return { score: Math.round((filled.reduce((s, p) => s + p.weight * (p.score as number), 0) / covered) * 10) / 10, covered, totalWeight };
}

export function letterFor(score: number, scale: GradeScale = GRADE_SCALES[0]): { letter: string; point: number } {
  const step = scale.steps.find((s) => score >= s.min) ?? scale.steps[scale.steps.length - 1];
  return { letter: step.letter, point: step.point };
}
export function pointFor(letter: string, scale: GradeScale = GRADE_SCALES[0]): number | null {
  const s = scale.steps.find((x) => x.letter.toUpperCase() === letter.trim().toUpperCase());
  return s ? s.point : null;
}

/** Huruf & bobot mata kuliah: nilai manual bila ada, kalau tidak dari komponen nilai. */
export function courseGrade(c: Pick<Course, "finalLetter" | "grading">, scale: GradeScale = GRADE_SCALES[0]): { letter: string; point: number; projected: boolean } | null {
  if (c.finalLetter) {
    const p = pointFor(c.finalLetter, scale);
    return p === null ? null : { letter: c.finalLetter.toUpperCase(), point: p, projected: false };
  }
  const w = weightedScore(c.grading);
  if (w.score === null) return null;
  return { ...letterFor(w.score, scale), projected: w.covered < w.totalWeight };
}

/** IP (IPS untuk satu semester, IPK untuk semua): rata-rata bobot × SKS. */
export function gpa(courses: Pick<Course, "sks" | "finalLetter" | "grading" | "semester">[], scale: GradeScale = GRADE_SCALES[0], semester?: string): { ip: number | null; sks: number; projected: boolean } {
  let sum = 0;
  let sks = 0;
  let projected = false;
  for (const c of courses) {
    if (semester && c.semester !== semester) continue;
    const g = courseGrade(c, scale);
    if (!g || !c.sks) continue;
    sum += g.point * c.sks;
    sks += c.sks;
    projected ||= g.projected;
  }
  return { ip: sks ? Math.round((sum / sks) * 100) / 100 : null, sks, projected };
}

/** Semester berjalan dari tanggal: Agustus–Januari = Ganjil, Februari–Juli = Genap. */
export function semesterOf(d = new Date()): string {
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  if (m >= 8) return `Ganjil ${y}/${y + 1}`;
  if (m === 1) return `Ganjil ${y - 1}/${y}`;
  return `Genap ${y - 1}/${y}`;
}

/** Kelas berikutnya hari ini (atau besok) untuk dasbor/widget. */
export function nextClasses(blocks: Item<TimeBlock>[], now = new Date(), limit = 4): Item<TimeBlock>[] {
  const today = dateKey(now);
  const min = now.getHours() * 60 + now.getMinutes();
  return blocks
    .filter((b) => b.kind === "kuliah" && b.attendance !== "batal" && (b.date > today || (b.date === today && b.end > min)))
    .sort((a, b) => a.date.localeCompare(b.date) || a.start - b.start)
    .slice(0, limit);
}
