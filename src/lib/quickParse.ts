// Penguraian teks tambah-cepat berbahasa Indonesia, contoh:
// "Kirim penawaran besok jam 14 #klien !tinggi @Proyek A ~30m setiap minggu"
import { addDays, dateKey } from "./date";
import type { Recurrence, TaskPriority } from "./tasks";

export interface Parsed {
  title: string;
  due?: string;
  dueTime?: number;
  tags: string[];
  priority?: TaskPriority;
  project?: string; // teks setelah @ (dicocokkan pemanggil)
  estimate?: number;
  recurrence?: Recurrence;
}

const DAYS = ["minggu", "senin", "selasa", "rabu", "kamis", "jumat", "sabtu"];
const MONTHS = ["jan", "feb", "mar", "apr", "mei", "jun", "jul", "agu", "sep", "okt", "nov", "des"];

export function parseQuick(input: string, today: Date = new Date(), projectNames: string[] = []): Parsed {
  let s = ` ${input.trim()} `;
  const out: Parsed = { title: "", tags: [] };
  const cut = (re: RegExp, fn: (m: RegExpMatchArray) => void) => {
    const m = s.match(re);
    if (m) {
      fn(m);
      s = s.replace(m[0], " ");
    }
  };
  const base = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  // Pengulangan
  cut(/\s(setiap hari kerja|tiap hari kerja|hari kerja)\s/i, () => (out.recurrence = { freq: "weekdays", interval: 1 }));
  cut(/\s(setiap hari|tiap hari)\s/i, () => (out.recurrence = { freq: "daily", interval: 1 }));
  cut(/\s(setiap minggu|tiap minggu|mingguan)\s/i, () => (out.recurrence = { freq: "weekly", interval: 1 }));
  cut(/\s(setiap bulan|tiap bulan|bulanan)\s/i, () => (out.recurrence = { freq: "monthly", interval: 1 }));

  // Proyek: @Nama, atau @Dua Kata bila cocok dengan nama proyek yang ada.
  const lower = projectNames.map((p) => p.toLowerCase());
  const pm = s.match(/\s@([^\s#!~@]+)(?:\s([^\s#!~@]+))?/);
  if (pm) {
    const two = pm[2] ? `${pm[1]} ${pm[2]}` : null;
    if (two && lower.includes(two.toLowerCase())) {
      out.project = two;
      s = s.replace(pm[0], " ");
    } else {
      out.project = pm[1];
      s = s.replace(`@${pm[1]}`, " ");
    }
  }

  cut(/\s!(1|2|3|4|mendesak|urgent|tinggi|sedang|rendah)\s/i, (m) => {
    const v = m[1].toLowerCase();
    out.priority = v === "1" || v === "mendesak" || v === "urgent" ? "urgent" : v === "2" || v === "tinggi" ? "tinggi" : v === "3" || v === "sedang" ? "sedang" : "rendah";
  });
  cut(/\s~(\d+(?:[.,]\d+)?)\s*(m|mnt|menit|j|jam|h)\s/i, (m) => {
    const n = Number(m[1].replace(",", "."));
    out.estimate = Math.round(/^(j|jam|h)$/i.test(m[2]) ? n * 60 : n);
  });
  for (;;) {
    const m = s.match(/\s#([\p{L}\p{N}_-]+)/u);
    if (!m) break;
    out.tags.push(m[1].toLowerCase());
    s = s.replace(m[0], " ");
  }

  // Jam
  cut(/\s(?:jam|pukul|pk\.?)\s*(\d{1,2})(?:[:.](\d{2}))?\s*(pagi|siang|sore|malam)?\s/i, (m) => {
    let h = Number(m[1]);
    const mi = Number(m[2] ?? 0);
    const part = m[3]?.toLowerCase();
    if ((part === "sore" || part === "malam") && h < 12) h += 12;
    if (part === "siang" && h < 11) h += 12;
    if (h < 24 && mi < 60) out.dueTime = h * 60 + mi;
  });

  // Tanggal
  cut(/\s(hari ini|nanti)\s/i, () => (out.due = dateKey(base)));
  cut(/\s(besok)\s/i, () => (out.due = dateKey(addDays(base, 1))));
  cut(/\s(lusa)\s/i, () => (out.due = dateKey(addDays(base, 2))));
  cut(/\s(minggu depan)\s/i, () => (out.due = dateKey(addDays(base, ((8 - base.getDay()) % 7) || 7))));
  cut(/\s(bulan depan)\s/i, () => (out.due = dateKey(new Date(base.getFullYear(), base.getMonth() + 1, 1))));
  cut(/\s(?:tgl\.?|tanggal)?\s*(\d{1,2})\s+(jan|feb|mar|apr|mei|jun|jul|agu|agt|sep|okt|nov|des)[a-z]*\.?(?:\s+(\d{4}))?\s/i, (m) => {
    const mon = MONTHS.indexOf(m[2].toLowerCase().replace("agt", "agu"));
    let y = m[3] ? Number(m[3]) : base.getFullYear();
    const d = new Date(y, mon, Number(m[1]));
    if (!m[3] && d < base) d.setFullYear(++y);
    out.due = dateKey(d);
  });
  cut(/\s(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\s/, (m) => {
    let y = m[3] ? Number(m[3].length === 2 ? `20${m[3]}` : m[3]) : base.getFullYear();
    const d = new Date(y, Number(m[2]) - 1, Number(m[1]));
    if (!m[3] && d < base) d.setFullYear(++y);
    out.due = dateKey(d);
  });
  cut(/\s(?:hari\s+)?(senin|selasa|rabu|kamis|jumat|jum'at|sabtu|minggu)(?:\s+(depan))?\s/i, (m) => {
    const target = DAYS.indexOf(m[1].toLowerCase().replace("'", ""));
    let diff = (target - base.getDay() + 7) % 7;
    // "senin depan": kemunculan berikutnya, tidak termasuk hari ini.
    if (m[2] && diff === 0) diff = 7;
    out.due = dateKey(addDays(base, diff));
  });
  // Jam tanpa tanggal = hari ini
  if (out.dueTime !== undefined && !out.due) out.due = dateKey(base);

  out.title = s.replace(/\s+/g, " ").trim();
  return out;
}
