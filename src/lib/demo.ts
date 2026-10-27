// Database demo: enam proyek pengguna beserta subproyek, tugas, jadwal, OKR,
// KPI, catatan, evaluasi, ibadah, dan anggota tim. Semua tanggal relatif
// terhadap hari ini supaya demo selalu terasa "hidup".
// Setiap record demo diberi `demo: true` agar bisa dihapus sekaligus.
import type { RawRecord } from "./types";
import { addDays, dateKey, parseDateKey } from "./date";
import { classBlockId, courseOccurrences, type Course } from "./courses";

export const DEMO_STATE_KEY = "demo_state"; // "loaded" | "removed" | "skipped"

const DEF = [
  { id: "todo", label: "Belum mulai", color: "abu" },
  { id: "doing", label: "Dikerjakan", color: "nila" },
  { id: "review", label: "Ditinjau", color: "kunyit" },
  { id: "done", label: "Selesai", color: "daun", done: true },
];

export interface DemoOptions {
  /** Pratinjau browser: folder proyek diarahkan ke file system tiruan. */
  preview?: boolean;
  now?: Date;
}

export function demoRecords(opts: DemoOptions = {}): RawRecord[] {
  const now = opts.now ?? new Date();
  const ts = now.getTime();
  const today = dateKey(now);
  const d = (n: number) => dateKey(addDays(parseDateKey(today), n));
  const at = (dayOffset: number, h: number, m = 0) => {
    const x = parseDateKey(d(dayOffset));
    x.setHours(h, m, 0, 0);
    return x.getTime();
  };
  const year = now.getFullYear();
  const q = Math.floor(now.getMonth() / 3) + 1;
  const quarter = `${year}-Q${q}`;
  const out: RawRecord[] = [];
  const rec = (id: string, kind: string, data: Record<string, unknown>, demo = true) => out.push({ id, kind, data: demo ? { ...data, demo: true } : data, updatedAt: ts, deleted: false });
  const folder = (name: string) => (opts.preview ? `C:\\Users\\Saya\\Documents\\${name}` : undefined);

  // ---------- Anggota ----------
  const members: [string, Record<string, unknown>][] = [
    ["m-saya", { name: "Saya", email: "saya@example.com", role: "pemilik", isMe: true, color: "nila", notifyVia: [] }],
    ["m-rina", { name: "Rina Wulandari", email: "rina@example.com", role: "admin", wa: "0812-1111-2222", telegram: "rinaw", color: "jambu", notifyVia: ["telegram", "email"] }],
    ["m-bayu", { name: "Bayu Pratama", email: "bayu@example.com", role: "editor", wa: "0813-3333-4444", color: "laut", notifyVia: ["wa", "email"] }],
    ["m-sari", { name: "Sari Ramadhani", email: "sari@example.com", role: "kontributor", wa: "0857-5555-6666", color: "daun", notifyVia: ["wa"] }],
    ["m-hendra", { name: "Dr. Hendra Kusuma", email: "hendra@example.com", role: "pembaca", color: "kopi", notifyVia: ["email"] }],
  ];
  members.forEach(([id, m]) => rec(id, "member", m));

  // ---------- Proyek & subproyek ----------
  const P = (id: string, data: Record<string, unknown>) => rec(id, "project", { statuses: DEF, ...data });
  P("pj-internal", { name: "Internal", icon: "🏢", color: "laut", order: 1, description: "Operasional kantor, keuangan, dan dokumentasi internal.", leadId: "m-rina", folder: folder("Kantor") });
  P("pj-internal-ops", { name: "Operasional kantor", parentId: "pj-internal", color: "laut", order: 1 });
  P("pj-internal-keu", { name: "Keuangan & administrasi", parentId: "pj-internal", color: "laut", order: 2 });
  P("pj-internal-sop", { name: "SOP & dokumentasi", parentId: "pj-internal", color: "laut", order: 3, start: d(-20), end: d(40) });

  const sprint = [
    { id: "backlog", label: "Backlog", color: "abu" },
    { id: "sprint", label: "Sprint ini", color: "nila" },
    { id: "review", label: "Review", color: "kunyit" },
    { id: "rilis", label: "Rilis", color: "daun", done: true },
  ];
  P("pj-jitu", {
    name: "Jitu", icon: "🎯", color: "nila", order: 2, statuses: sprint, leadId: "m-saya", start: d(-35), end: d(110),
    description: "Aplikasi Jitu: dari beta ke rilis v1 dengan 100 pengguna aktif.",
    milestones: [
      { id: "ms-j1", title: "Rilis beta tertutup", date: d(-6), done: true },
      { id: "ms-j2", title: "Rilis beta publik", date: d(24) },
      { id: "ms-j3", title: "Rilis v1", date: d(75) },
    ],
    folder: folder("Jitu"),
  });
  P("pj-jitu-dev", { name: "Pengembangan aplikasi", parentId: "pj-jitu", color: "nila", order: 1, statuses: sprint, start: d(-35), end: d(75) });
  P("pj-jitu-mkt", { name: "Pemasaran digital", parentId: "pj-jitu", color: "ungu", order: 2, statuses: sprint, start: d(0), end: d(100) });
  P("pj-jitu-mitra", { name: "Kemitraan", parentId: "pj-jitu", color: "laut", order: 3, statuses: sprint, start: d(10), end: d(110) });

  P("pj-kuliah", {
    name: "Kuliah", icon: "🎓", color: "kunyit", order: 3, start: d(-62), end: d(54),
    description: "Semester ganjil: tugas, kuis, dan ujian.",
    milestones: [
      { id: "ms-k1", title: "UTS", date: d(-12), done: true },
      { id: "ms-k2", title: "UAS", date: d(47) },
    ],
  });
  P("pj-kuliah-ai", { name: "AI5101 Pemrograman Python", parentId: "pj-kuliah", color: "kunyit", order: 1 });
  P("pj-kuliah-stat", { name: "Statistika lanjut", parentId: "pj-kuliah", color: "kunyit", order: 2 });
  P("pj-kuliah-sem", { name: "Seminar & publikasi", parentId: "pj-kuliah", color: "kopi", order: 3 });

  P("pj-infaq", {
    name: "Penitipan Infaq", icon: "🤝", color: "daun", order: 4, start: `${year}-01-01`, end: `${year}-12-31`, leadId: "m-sari",
    description: "Menerima titipan infaq, menyalurkan tepat sasaran, dan melapor ke donatur.",
    milestones: [
      { id: "ms-i1", title: "Laporan triwulan 3", date: `${year}-10-10`, done: true },
      { id: "ms-i2", title: "Penyaluran akhir tahun", date: `${year}-12-20` },
    ],
  });
  P("pj-infaq-terima", { name: "Penerimaan dana", parentId: "pj-infaq", color: "daun", order: 1 });
  P("pj-infaq-salur", { name: "Penyaluran", parentId: "pj-infaq", color: "daun", order: 2 });
  P("pj-infaq-lapor", { name: "Laporan donatur", parentId: "pj-infaq", color: "daun", order: 3 });

  const hiring = [
    { id: "masuk", label: "Lamaran masuk", color: "abu" },
    { id: "berkas", label: "Seleksi berkas", color: "laut" },
    { id: "wawancara", label: "Wawancara", color: "nila" },
    { id: "tawaran", label: "Tawaran", color: "kunyit" },
    { id: "diterima", label: "Selesai", color: "daun", done: true },
  ];
  P("pj-rekrut", {
    fields: [
      { id: "f-sumber", name: "Sumber", type: "pilihan", options: ["LinkedIn", "Jobstreet", "Referral", "Kampus"] },
      { id: "f-gaji", name: "Ekspektasi gaji", type: "rupiah" },
      { id: "f-skor", name: "Skor wawancara", type: "angka" },
      { id: "f-cv", name: "Link CV", type: "tautan" },
    ],
    name: "Recruitment", icon: "🧑‍💻", color: "jambu", order: 5, statuses: hiring, start: d(-16), end: d(45), leadId: "m-rina",
    description: "Merekrut Backend Developer dan Admin Keuangan.",
    milestones: [
      { id: "ms-r1", title: "Shortlist final", date: d(6) },
      { id: "ms-r2", title: "Kandidat mulai kerja", date: d(40) },
    ],
    folder: folder("Recruitment"),
  });
  P("pj-rekrut-be", { name: "Backend Developer", parentId: "pj-rekrut", color: "jambu", order: 1, statuses: hiring, fields: [{ id: "f-stack", name: "Stack utama", type: "pilihan", options: ["Go", "Node.js", "Python", "Java"] }] });
  P("pj-rekrut-adm", { name: "Admin Keuangan", parentId: "pj-rekrut", color: "jambu", order: 2, statuses: hiring });
  P("pj-rekrut-onb", { name: "Onboarding karyawan baru", parentId: "pj-rekrut", color: "kopi", order: 3, start: d(35), end: d(55) });

  const thesis = [
    { id: "todo", label: "Belum", color: "abu" },
    { id: "doing", label: "Dikerjakan", color: "nila" },
    { id: "bimbingan", label: "Bimbingan", color: "kunyit" },
    { id: "done", label: "Selesai", color: "daun", done: true },
  ];
  P("pj-thesis", {
    name: "Riset Thesis", icon: "🔬", color: "ungu", order: 6, statuses: thesis, start: d(-70), end: d(150), leadId: "m-saya",
    description: "Thesis magister: dari proposal sampai sidang akhir.",
    milestones: [
      { id: "ms-t1", title: "Seminar proposal", date: d(20) },
      { id: "ms-t2", title: "Sidang progres", date: d(85) },
      { id: "ms-t3", title: "Sidang akhir", date: d(150) },
    ],
    folder: folder("Riset Thesis"),
  });
  P("pj-thesis-lit", { name: "Studi literatur", parentId: "pj-thesis", color: "ungu", order: 1, statuses: thesis, start: d(-70), end: d(10) });
  P("pj-thesis-data", { name: "Pengumpulan data", parentId: "pj-thesis", color: "ungu", order: 2, statuses: thesis, start: d(-5), end: d(45) });
  P("pj-thesis-exp", { name: "Eksperimen model", parentId: "pj-thesis", color: "ungu", order: 3, statuses: thesis, start: d(30), end: d(100) });
  P("pj-thesis-tulis", { name: "Penulisan bab", parentId: "pj-thesis", color: "ungu", order: 4, statuses: thesis, start: d(-30), end: d(145) });

  // ---------- OKR ----------
  rec("o-thesis", "objective", { title: "Proposal thesis disetujui pembimbing", period: quarter, projectId: "pj-thesis", description: "Masuk tahap pengumpulan data dengan proposal yang kuat." });
  rec("o-jitu", "objective", { title: "Jitu siap rilis dengan 100 pengguna aktif", period: quarter, projectId: "pj-jitu" });
  rec("o-infaq", "objective", { title: "Infaq tersalurkan tepat waktu dan transparan", period: quarter, projectId: "pj-infaq" });
  rec("o-rekrut", "objective", { title: "Tim bertambah dua orang tepat waktu", period: quarter, projectId: "pj-rekrut" });
  rec("o-kuliah", "objective", { title: "IPK semester ini minimal 3,75", period: quarter, projectId: "pj-kuliah" });
  rec("o-internal", "objective", { title: "Operasional kantor rapi dan terdokumentasi", period: quarter, projectId: "pj-internal" });
  rec("o-pribadi", "objective", { title: "Tumbuh sebagai pribadi", period: quarter });
  const hist = (vals: number[], note?: string) => vals.map((v, i) => ({ at: at(-(vals.length - i) * 6, 20), value: v, note: i === vals.length - 1 ? note : undefined }));
  const KR = (id: string, objectiveId: string, title: string, start: number, target: number, current: number, unit: string, h: number[] = []) =>
    rec(id, "keyresult", { objectiveId, title, start, target, current, unit, history: hist([...h, current]) });
  KR("kr-t1", "o-thesis", "Paper relevan direview", 0, 40, 28, "paper", [8, 15, 21]);
  KR("kr-t2", "o-thesis", "Bab 1–3 proposal selesai", 0, 3, 2, "bab", [0, 1]);
  KR("kr-t3", "o-thesis", "Sampel data terkumpul", 0, 500, 180, "sampel", [0, 60]);
  KR("kr-j1", "o-jitu", "Fitur inti selesai", 4, 12, 8, "fitur", [5, 6, 7]);
  KR("kr-j2", "o-jitu", "Pengguna aktif beta", 0, 100, 46, "pengguna", [12, 25, 38]);
  KR("kr-j3", "o-jitu", "Rating rata-rata pengguna", 3.8, 4.5, 4.2, "bintang", [3.9, 4.1]);
  KR("kr-i1", "o-infaq", "Dana tersalurkan", 0, 120, 86, "juta Rp", [40, 61, 75]);
  KR("kr-i2", "o-infaq", "Laporan donatur terkirim", 0, 4, 3, "laporan", [1, 2]);
  KR("kr-i3", "o-infaq", "Penerima manfaat terlayani", 0, 300, 236, "orang", [120, 180]);
  KR("kr-r1", "o-rekrut", "Kandidat diwawancara", 0, 12, 6, "kandidat", [2, 4]);
  KR("kr-r2", "o-rekrut", "Posisi terisi", 0, 2, 0, "posisi");
  KR("kr-k1", "o-kuliah", "Tugas terkumpul tepat waktu", 0, 12, 9, "tugas", [5, 7]);
  KR("kr-k2", "o-kuliah", "Nilai rata-rata kuis", 70, 85, 82, "poin", [76, 80]);
  KR("kr-n1", "o-internal", "SOP baru terdokumentasi", 0, 8, 5, "SOP", [2, 3, 4]);
  KR("kr-p1", "o-pribadi", "Buku selesai dibaca", 0, 6, 2, "buku", [1]);

  // ---------- Tugas ----------
  let order = 0;
  const T = (id: string, data: Record<string, unknown>) =>
    rec(id, "task", { tags: [], checklist: [], dependsOn: [], createdAt: ts - 86400000 * 10, order: ++order, status: "todo", ...data });
  const done = (n: number) => ({ completedAt: at(n, 16) });
  const cl = (...items: [string, boolean][]) => items.map(([text, isDone], i) => ({ id: `c${i}`, text, done: isDone }));

  // Riset Thesis
  T("t-th1", { title: "Review 40 paper metode klasifikasi teks", projectId: "pj-thesis-lit", status: "doing", start: d(-40), due: d(6), estimate: 1200, priority: "tinggi", krId: "kr-t1", krIncrement: 0, tags: ["literatur"], assignees: ["m-saya"],
    checklist: cl(["Transformer untuk teks pendek", true], ["Data augmentation", true], ["Few-shot learning", false], ["Evaluasi bahasa Indonesia", false]) });
  T("t-th2", { title: "Tulis Bab 1 Pendahuluan", projectId: "pj-thesis-tulis", status: "done", start: d(-25), due: d(-14), ...done(-15), estimate: 600, krId: "kr-t2", assignees: ["m-saya"] });
  T("t-th3", { title: "Tulis Bab 2 Tinjauan Pustaka", projectId: "pj-thesis-tulis", status: "bimbingan", start: d(-13), due: d(-2), dependsOn: ["t-th2"], estimate: 900, krId: "kr-t2", priority: "tinggi", assignees: ["m-saya"] });
  T("t-th4", { title: "Tulis Bab 3 Metodologi", projectId: "pj-thesis-tulis", status: "doing", start: d(-1), due: d(9), dependsOn: ["t-th3"], estimate: 900, krId: "kr-t2", priority: "tinggi", tags: ["menulis"], assignees: ["m-saya"] });
  T("t-th4a", { title: "Diagram alur penelitian", projectId: "pj-thesis-tulis", parentId: "t-th4", status: "done", ...done(-1), estimate: 60 });
  T("t-th4b", { title: "Rancangan eksperimen & metrik evaluasi", projectId: "pj-thesis-tulis", parentId: "t-th4", status: "doing", due: d(3), estimate: 180 });
  T("t-th4c", { title: "Rencana pengumpulan data", projectId: "pj-thesis-tulis", parentId: "t-th4", status: "todo", due: d(6), estimate: 120 });
  T("t-th5", { title: "Bimbingan dengan Dr. Hendra", projectId: "pj-thesis", status: "todo", due: d(2), dueTime: 10 * 60, estimate: 60, priority: "tinggi", recurrence: { freq: "weekly", interval: 2 }, assignees: ["m-saya"] });
  T("t-th6", { title: "Siapkan slide seminar proposal", projectId: "pj-thesis", status: "todo", start: d(12), due: d(18), dependsOn: ["t-th4"], estimate: 360, priority: "sedang" });
  T("t-th7", { title: "Susun kuesioner & izin etik", projectId: "pj-thesis-data", status: "doing", start: d(-4), due: d(4), estimate: 240, priority: "tinggi" });
  T("t-th8", { title: "Kumpulkan 500 sampel data", projectId: "pj-thesis-data", status: "todo", start: d(5), due: d(40), dependsOn: ["t-th7"], estimate: 1800, krId: "kr-t3", krIncrement: 0 });
  T("t-th9", { title: "Baseline model: TF-IDF + regresi logistik", projectId: "pj-thesis-exp", status: "todo", start: d(30), due: d(45), estimate: 600 });
  T("t-th10", { title: "Fine-tuning IndoBERT", projectId: "pj-thesis-exp", status: "todo", start: d(46), due: d(80), dependsOn: ["t-th9"], estimate: 1800 });
  // Jitu
  T("t-j1", { title: "Halaman onboarding pengguna baru", projectId: "pj-jitu-dev", status: "sprint", start: d(-3), due: d(3), estimate: 480, priority: "tinggi", krId: "kr-j1", tags: ["frontend"], assignees: ["m-bayu"] });
  T("t-j2", { title: "Notifikasi push pengingat", projectId: "pj-jitu-dev", status: "review", start: d(-8), due: d(-1), estimate: 360, priority: "sedang", krId: "kr-j1", tags: ["backend"], assignees: ["m-bayu"] });
  T("t-j3", { title: "Perbaiki crash saat login Google", projectId: "pj-jitu-dev", status: "sprint", due: d(0), dueTime: 15 * 60, estimate: 120, priority: "urgent", tags: ["bug"], assignees: ["m-saya", "m-bayu"] });
  T("t-j4", { title: "Ekspor laporan ke PDF", projectId: "pj-jitu-dev", status: "backlog", start: d(8), due: d(20), estimate: 600, krId: "kr-j1" });
  T("t-j5", { title: "Sinkronisasi offline", projectId: "pj-jitu-dev", status: "backlog", start: d(20), due: d(45), dependsOn: ["t-j4"], estimate: 1440, krId: "kr-j1" });
  T("t-j6", { title: "Sistem pembayaran langganan", projectId: "pj-jitu-dev", status: "rilis", start: d(-30), due: d(-12), ...done(-12), estimate: 960, krId: "kr-j1" });
  T("t-j7", { title: "Kampanye Instagram beta publik", projectId: "pj-jitu-mkt", status: "sprint", start: d(1), due: d(22), estimate: 600, priority: "sedang", tags: ["konten"], assignees: ["m-rina"],
    checklist: cl(["Kalender konten 4 minggu", true], ["Desain 12 feed", false], ["Video demo 30 detik", false]) });
  T("t-j8", { title: "Landing page beta publik", projectId: "pj-jitu-mkt", status: "sprint", start: d(-2), due: d(10), estimate: 480, priority: "tinggi", assignees: ["m-bayu"] });
  T("t-j9", { title: "Jajaki kerja sama dengan 3 komunitas", projectId: "pj-jitu-mitra", status: "backlog", start: d(10), due: d(30), estimate: 300, assignees: ["m-rina"] });
  T("t-j10", { title: "Sprint planning mingguan", projectId: "pj-jitu", status: "sprint", due: d(((8 - now.getDay()) % 7) || 7), dueTime: 9 * 60, estimate: 60, recurrence: { freq: "weekly", interval: 1 } });
  // Kuliah
  T("t-k1", { title: "Tugas 4: curve fitting & cross-validation", projectId: "pj-kuliah-ai", status: "doing", due: d(1), dueTime: 23 * 60 + 59, estimate: 240, priority: "tinggi", krId: "kr-k1", tags: ["tugas"],
    checklist: cl(["polyfit derajat 1–5", true], ["Plot R² vs derajat", false], ["k-fold cross-validation", false]) });
  T("t-k2", { title: "Kuis Monte Carlo & random walk", projectId: "pj-kuliah-ai", status: "todo", due: d(5), dueTime: 13 * 60, estimate: 90, priority: "sedang" });
  T("t-k3", { title: "Tugas 3: knapsack dynamic programming", projectId: "pj-kuliah-ai", status: "done", due: d(-6), ...done(-7), estimate: 240, krId: "kr-k1" });
  T("t-k4", { title: "Latihan soal regresi berganda", projectId: "pj-kuliah-stat", status: "todo", due: d(3), estimate: 120 });
  T("t-k5", { title: "Ringkasan paper untuk seminar kelas", projectId: "pj-kuliah-sem", status: "todo", start: d(4), due: d(11), estimate: 300 });
  T("t-k6", { title: "Belajar UAS: Big O & graf", projectId: "pj-kuliah", status: "todo", start: d(35), due: d(46), estimate: 900 });
  // Penitipan Infaq
  T("t-i1", { title: "Rekap infaq masuk minggu ini", projectId: "pj-infaq-terima", status: "todo", due: d(((5 - now.getDay() + 7) % 7) || 7), estimate: 60, recurrence: { freq: "weekly", interval: 1 }, assignees: ["m-sari"], tags: ["rutin"] });
  T("t-i2", { title: "Verifikasi 12 calon penerima manfaat", projectId: "pj-infaq-salur", status: "doing", start: d(-3), due: d(4), estimate: 360, priority: "tinggi", assignees: ["m-sari"] });
  T("t-i3", { title: "Penyaluran paket sembako ke panti", projectId: "pj-infaq-salur", status: "todo", due: d(9), estimate: 240, dependsOn: ["t-i2"], assignees: ["m-sari", "m-saya"], krId: "kr-i3", krIncrement: 40 });
  T("t-i4", { title: "Laporan donatur triwulan 4", projectId: "pj-infaq-lapor", status: "todo", start: d(50), due: d(62), estimate: 300, krId: "kr-i2" });
  T("t-i5", { title: "Kirim bukti penyaluran ke donatur", projectId: "pj-infaq-lapor", status: "done", due: d(-4), ...done(-4), estimate: 45, assignees: ["m-sari"] });
  T("t-i6", { title: "Rekonsiliasi rekening infaq Oktober", projectId: "pj-infaq-terima", status: "todo", due: d(-1), estimate: 90, priority: "tinggi", tags: ["keuangan"] });
  // Recruitment
  T("t-r1", { title: "Andi S. — Backend Developer", projectId: "pj-rekrut-be", status: "wawancara", due: d(1), dueTime: 14 * 60, estimate: 60, assignees: ["m-rina"], description: "5 tahun Go & PostgreSQL. Portofolio kuat.", custom: { "f-sumber": "LinkedIn", "f-gaji": 14000000, "f-skor": 82, "f-cv": "https://drive.example.com/cv-andi", "f-stack": "Go" } });
  T("t-r2", { title: "Maya P. — Backend Developer", projectId: "pj-rekrut-be", status: "berkas", due: d(3), estimate: 30, assignees: ["m-rina"], custom: { "f-sumber": "Jobstreet", "f-gaji": 11500000, "f-stack": "Node.js" } });
  T("t-r3", { title: "Fikri A. — Backend Developer", projectId: "pj-rekrut-be", status: "tawaran", due: d(2), estimate: 30, priority: "tinggi", assignees: ["m-saya"], custom: { "f-sumber": "Referral", "f-gaji": 15000000, "f-skor": 88, "f-stack": "Go" } });
  T("t-r4", { title: "Lina K. — Admin Keuangan", projectId: "pj-rekrut-adm", status: "wawancara", due: d(4), dueTime: 10 * 60, estimate: 45, assignees: ["m-rina"], custom: { "f-sumber": "Kampus", "f-gaji": 6500000, "f-skor": 74 } });
  T("t-r5", { title: "Dewi R. — Admin Keuangan", projectId: "pj-rekrut-adm", status: "masuk", estimate: 20, custom: { "f-sumber": "Jobstreet", "f-gaji": 6000000 } });
  T("t-r6", { title: "Pasang lowongan di 3 portal kerja", projectId: "pj-rekrut", status: "diterima", due: d(-14), ...done(-14), estimate: 60 });
  T("t-r7", { title: "Siapkan laptop & akun karyawan baru", projectId: "pj-rekrut-onb", status: "todo", start: d(33), due: d(38), estimate: 120, assignees: ["m-bayu"] });
  // Internal
  T("t-n1", { title: "Bayar tagihan listrik & internet kantor", projectId: "pj-internal-keu", status: "todo", due: d(0), estimate: 20, priority: "tinggi", recurrence: { freq: "monthly", interval: 1 }, tags: ["keuangan"] });
  T("t-n2", { title: "SOP pengajuan reimburse", projectId: "pj-internal-sop", status: "doing", due: d(5), estimate: 180, krId: "kr-n1", assignees: ["m-rina"] });
  T("t-n3", { title: "SOP pengadaan barang", projectId: "pj-internal-sop", status: "todo", due: d(15), estimate: 180, krId: "kr-n1" });
  T("t-n4", { title: "Rapat bulanan tim", projectId: "pj-internal-ops", status: "todo", due: d(4), dueTime: 9 * 60, estimate: 90, assignees: ["m-saya", "m-rina", "m-bayu"] });
  T("t-n5", { title: "Perpanjang domain & hosting", projectId: "pj-internal-ops", status: "todo", due: d(-2), estimate: 15, priority: "urgent" });
  // Inbox
  T("t-x1", { title: "Beli hadiah ulang tahun ibu", projectId: "inbox", due: d(5), tags: ["pribadi"] });
  T("t-x2", { title: "Rapikan folder Downloads", projectId: "inbox", estimate: 30 });

  // ---------- Blok waktu (rencana hari ini & besok) ----------
  const B = (id: string, day: number, s: number, e: number, title: string, data: Record<string, unknown> = {}) =>
    rec(id, "timeblock", { date: d(day), start: s, end: e, title, ...data });
  const H = (h: number, m = 0) => h * 60 + m;
  B("b-1", 0, H(5, 30), H(6, 30), "Tilawah & dzikir pagi", { color: "daun", done: true });
  B("b-2", 0, H(7, 30), H(9, 30), "Menulis Bab 3 Metodologi", { color: "ungu", projectId: "pj-thesis-tulis", taskId: "t-th4", done: true });
  B("b-3", 0, H(9, 45), H(11, 30), "Perbaiki crash login Google", { color: "nila", projectId: "pj-jitu-dev", taskId: "t-j3" });
  B("b-4", 0, H(13, 0), H(14, 0), "Wawancara Andi (Backend)", { color: "jambu", projectId: "pj-rekrut-be", taskId: "t-r1" });
  B("b-5", 0, H(14, 30), H(15, 30), "Verifikasi calon penerima", { color: "daun", projectId: "pj-infaq-salur", taskId: "t-i2" });
  B("b-6", 0, H(16, 0), H(17, 30), "Tugas 4 AI5101", { color: "kunyit", projectId: "pj-kuliah-ai", taskId: "t-k1" });
  B("b-7", 0, H(20, 0), H(20, 30), "Evaluasi harian", { color: "abu" });
  B("b-8", 1, H(8, 0), H(10, 0), "Review paper few-shot", { color: "ungu", projectId: "pj-thesis-lit", taskId: "t-th1" });
  B("b-10", 1, H(13, 30), H(15, 0), "Landing page beta", { color: "nila", projectId: "pj-jitu-mkt", taskId: "t-j8" });

  // Waktu tercatat (timer) 14 hari terakhir, untuk grafik evaluasi.
  const tracks: [string, string, string, number][] = [
    ["pj-thesis-tulis", "t-th4", "ungu", 110],
    ["pj-thesis-lit", "t-th1", "ungu", 80],
    ["pj-jitu-dev", "t-j1", "nila", 120],
    ["pj-kuliah-ai", "t-k1", "kunyit", 70],
    ["pj-infaq-salur", "t-i2", "daun", 45],
    ["pj-rekrut-be", "t-r1", "jambu", 40],
    ["pj-internal-sop", "t-n2", "laut", 35],
  ];
  for (let i = 14; i >= 1; i--) {
    const wd = parseDateKey(d(-i)).getDay();
    let start = H(8);
    tracks.forEach(([projectId, taskId, color, base], j) => {
      const wave = Math.sin((i + j * 2) / 2.2);
      let mins = Math.round((base * (wd === 0 || wd === 6 ? 0.35 : 1) * (0.7 + 0.45 * wave)) / 5) * 5;
      if ((i + j) % 5 === 0) mins = 0;
      if (mins < 15) return;
      if (start + mins > H(22)) return;
      rec(`trk-${i}-${j}`, "timeblock", { date: d(-i), start, end: start + mins, title: "", color, projectId, taskId, tracked: true });
      start += mins + 15;
    });
  }

  // ---------- KPI harian ----------
  const KPI = (id: string, data: Record<string, unknown>) => rec(id, "kpi", data);
  KPI("kpi-tulis", { name: "Jam menulis thesis", unit: "jam", target: 2, direction: "naik", order: 1, projectId: "pj-thesis", objectiveId: "o-thesis" });
  KPI("kpi-tiket", { name: "Tiket support selesai", unit: "tiket", target: 10, direction: "naik", order: 2, projectId: "pj-jitu" });
  KPI("kpi-bug", { name: "Bug kritis terbuka", unit: "bug", target: 2, direction: "turun", order: 3, projectId: "pj-jitu-dev" });
  KPI("kpi-infaq", { name: "Infaq masuk", unit: "juta Rp", target: 3, direction: "naik", order: 4, projectId: "pj-infaq" });
  KPI("kpi-kandidat", { name: "Kandidat dihubungi", unit: "orang", target: 5, direction: "naik", order: 5, projectId: "pj-rekrut" });
  KPI("kpi-belajar", { name: "Jam belajar mandiri", unit: "jam", target: 2, direction: "naik", order: 6, projectId: "pj-kuliah" });
  KPI("kpi-langkah", { name: "Langkah kaki", unit: "ribu", target: 8, direction: "naik", order: 7 });
  const kpiGen: [string, (i: number, w: number, wd: number) => number][] = [
    ["kpi-tulis", (i, w) => Math.max(0, +(1.6 + w * 0.9 + (28 - i) * 0.015).toFixed(1))],
    ["kpi-tiket", (i, w, wd) => (wd === 0 || wd === 6 ? 2 : Math.round(8 + w * 3 + (28 - i) * 0.08))],
    ["kpi-bug", (i, w) => Math.max(0, Math.round(3 - w * 1.5 - (28 - i) * 0.05))],
    ["kpi-infaq", (_i, w, wd) => +(wd === 5 ? 6.5 + w : 2.2 + w * 1.1).toFixed(1)],
    ["kpi-kandidat", (_i, w, wd) => (wd === 0 || wd === 6 ? 0 : Math.max(0, Math.round(4 + w * 2)))],
    ["kpi-belajar", (_i, w) => Math.max(0, +(1.8 + w * 0.8).toFixed(1))],
    ["kpi-langkah", (_i, w) => +(7 + w * 2.4).toFixed(1)],
  ];
  for (let i = 28; i >= 1; i--) {
    const k = d(-i);
    const wd = parseDateKey(k).getDay();
    kpiGen.forEach(([kpiId, f], j) => {
      if ((i * 7 + j) % 11 === 0) return; // sesekali lupa mengisi
      rec(`${kpiId}:${k}`, "kpientry", { kpiId, date: k, value: f(i, Math.sin(i / 2.6 + j), wd) });
    });
  }

  // ---------- Catatan ----------
  const N = (id: string, data: Record<string, unknown>) => rec(id, "note", { tags: [], ...data });
  N("n-th-kerangka", { title: "Kerangka thesis", icon: "🔬", projectId: "pj-thesis", pinned: true, body: "## Judul kerja\nKlasifikasi teks pendek berbahasa Indonesia dengan few-shot learning.\n\n## Pertanyaan penelitian\n1. Seberapa baik model few-shot dibanding fine-tuning penuh?\n2. Augmentasi data apa yang paling membantu?\n\n## Bab\n- [x] Bab 1 Pendahuluan\n- [ ] Bab 2 Tinjauan Pustaka (menunggu bimbingan)\n- [ ] Bab 3 Metodologi\n\nLihat juga [Catatan bimbingan](note:n-th-bimbingan).", tags: ["thesis"] });
  N("n-th-bab1", { title: "Bab 1 Pendahuluan", icon: "📄", projectId: "pj-thesis", parentId: "n-th-kerangka", body: "## Latar belakang\nVolume teks pendek (ulasan, komentar) terus naik, sementara data berlabel berbahasa Indonesia terbatas.\n\n## Rumusan masalah\n…" });
  N("n-th-pustaka", { title: "Daftar pustaka utama", icon: "📚", projectId: "pj-thesis-lit", parentId: "n-th-kerangka", body: "- Devlin dkk. (2019) — BERT\n- Wilie dkk. (2020) — IndoNLU\n- Brown dkk. (2020) — Few-shot learners\n- Wei & Zou (2019) — EDA augmentation" });
  N("n-th-bimbingan", { title: "Catatan bimbingan", icon: "🗣️", projectId: "pj-thesis", date: d(-12), body: "## Masukan Dr. Hendra\n- Perjelas kontribusi di Bab 1\n- Tambahkan pembanding non-deep-learning sebagai baseline\n- [ ] Kirim revisi Bab 2 sebelum bimbingan berikutnya", tags: ["bimbingan"] });
  N("n-jitu-roadmap", { title: "Roadmap fitur Jitu", icon: "🎯", projectId: "pj-jitu", pinned: true, body: "## Sebelum beta publik\n- [x] Pembayaran langganan\n- [ ] Onboarding\n- [ ] Notifikasi pengingat\n\n## Menuju v1\n- [ ] Ekspor PDF\n- [ ] Sinkronisasi offline\n\n> Prioritas: stabilitas login dulu, baru fitur baru.", tags: ["produk"] });
  N("n-jitu-sprint", { title: "Notulen sprint planning", icon: "📝", projectId: "pj-jitu-dev", date: d(-7), body: "Hadir: Saya, Bayu, Rina.\n\n- Fokus sprint: onboarding & notifikasi\n- **Bayu**: notifikasi push\n- **Rina**: konten kampanye beta", tags: ["rapat"] });
  N("n-rekrut-tanya", { title: "Pertanyaan wawancara backend", icon: "🧑‍💻", projectId: "pj-rekrut-be", body: "1. Ceritakan sistem yang pernah Anda skalakan.\n2. Bagaimana Anda mendesain idempotensi API pembayaran?\n3. Kapan memilih antrean pesan dibanding panggilan langsung?\n4. Studi kasus: query lambat di PostgreSQL.", tags: ["rekrut"] });
  N("n-rekrut-rubrik", { title: "Rubrik penilaian kandidat", icon: "📊", projectId: "pj-rekrut", body: "- **Teknis** — 40%\n- **Pemecahan masalah** — 25%\n- **Komunikasi** — 20%\n- **Kecocokan budaya** — 15%\n\nSkor ≥ 75 lanjut ke tahap tawaran." });
  N("n-infaq-sop", { title: "SOP penerimaan titipan infaq", icon: "🤝", projectId: "pj-infaq-terima", body: "1. Terima dana hanya lewat rekening resmi.\n2. Catat nama donatur, nominal, dan amanah peruntukan.\n3. Kirim tanda terima dalam 1×24 jam.\n4. Rekap mingguan setiap Jumat.", tags: ["sop"] });
  N("n-infaq-penerima", { title: "Kriteria penerima manfaat", icon: "📋", projectId: "pj-infaq-salur", body: "- Yatim dan dhuafa di sekitar kantor\n- Lansia tanpa penghasilan tetap\n- Santri penghafal Al-Qur'an\n\nVerifikasi: kunjungan langsung + rekomendasi RT." });
  N("n-kuliah-cf", { title: "AI5101 — curve fitting & overfitting", icon: "🎓", projectId: "pj-kuliah-ai", body: "## Inti\n- R² tinggi di data latih belum tentu bagus di data uji.\n- Gunakan cross-validation untuk memilih derajat polinomial.\n\n```python\nimport numpy as np\ncoef = np.polyfit(x, y, deg)\n```", tags: ["kuliah"] });
  N("n-internal-rapat", { title: "Agenda rapat bulanan", icon: "🏢", projectId: "pj-internal-ops", body: "- Evaluasi target bulan lalu\n- Rencana rekrutmen\n- Anggaran operasional\n- Lain-lain" });
  N("n-harian", { title: `Catatan ${d(0)}`, date: d(0), body: "- Crash login Google: dugaan dari token kedaluwarsa\n- Ingat: konfirmasi jadwal seminar proposal", tags: ["harian"] });

  // ---------- Reminder ----------
  const R = (id: string, data: Record<string, unknown>) => rec(id, "reminder", { done: false, repeat: "none", ...data });
  R("r-standup", { title: "Stand-up tim Jitu", dueAt: at(0, 9), repeat: "weekdays", priority: "sedang", category: "Kerja", projectId: "pj-jitu" });
  R("r-jumat", { title: "Rekap infaq & kirim tanda terima", dueAt: at(((5 - now.getDay() + 7) % 7) || 7, 15), repeat: "weekly", priority: "tinggi", category: "Amanah", projectId: "pj-infaq" });
  R("r-seminar", { title: "Daftar seminar proposal ke prodi", dueAt: at(3, 10), priority: "tinggi", category: "Kuliah", projectId: "pj-thesis", leadMinutes: 60 });
  R("r-olahraga", { title: "Olahraga sore", dueAt: at(0, 17, 30), repeat: "daily", priority: "rendah", category: "Pribadi" });

  // ---------- Evaluasi & ibadah ----------
  const obstacles = ["Rapat mendadak siang", "Kurang tidur", "Notifikasi chat terus", "Revisi mendadak dari klien", "Hujan, telat berangkat", "Server Jitu sempat down"];
  for (let i = 1; i <= 6; i++) {
    const k = d(-i);
    rec(`day:${k}`, "review", { type: "day", key: k, energy: [4, 3, 2, 4, 3, 4][i - 1], mood: [4, 4, 3, 5, 3, 4][i - 1], answers: { good: ["Fokus menulis 2 jam pagi", "Bug pembayaran beres", "Wawancara kandidat lancar", "Bimbingan produktif", "Penyaluran tepat waktu", "Tugas kuliah selesai lebih awal"][i - 1], obstacle: obstacles[i - 1], tomorrow: "Lanjutkan Bab 3" } });
  }
  const pat = ["masjid", "jamaah", "awal", "masjid", "sendiri", "masjid", "jamaah"];
  for (let i = 13; i >= 0; i--) {
    const k = d(-i);
    const prayers: Record<string, string> = {};
    ["subuh", "dzuhur", "ashar", "maghrib", "isya"].forEach((n, j) => {
      if (i === 0 && j > 1) return;
      prayers[n] = pat[(i + j * 3) % pat.length];
    });
    const items: Record<string, number> = { dzikir_pagi: 1, tilawah: i === 0 ? 6 : 10 + ((i * 7) % 12), qabliyah_subuh: 1, badiyah_maghrib: i % 2 };
    if (i % 3 !== 0) items.dhuha = 4;
    if (i % 2 === 0) Object.assign(items, { dzikir_petang: 1, witir: 3, istighfar: 100, sholawat: 100 });
    if (i % 4 === 1) items.tahajud = 4;
    if (i % 3 === 1) items.sedekah = 1;
    rec(`ibadah:${k}`, "ibadahlog", { date: k, prayers, items });
  }

  // ---------- Buku kas Penitipan Infaq ----------
  const L = (id: string, off: number, type: "masuk" | "keluar", amount: number, extra: Record<string, unknown>) => rec(id, "ledger", { date: d(off), type, amount, category: type === "masuk" ? "Infaq" : "Penyaluran", method: "transfer", projectId: type === "masuk" ? "pj-infaq-terima" : "pj-infaq-salur", accountId: "acc-infaq", ...extra });
  L("ld-1", -58, "masuk", 5_000_000, { party: "Hj. Siti Aminah", ref: "TRF-0812" });
  L("ld-2", -52, "masuk", 1_500_000, { party: "Hamba Allah", method: "tunai" });
  L("ld-3", -45, "keluar", 3_200_000, { party: "Panti Asuhan Al-Ikhlas", description: "Paket sembako 40 anak" });
  L("ld-4", -38, "masuk", 2_500_000, { party: "Bapak Rahmat", category: "Sedekah", ref: "TRF-0931" });
  L("ld-5", -30, "masuk", 750_000, { party: "Hamba Allah", method: "qris" });
  L("ld-6", -26, "keluar", 150_000, { category: "Operasional", description: "Transport survei penerima", method: "tunai", projectId: "pj-infaq" });
  L("ld-7", -21, "masuk", 5_000_000, { party: "Hj. Siti Aminah", ref: "TRF-1007" });
  L("ld-8", -16, "keluar", 4_500_000, { party: "Keluarga dhuafa RW 05", description: "Bantuan biaya sekolah 15 anak" });
  L("ld-9", -9, "masuk", 1_000_000, { party: "Ibu Nur Aini", ref: "TRF-1019" });
  L("ld-10", -6, "masuk", 2_000_000, { party: "Bapak Rahmat", category: "Sedekah", ref: "TRF-1022" });
  L("ld-11", -4, "keluar", 6_500, { category: "Biaya bank", description: "Biaya administrasi bulanan", projectId: "pj-infaq" });
  L("ld-12", -2, "masuk", 500_000, { party: "Hamba Allah", method: "qris" });

  // ---------- Keuangan pribadi & proyek ----------
  // Tanggal pada bulan relatif (0 = bulan ini), dipotong ke hari terakhir bulan. Transaksi masa depan dilewati.
  const md = (monthsAgo: number, day: number) => {
    const x = new Date(now.getFullYear(), now.getMonth() - monthsAgo, 1);
    const last = new Date(x.getFullYear(), x.getMonth() + 1, 0).getDate();
    x.setDate(Math.min(day, last));
    return dateKey(x);
  };
  const ACC = (id: string, data: Record<string, unknown>) => rec(id, "account", { opening: 0, openingDate: md(3, 1), ...data });
  ACC("acc-bca", { name: "BCA", type: "bank", opening: 4_200_000, color: "nila", order: 1 });
  ACC("acc-gopay", { name: "GoPay", type: "ewallet", opening: 150_000, color: "laut", order: 2 });
  ACC("acc-tunai", { name: "Dompet", type: "tunai", opening: 300_000, color: "kunyit", order: 3 });
  ACC("acc-infaq", { name: "Rekening Infaq (BSI)", type: "bank", opening: 0, openingDate: d(-60), color: "daun", projectId: "pj-infaq", order: 4 });
  ACC("acc-jitu", { name: "Kas proyek Jitu", type: "bank", opening: 15_000_000, color: "ungu", projectId: "pj-jitu", order: 5 });
  let pn = 0;
  const PX = (date: string, type: "masuk" | "keluar" | "transfer", amount: number, category: string, extra: Record<string, unknown> = {}) => {
    if (date > today) return;
    rec(`ld-p${++pn}`, "ledger", { date, type, amount, category, method: "transfer", accountId: "acc-bca", ...extra });
  };
  for (let m = 3; m >= 0; m--) {
    const bump = (3 - m) * 37_000;
    PX(md(m, 25), "masuk", 8_500_000, "Gaji", { party: "PT Contoh Sejahtera", description: "Gaji bulanan", recurringId: "rec-gaji" });
    PX(md(m, 1), "keluar", 1_800_000, "Rumah & cicilan", { party: "Ibu kos", description: "Sewa kos", recurringId: "rec-kos" });
    PX(md(m, 10), "keluar", 385_000, "Pulsa & internet", { party: "IndiHome", description: "Internet rumah", recurringId: "rec-internet" });
    PX(md(m, 15), "keluar", 54_990, "Hiburan", { party: "Spotify", description: "Langganan musik", accountId: "acc-gopay", method: "ewallet", recurringId: "rec-spotify" });
    PX(md(m, 2), "transfer", 500_000, "Transfer", { accountId: "acc-bca", toAccountId: "acc-gopay", description: "Isi saldo GoPay" });
    PX(md(m, 3), "transfer", 600_000, "Transfer", { accountId: "acc-bca", toAccountId: "acc-tunai", description: "Tarik tunai" });
    [4, 7, 9, 12, 14, 17, 19, 22, 24, 27].forEach((day, i) => PX(md(m, day), "keluar", 18_000 + ((i * 7919 + m * 104_729) % 47) * 1000 + bump / 10, "Makan & minum", { description: ["Makan siang", "Kopi", "Makan malam", "GoFood"][i % 4], accountId: i % 3 === 0 ? "acc-tunai" : "acc-gopay", method: i % 3 === 0 ? "tunai" : "ewallet" }));
    [5, 11, 18, 26].forEach((day, i) => PX(md(m, day), "keluar", 25_000 + i * 12_000, "Transportasi", { description: i % 2 ? "Bensin" : "Gojek", accountId: i % 2 ? "acc-tunai" : "acc-gopay", method: i % 2 ? "tunai" : "ewallet" }));
    PX(md(m, 8), "keluar", 420_000 + bump, "Belanja", { party: "Supermarket", description: "Belanja bulanan" });
    // Bulan ini token listrik belum dibayar (muncul sebagai jatuh tempo).
    if (m > 0) PX(md(m, 20), "keluar", 250_000, "Tagihan & utilitas", { party: "PLN", description: "Token listrik", recurringId: "rec-listrik" });
    PX(md(m, 6), "keluar", 200_000, "Sedekah & zakat", { description: "Infaq Jumat", accountId: "acc-tunai", method: "tunai" });
  }
  PX(md(1, 13), "keluar", 650_000, "Pendidikan", { description: "Buku Pattern Recognition & ML", projectId: "pj-thesis" });
  PX(md(0, 6), "keluar", 350_000, "Pendidikan", { description: "Biaya cetak & jilid proposal", projectId: "pj-thesis", accountId: "acc-tunai", method: "tunai" });
  PX(md(2, 18), "keluar", 1_200_000, "Kesehatan", { party: "Klinik gigi", description: "Tambal gigi" });
  PX(md(1, 21), "masuk", 1_500_000, "Usaha sampingan", { party: "Klien freelance", description: "Honor desain slide" });
  PX(md(0, 9), "masuk", 750_000, "Pendapatan proyek", { party: "Asisten dosen", description: "Honor asisten AI5101", projectId: "pj-kuliah" });
  // Proyek Jitu (akun proyek).
  const J = (date: string, type: "masuk" | "keluar", amount: number, category: string, extra: Record<string, unknown>) => PX(date, type, amount, category, { accountId: "acc-jitu", projectId: "pj-jitu", ...extra });
  J(md(2, 5), "masuk", 25_000_000, "Termin klien", { party: "Investor Seed", description: "Termin 1" });
  J(md(2, 12), "keluar", 2_400_000, "Perangkat lunak", { party: "Vercel & Supabase", description: "Langganan server 3 bulan", projectId: "pj-jitu-dev" });
  J(md(1, 3), "keluar", 9_000_000, "Gaji tim", { party: "Bayu Pratama", description: "Honor pengembang Sep", projectId: "pj-jitu-dev" });
  J(md(1, 19), "keluar", 3_500_000, "Pemasaran", { party: "Meta Ads", description: "Iklan kampanye beta", projectId: "pj-jitu-mkt" });
  J(md(0, 3), "keluar", 9_000_000, "Gaji tim", { party: "Bayu Pratama", description: "Honor pengembang Okt", projectId: "pj-jitu-dev" });
  J(md(0, 16), "keluar", 1_250_000, "Operasional", { description: "Sewa ruang meeting & konsumsi", projectId: "pj-jitu" });
  // Anggaran.
  const BUD = (id: string, data: Record<string, unknown>) => rec(id, "budget", { period: "bulanan", ...data });
  BUD("bud-makan", { category: "Makan & minum", amount: 1_200_000 });
  BUD("bud-transport", { category: "Transportasi", amount: 300_000 });
  BUD("bud-belanja", { category: "Belanja", amount: 600_000 });
  BUD("bud-total", { category: "*", amount: 6_500_000 });
  BUD("bud-thesis", { category: "*", amount: 3_000_000, period: "total", projectId: "pj-thesis" });
  BUD("bud-jitu-mkt", { category: "Pemasaran", amount: 6_000_000, period: "total", projectId: "pj-jitu" });
  // Tagihan & pemasukan rutin.
  const REC = (id: string, data: Record<string, unknown>) => rec(id, "recurring", { type: "keluar", freq: "bulanan", active: true, method: "transfer", accountId: "acc-bca", ...data });
  const lastBefore = (day: number) => (md(0, day) <= today ? md(0, day) : md(1, day));
  REC("rec-gaji", { title: "Gaji", type: "masuk", amount: 8_500_000, category: "Gaji", party: "PT Contoh Sejahtera", start: md(3, 25), lastPosted: lastBefore(25) });
  REC("rec-kos", { title: "Sewa kos", amount: 1_800_000, category: "Rumah & cicilan", party: "Ibu kos", start: md(3, 1), lastPosted: lastBefore(1) });
  REC("rec-internet", { title: "Internet IndiHome", amount: 385_000, category: "Pulsa & internet", party: "IndiHome", start: md(3, 10), lastPosted: lastBefore(10), auto: true });
  REC("rec-spotify", { title: "Spotify", amount: 54_990, category: "Hiburan", party: "Spotify", start: md(3, 15), lastPosted: lastBefore(15), accountId: "acc-gopay", method: "ewallet", auto: true });
  REC("rec-listrik", { title: "Token listrik", amount: 250_000, category: "Tagihan & utilitas", party: "PLN", start: md(3, 20), lastPosted: md(1, 20) > today ? md(2, 20) : md(1, 20) });
  REC("rec-bpjs", { title: "BPJS Kesehatan", amount: 150_000, category: "Kesehatan", start: d(3) });
  REC("rec-infaq-siti", { title: "Infaq rutin Hj. Siti Aminah", type: "masuk", amount: 5_000_000, category: "Infaq", party: "Hj. Siti Aminah", accountId: "acc-infaq", projectId: "pj-infaq-terima", start: d(-21), lastPosted: d(-21) });

  // ---------- Komentar & kotak masuk ----------
  const C = (id: string, data: Record<string, unknown>) => rec(id, "comment", { mentions: [], ...data });
  C("cm-1", { target: "task", targetId: "t-n4", projectId: "pj-internal-ops", body: "@Saya agenda rapat bulan ini tolong tambahkan evaluasi SOP reimburse ya.", authorId: "m-rina", authorName: "Rina Wulandari", mentions: ["m-saya"], at: at(-1, 15, 20) });
  C("cm-2", { target: "task", targetId: "t-n4", projectId: "pj-internal-ops", body: "Siap, saya masukkan. @Bayu Pratama bisa siapkan data tiket support?", authorId: "m-saya", authorName: "Saya", mentions: ["m-bayu"], at: at(-1, 16, 5) });
  C("cm-3", { target: "task", targetId: "t-th3", projectId: "pj-thesis-tulis", body: "Bagian 2.3 perlu ditambah perbandingan IndoBERT vs mBERT. Selebihnya sudah baik.", authorId: "m-hendra", authorName: "Dr. Hendra Kusuma", at: at(0, 8, 40) });
  rec("ob-1", "outbox", { type: "assign", taskId: "t-n4", projectId: "pj-internal-ops", memberId: "m-saya", by: "m-rina", at: at(-2, 9, 0), status: "skipped", tries: 0 });
  rec("ob-2", "outbox", { type: "mention", commentId: "cm-2", taskId: "t-n4", projectId: "pj-internal-ops", memberId: "m-bayu", by: "m-saya", at: at(-1, 16, 5), status: "sent", tries: 0, sentVia: ["wa"] });

  // ---------- Rapat ----------
  const MT = (id: string, day: number, s0: number, e0: number, data: Record<string, unknown>) =>
    rec(id, "meeting", { date: d(day), start: s0, end: e0, attendees: ["m-saya"], agenda: [], actions: [], status: "terjadwal", createdAt: ts, ...data });
  MT("mt-sprint", 1, H(10), H(11), {
    title: "Sprint review Jitu",
    projectId: "pj-jitu",
    color: "nila",
    link: "https://meet.google.com/jtu-sprt-rvw",
    attendees: ["m-saya", "m-rina", "m-bayu"],
    agenda: [
      { id: "ag-1", text: "Demo fitur login Google & notifikasi push", done: false, minutes: 20 },
      { id: "ag-2", text: "Bug kritis yang tersisa", done: false, minutes: 15 },
      { id: "ag-3", text: "Prioritas sprint berikutnya", done: false, minutes: 20 },
    ],
  });
  MT("mt-bimbingan", 2, H(10), H(11), {
    title: "Bimbingan thesis dengan Dr. Hendra",
    projectId: "pj-thesis",
    color: "ungu",
    location: "Ruang dosen Lt. 3, Labtek V",
    attendees: ["m-saya", "m-hendra"],
    agenda: [
      { id: "ag-4", text: "Revisi Bab 2 Tinjauan Pustaka", done: false },
      { id: "ag-5", text: "Rencana eksperimen few-shot", done: false },
      { id: "ag-6", text: "Jadwal seminar proposal", done: false },
    ],
  });
  MT("mt-infaq", 5, H(16), H(17), {
    title: "Koordinasi penyaluran infaq",
    projectId: "pj-infaq-salur",
    color: "daun",
    link: "https://us02web.zoom.us/j/81234567890",
    attendees: ["m-saya", "m-rina"],
    agenda: [{ id: "ag-7", text: "Verifikasi calon penerima RW 05", done: false }, { id: "ag-8", text: "Laporan donatur Oktober", done: false }],
  });
  MT("mt-bulanan", -3, H(14), H(15, 30), {
    title: "Rapat bulanan Internal",
    projectId: "pj-internal-ops",
    color: "laut",
    location: "Ruang rapat lt. 2",
    status: "selesai",
    attendees: ["m-saya", "m-rina", "m-bayu"],
    agenda: [
      { id: "ag-9", text: "Evaluasi SOP reimburse", done: true, minutes: 30 },
      { id: "ag-10", text: "Laporan tiket support", done: true, minutes: 20 },
    ],
    noteId: "n-notulen-bulanan",
    decisions: "- SOP reimburse baru berlaku mulai 1 November\n- Laporan keuangan dikirim setiap tanggal 5",
    actions: [
      { id: "ac-1", text: "Perbarui dokumen SOP reimburse", assignee: "m-rina", due: d(4) },
      { id: "ac-2", text: "Siapkan data tiket support bulan ini", assignee: "m-bayu", due: d(2) },
    ],
  });
  N("n-notulen-bulanan", {
    title: "Notulen Rapat bulanan Internal",
    icon: "🤝",
    projectId: "pj-internal-ops",
    tags: ["rapat"],
    body: "**Peserta:** Saya, Rina Wulandari, Bayu Pratama\n\n## Agenda\n\n1. Evaluasi SOP reimburse\n2. Laporan tiket support\n\n## Pembahasan\n\n- Reimburse sering terlambat karena bukti tidak lengkap\n- Tiket support turun 12% dibanding bulan lalu\n\n## Keputusan\n\n- SOP reimburse baru berlaku mulai 1 November\n- Laporan keuangan dikirim setiap tanggal 5\n\n## Tindak lanjut\n\n- [ ] Perbarui dokumen SOP reimburse — Rina Wulandari\n- [ ] Siapkan data tiket support bulan ini — Bayu Pratama",
  });
  // Rapat berulang: setiap Senin.
  const monday = (() => {
    const t = parseDateKey(today);
    return dateKey(addDays(t, -((t.getDay() + 6) % 7)));
  })();
  rec("ms-weekly", "meetingseries", {
    title: "Weekly sync tim Jitu",
    start: H(10),
    end: H(10, 45),
    projectId: "pj-jitu",
    color: "nila",
    link: "https://meet.google.com/jtu-wkly-snc",
    attendees: ["m-saya", "m-rina", "m-bayu"],
    agenda: [{ id: "ag-w1", text: "Capaian minggu lalu", done: false }, { id: "ag-w2", text: "Hambatan", done: false }, { id: "ag-w3", text: "Rencana minggu ini", done: false }],
    freq: "weekly",
    from: monday,
    weekdays: [1],
    skipHolidays: true,
    active: true,
  });

  // ---------- Kuliah ----------
  const semStart = (() => {
    const t = addDays(parseDateKey(today), -63);
    return dateKey(addDays(t, -((t.getDay() + 6) % 7)));
  })();
  const semEnd = d(52);
  const COURSE = (id: string, c: Course, attended: (n: number) => string | undefined = () => "hadir") => {
    rec(id, "course", { ...c });
    // Presensi pertemuan yang sudah lewat.
    let n = 0;
    for (const o of courseOccurrences(c)) {
      if (o.date >= today) break;
      n++;
      const status = attended(n);
      rec(classBlockId(id, o.session.id, o.date), "timeblock", {
        date: o.date,
        start: o.session.start,
        end: o.session.end,
        title: `${c.code ? `${c.code} ` : ""}${c.name}${o.session.type && o.session.type !== "kuliah" ? " (Praktikum)" : ""}`,
        color: c.color,
        projectId: c.projectId,
        kind: "kuliah",
        courseId: id,
        sessionId: o.session.id,
        location: o.session.location,
        link: c.link,
        attendance: status,
        topic: n === 1 ? "Pengantar & kontrak kuliah" : undefined,
      });
    }
  };
  COURSE(
    "crs-ai",
    {
      name: "Pemrograman untuk AI & Data Science",
      code: "AI5101",
      sks: 3,
      lecturer: "Dr. Ayu Lestari",
      semester: "Ganjil 2026/2027",
      start: semStart,
      end: semEnd,
      sessions: [
        { id: "s-ai-1", weekday: 2, start: H(7, 30), end: H(9, 10), location: "R. 7602", type: "kuliah" },
        { id: "s-ai-2", weekday: 4, start: H(13), end: H(14, 40), location: "Lab Komputasi", type: "praktikum" },
      ],
      link: "https://edunex.itb.ac.id",
      color: "kunyit",
      projectId: "pj-kuliah-ai",
      skipHolidays: true,
      exams: [
        { id: "ex-ai-uts", kind: "UTS", date: d(-14), start: H(8), end: H(10), location: "R. 7602" },
        { id: "ex-ai-uas", kind: "UAS", date: d(45), start: H(8), end: H(10), location: "R. 7602" },
      ],
      grading: [
        { id: "g-ai-1", name: "Tugas", weight: 30, score: 88 },
        { id: "g-ai-2", name: "UTS", weight: 30, score: 76 },
        { id: "g-ai-3", name: "UAS", weight: 40 },
      ],
      minAttendance: 80,
    },
    (n) => (n === 5 ? "izin" : "hadir"),
  );
  COURSE("crs-stat", {
    name: "Statistika Lanjut",
    code: "MA5181",
    sks: 3,
    lecturer: "Prof. Budi Santoso",
    semester: "Ganjil 2026/2027",
    start: semStart,
    end: semEnd,
    sessions: [{ id: "s-st-1", weekday: 3, start: H(9), end: H(11, 30), location: "R. 9104", type: "kuliah" }],
    color: "laut",
    projectId: "pj-kuliah-stat",
    skipHolidays: true,
    exams: [{ id: "ex-st-uas", kind: "UAS", date: d(47), start: H(9), end: H(11), location: "R. 9104" }],
    grading: [
      { id: "g-st-1", name: "Tugas & kuis", weight: 40, score: 82 },
      { id: "g-st-2", name: "UTS", weight: 30, score: 71 },
      { id: "g-st-3", name: "UAS", weight: 30 },
    ],
    minAttendance: 75,
  });
  COURSE("crs-metpen", {
    name: "Metodologi Penelitian",
    code: "IF6099",
    sks: 2,
    lecturer: "Dr. Hendra Kusuma",
    semester: "Ganjil 2026/2027",
    start: semStart,
    end: semEnd,
    sessions: [{ id: "s-mp-1", weekday: 5, start: H(13, 30), end: H(15, 10), location: "R. 7606", type: "kuliah" }],
    color: "ungu",
    skipHolidays: true,
    exams: [],
    grading: [
      { id: "g-mp-1", name: "Proposal penelitian", weight: 60 },
      { id: "g-mp-2", name: "Presentasi", weight: 40 },
    ],
    minAttendance: 75,
  });
  // Semester lalu (sudah ada nilai akhir) untuk IPK.
  const prev = (id: string, name: string, code: string, sks: number, finalLetter: string) =>
    rec(id, "course", { name, code, sks, semester: "Genap 2025/2026", start: "2026-02-02", end: "2026-05-29", sessions: [], color: "abu", skipHolidays: true, exams: [], grading: [], finalLetter, minAttendance: 75 });
  prev("crs-prev-1", "Struktur Data & Algoritma", "IF5100", 3, "A");
  prev("crs-prev-2", "Matematika untuk AI", "AI5002", 3, "AB");
  prev("crs-prev-3", "Etika & Sosial AI", "AI5003", 2, "A");

  // ---------- Tag file ----------
  if (opts.preview) {
    rec("fm-thesis", "filemeta", { path: "C:\\Users\\Saya\\Documents\\Riset Thesis\\Proposal v3.docx", name: "Proposal v3.docx", isDir: false, tags: ["thesis"], favorite: true, projectId: "pj-thesis" });
    rec("fm-cv", "filemeta", { path: "C:\\Users\\Saya\\Documents\\Recruitment\\CV Andi S.pdf", name: "CV Andi S.pdf", isDir: false, tags: ["kandidat"], projectId: "pj-rekrut-be" });
  }

  return out;
}

/** Konfigurasi bawaan yang ikut dipasang bersama demo (tidak ditandai demo). */
export function demoConfigRecords(now = Date.now()): RawRecord[] {
  return [
    { id: "ibadah-config", kind: "ibadahconfig", updatedAt: now, deleted: false, data: { setup: true, city: "Jakarta", lat: -6.2088, lng: 106.8456, tz: 7, elevation: 0, prayerTarget: "masjid" } },
  ];
}

export const isDemo = (data: unknown) => !!data && typeof data === "object" && (data as { demo?: boolean }).demo === true;
