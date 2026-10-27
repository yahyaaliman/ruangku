export type Repeat = "none" | "daily" | "weekdays" | "weekly" | "monthly";
export type Priority = "rendah" | "sedang" | "tinggi";

export interface RawRecord {
  id: string;
  kind: string;
  data: any;
  updatedAt: number;
  deleted?: boolean;
}

/** Isi data tanpa catatan waktu per field (`_ft`, dipakai backend untuk merge per field). */
export function dataOf<T>(data: unknown): T {
  if (!data || typeof data !== "object") return data as T;
  const { _ft: _ignored, ...rest } = data as Record<string, unknown>;
  return rest as T;
}

/** Record yang sudah "diratakan": isi data + id + updatedAt. */
export type Item<T> = T & { id: string; updatedAt: number };

export interface Reminder {
  title: string;
  notes?: string;
  dueAt: number;
  repeat: Repeat;
  leadMinutes?: number;
  done: boolean;
  doneAt?: number;
  priority?: Priority;
  category?: string;
  firedFor?: number;
  anchorDay?: number;
  completedCount?: number;
  projectId?: string;
}

export interface Objective {
  title: string;
  description?: string;
  period: string; // contoh: "2026-Q4"
  archived?: boolean;
  order?: number;
  projectId?: string;
}

export interface CheckIn {
  at: number;
  value: number;
  note?: string;
}

export interface KeyResult {
  objectiveId: string;
  title: string;
  start: number;
  target: number;
  current: number;
  unit?: string;
  history?: CheckIn[];
}

export type KpiDirection = "naik" | "turun";

export interface Kpi {
  name: string;
  unit?: string;
  target: number;
  direction: KpiDirection; // naik = makin besar makin baik
  objectiveId?: string;
  archived?: boolean;
  order?: number;
  projectId?: string;
}

export interface KpiEntry {
  kpiId: string;
  date: string; // YYYY-MM-DD
  value: number;
  note?: string;
}

export interface Note {
  title: string;
  body: string;
  tags: string[];
  pinned?: boolean;
  /** Catatan harian: tanggal YYYY-MM-DD yang dirujuk (opsional). */
  date?: string;
  /** Halaman induk (halaman bersarang) */
  parentId?: string;
  /** Ikon emoji halaman */
  icon?: string;
  /** Disimpan sebagai template, tidak tampil di pohon halaman */
  isTemplate?: boolean;
  projectId?: string;
  /** Ditempel di desktop sebagai sticky note */
  sticky?: { color?: StickyColor };
  /** Urutan manual di pohon halaman (seret-taruh di sidebar) */
  order?: number;
  /** Sampul halaman: "grad:<nama>" (gradasi bawaan) atau URL/data gambar */
  cover?: string;
  /** Halaman lebar penuh */
  wide?: boolean;
}

export type StickyColor = "kunyit" | "nila" | "daun" | "bata" | "abu";

export type BlockColor = "nila" | "kunyit" | "daun" | "bata" | "abu" | "ungu" | "laut" | "jambu" | "kopi";

/** Blok waktu aktivitas pada satu tanggal, dalam menit sejak 00:00. */
export interface TimeBlock {
  date: string; // YYYY-MM-DD
  start: number; // 0..1440
  end: number; // start < end <= 1440
  title: string;
  color?: BlockColor;
  done?: boolean;
  note?: string;
  /** Notifikasi: tidak diisi = ikuti pengaturan, angka = menit sebelum mulai, "off" = mati */
  notify?: number | "off";
  /** Blok untuk tugas tertentu (timeboxing) */
  taskId?: string;
  /** Dicatat oleh timer (waktu nyata, bukan rencana) */
  tracked?: boolean;
  projectId?: string;
  /** Jenis khusus: rapat atau kelas kuliah (tampil dengan ikon, tempat, dan tautan) */
  kind?: "rapat" | "kuliah";
  /** Tempat: ruang rapat / ruang kelas */
  location?: string;
  /** Tautan rapat/kelas daring (Zoom, Google Meet, Teams, …) */
  link?: string;
  /** Rapat yang diwakili blok ini */
  meetingId?: string;
  /** Mata kuliah yang diwakili blok ini */
  courseId?: string;
  /** Kuliah: sesi mingguan atau ujian asal blok ini */
  sessionId?: string;
  /** Kuliah: presensi pertemuan ini */
  attendance?: "hadir" | "izin" | "sakit" | "alpa" | "batal";
  /** Kuliah: topik pertemuan */
  topic?: string;
  /** Halaman catatan (catatan kuliah / notulen) */
  noteId?: string;
  /** Diubah manual: tidak ditimpa saat jadwal mingguan diperbarui */
  detached?: boolean;
}

export interface FileMeta {
  path: string;
  name: string;
  isDir: boolean;
  tags: string[];
  favorite?: boolean;
  projectId?: string;
}

export interface FsEntry {
  name: string;
  path: string;
  isDir: boolean;
  size: number;
  modified: number;
  ext: string;
  hidden: boolean;
}

export interface Place {
  label: string;
  path: string;
  kind: "folder" | "drive";
}

export interface SyncStatus {
  folder: string | null;
  deviceId: string;
  deviceName: string;
  lastSync: number | null;
  lastError: string | null;
}

export interface SyncReport {
  devicesRead: number;
  recordsPulled: number;
  recordsPushed: number;
  finishedAt: number;
  warnings: string[];
}

export interface WidgetConfig {
  visible: boolean;
  layer: "desktop" | "normal" | "top";
  clickThrough: boolean;
  effect: "none" | "blur" | "acrylic" | "mica";
  x: number | null;
  y: number | null;
  width: number;
  height: number;
}

export type WidgetSection = "ibadah" | "agenda" | "tasks" | "kpi" | "okr" | "notes";

/** Tampilan di dalam widget (disimpan di setting `widget_prefs`). */
export interface WidgetPrefs {
  tone: "gelap" | "terang";
  opacity: number; // 0..100, kepekatan latar
  scale: number; // 80..140 (%)
  radius: number; // 0..28 px
  sections: { id: WidgetSection; on: boolean }[];
  agendaCount: number;
  showSeconds: boolean;
  showClock: boolean;
  locked: boolean; // kunci posisi & ukuran
  /** Susunan isi: vertikal (bertumpuk) atau horizontal (berjajar ke samping) */
  orientation: "vertikal" | "horizontal";
  /** Ukuran grid jam di detail hari (%) */
  gridSize: number;
  /** Bagian yang sedang diciutkan */
  collapsed: WidgetSection[];
  /** Warna aksen widget ("bawaan" = mengikuti tema) */
  accent: BlockColor | "bawaan";
  /** Mode mini: hanya jam, agenda berikutnya, dan timer */
  mini: boolean;
  /** Ukuran jendela sebelum masuk mode mini */
  restore?: { w: number; h: number } | null;
}
