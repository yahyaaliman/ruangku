// Jadwal sholat & kalender Hijriah. Port langsung dari src-tauri/src/prayer.rs
// (hasilnya diuji identik di prayer.test.ts). Parameter Kemenag RI:
// Subuh -20°, Isya -18°, Ashar mazhab Syafi'i, imsak = Subuh - 10 menit,
// ihtiyat 2 menit, Dhuha saat matahari 4,5° di atas ufuk.

export interface Location {
  lat: number;
  lng: number;
  tz: number;
  elevation: number;
}

export interface Offsets {
  subuh: number;
  dzuhur: number;
  ashar: number;
  maghrib: number;
  isya: number;
}

export interface Times {
  imsak: number;
  subuh: number;
  terbit: number;
  dhuha: number;
  dzuhur: number;
  ashar: number;
  maghrib: number;
  isya: number;
}

export const NO_OFFSETS: Offsets = { subuh: 0, dzuhur: 0, ashar: 0, maghrib: 0, isya: 0 };
const IHTIYAT = 2;

const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;
const fix = (a: number, b: number) => {
  const r = a - b * Math.floor(a / b);
  return r < 0 ? r + b : r;
};

export function julian(y: number, m: number, d: number): number {
  if (m <= 2) {
    y -= 1;
    m += 12;
  }
  const a = Math.floor(y / 100);
  const b = 2 - a + Math.floor(a / 4);
  return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + d + b - 1524.5;
}

function sunPosition(jd: number): [number, number] {
  const d = jd - 2451545.0;
  const g = fix(357.529 + 0.98560028 * d, 360);
  const q = fix(280.459 + 0.98564736 * d, 360);
  const l = fix(q + 1.915 * Math.sin(rad(g)) + 0.02 * Math.sin(rad(2 * g)), 360);
  const e = 23.439 - 0.00000036 * d;
  const ra = fix(deg(Math.atan2(Math.cos(rad(e)) * Math.sin(rad(l)), Math.cos(rad(l)))) / 15, 24);
  let eqt = q / 15 - ra;
  if (eqt > 12) eqt -= 24;
  if (eqt < -12) eqt += 24;
  const decl = deg(Math.asin(Math.sin(rad(e)) * Math.sin(rad(l))));
  return [decl, eqt];
}

export function compute(y: number, m: number, d: number, loc: Location, off: Offsets = NO_OFFSETS): Times {
  const jd = julian(y, m, d) - loc.lng / (15 * 24);
  const lat = loc.lat;
  const midday = (t: number) => fix(12 - sunPosition(jd + t / 24)[1], 24);
  const angleTime = (angle: number, t: number, beforeNoon: boolean) => {
    const [decl] = sunPosition(jd + t / 24);
    const noon = midday(t);
    const c = (-Math.sin(rad(angle)) - Math.sin(rad(decl)) * Math.sin(rad(lat))) / (Math.cos(rad(decl)) * Math.cos(rad(lat)));
    const v = deg(Math.acos(Math.min(1, Math.max(-1, c)))) / 15;
    return beforeNoon ? noon - v : noon + v;
  };
  const asrTime = (t: number) => {
    const [decl] = sunPosition(jd + t / 24);
    const altitude = deg(Math.atan(1 / (1 + Math.tan(rad(Math.abs(lat - decl))))));
    return angleTime(-altitude, t, false);
  };
  const horizon = 0.833 + 0.0347 * Math.sqrt(Math.max(0, loc.elevation));
  let t = [5, 6, 7, 12, 13, 18, 18];
  for (let i = 0; i < 2; i++) {
    t = [
      angleTime(20, t[0], true),
      angleTime(horizon, t[1], true),
      angleTime(-4.5, t[2], true),
      midday(t[3]),
      asrTime(t[4]),
      angleTime(horizon, t[5], false),
      angleTime(18, t[6], false),
    ];
  }
  const shift = loc.tz - loc.lng / 15;
  const mins = (h: number) => (h + shift) * 60;
  const up = (h: number, extra: number) => Math.ceil(mins(h) + IHTIYAT) + extra;
  const subuh = up(t[0], off.subuh);
  return {
    imsak: subuh - 10,
    subuh,
    terbit: Math.floor(mins(t[1]) - IHTIYAT),
    dhuha: Math.ceil(mins(t[2])),
    dzuhur: up(t[3], off.dzuhur),
    ashar: up(t[4], off.ashar),
    maghrib: up(t[5], off.maghrib),
    isya: up(t[6], off.isya),
  };
}

export function timesForDate(date: string, loc: Location, off?: Offsets): Times {
  const [y, m, d] = date.split("-").map(Number);
  return compute(y, m, d, loc, off);
}

export function lastThirdOfNight(maghrib: number, nextSubuh: number): number {
  const night = nextSubuh + 1440 - maghrib;
  return maghrib + Math.floor((night * 2) / 3) - 1440;
}

/** Kalender Hijriah tabular dengan koreksi `offset` hari. */
export function hijri(y: number, m: number, d: number, offset = 0): [number, number, number] {
  const jdn = Math.floor(julian(y, m, d) + 0.5) + offset;
  const div = (a: number, b: number) => Math.trunc(a / b);
  let l = jdn - 1948440 + 10632;
  const n = div(l - 1, 10631);
  l = l - 10631 * n + 354;
  const j = div(10985 - l, 5316) * div(50 * l, 17719) + div(l, 5670) * div(43 * l, 15238);
  l = l - div(30 - j, 15) * div(17719 * j, 50) - div(j, 16) * div(15238 * j, 43) + 29;
  const hm = div(24 * l, 709);
  const hd = l - div(709 * hm, 24);
  return [30 * n + j - 30, hm, hd];
}

export const HIJRI_MONTHS = ["Muharram", "Safar", "Rabiul Awal", "Rabiul Akhir", "Jumadil Awal", "Jumadil Akhir", "Rajab", "Sya'ban", "Ramadan", "Syawal", "Dzulqa'dah", "Dzulhijjah"];

export function hijriLabel(date: string, offset = 0): string {
  const [y, m, d] = date.split("-").map(Number);
  const [hy, hm, hd] = hijri(y, m, d, offset);
  return `${hd} ${HIJRI_MONTHS[hm - 1]} ${hy} H`;
}

export type FastKind = "puasa_ramadan" | "puasa_senin_kamis" | "puasa_ayyamul_bidh" | "puasa_arafah" | "puasa_asyura";

/** Puasa yang berlaku pada tanggal ini (sama dengan notify.rs). Kosong pada hari yang dilarang berpuasa. */
export function fastingKinds(date: string, offset = 0): FastKind[] {
  const [y, m, d] = date.split("-").map(Number);
  const [, hm, hd] = hijri(y, m, d, offset);
  if ((hm === 10 && hd === 1) || (hm === 12 && hd >= 10 && hd <= 13)) return [];
  if (hm === 9) return ["puasa_ramadan"];
  const out: FastKind[] = [];
  const wd = new Date(y, m - 1, d).getDay();
  if (wd === 1 || wd === 4) out.push("puasa_senin_kamis");
  if (hd >= 13 && hd <= 15) out.push("puasa_ayyamul_bidh");
  if (hm === 12 && hd === 9) out.push("puasa_arafah");
  if (hm === 1 && (hd === 9 || hd === 10)) out.push("puasa_asyura");
  return out;
}

export const isRamadan = (date: string, offset = 0) => {
  const [y, m, d] = date.split("-").map(Number);
  return hijri(y, m, d, offset)[1] === 9;
};

/** Kota-kota Indonesia (pusat kota, perkiraan). Ketinggian dalam meter. */
export const CITIES: { name: string; lat: number; lng: number; tz: number; elevation?: number }[] = [
  { name: "Banda Aceh", lat: 5.5483, lng: 95.3238, tz: 7 },
  { name: "Medan", lat: 3.5952, lng: 98.6722, tz: 7 },
  { name: "Padang", lat: -0.9471, lng: 100.4172, tz: 7 },
  { name: "Pekanbaru", lat: 0.5071, lng: 101.4478, tz: 7 },
  { name: "Batam", lat: 1.0456, lng: 104.0305, tz: 7 },
  { name: "Tanjung Pinang", lat: 0.9186, lng: 104.4554, tz: 7 },
  { name: "Jambi", lat: -1.6101, lng: 103.6131, tz: 7 },
  { name: "Palembang", lat: -2.9761, lng: 104.7754, tz: 7 },
  { name: "Pangkal Pinang", lat: -2.1316, lng: 106.1169, tz: 7 },
  { name: "Bengkulu", lat: -3.7928, lng: 102.2608, tz: 7 },
  { name: "Bandar Lampung", lat: -5.3971, lng: 105.2668, tz: 7 },
  { name: "Serang", lat: -6.1201, lng: 106.1503, tz: 7 },
  { name: "Tangerang", lat: -6.1783, lng: 106.6319, tz: 7 },
  { name: "Jakarta", lat: -6.2088, lng: 106.8456, tz: 7 },
  { name: "Bekasi", lat: -6.2383, lng: 106.9756, tz: 7 },
  { name: "Depok", lat: -6.4025, lng: 106.7942, tz: 7, elevation: 100 },
  { name: "Bogor", lat: -6.5971, lng: 106.806, tz: 7, elevation: 260 },
  { name: "Bandung", lat: -6.9175, lng: 107.6191, tz: 7, elevation: 700 },
  { name: "Cimahi", lat: -6.8722, lng: 107.5425, tz: 7, elevation: 720 },
  { name: "Garut", lat: -7.2279, lng: 107.9087, tz: 7, elevation: 700 },
  { name: "Tasikmalaya", lat: -7.3274, lng: 108.2207, tz: 7, elevation: 350 },
  { name: "Cirebon", lat: -6.732, lng: 108.5523, tz: 7 },
  { name: "Purwokerto", lat: -7.4245, lng: 109.2302, tz: 7, elevation: 100 },
  { name: "Semarang", lat: -6.9667, lng: 110.4167, tz: 7 },
  { name: "Yogyakarta", lat: -7.7956, lng: 110.3695, tz: 7, elevation: 110 },
  { name: "Surakarta (Solo)", lat: -7.5755, lng: 110.8243, tz: 7, elevation: 90 },
  { name: "Kediri", lat: -7.848, lng: 112.0178, tz: 7 },
  { name: "Malang", lat: -7.9666, lng: 112.6326, tz: 7, elevation: 450 },
  { name: "Surabaya", lat: -7.2575, lng: 112.7521, tz: 7 },
  { name: "Jember", lat: -8.1724, lng: 113.7, tz: 7 },
  { name: "Pontianak", lat: -0.0263, lng: 109.3425, tz: 7 },
  { name: "Palangka Raya", lat: -2.2161, lng: 113.9135, tz: 7 },
  { name: "Banjarmasin", lat: -3.3186, lng: 114.5944, tz: 8 },
  { name: "Balikpapan", lat: -1.2379, lng: 116.8529, tz: 8 },
  { name: "Samarinda", lat: -0.5022, lng: 117.1536, tz: 8 },
  { name: "Denpasar", lat: -8.6705, lng: 115.2126, tz: 8 },
  { name: "Mataram", lat: -8.5833, lng: 116.1167, tz: 8 },
  { name: "Kupang", lat: -10.1772, lng: 123.607, tz: 8 },
  { name: "Makassar", lat: -5.1477, lng: 119.4327, tz: 8 },
  { name: "Palu", lat: -0.8917, lng: 119.8707, tz: 8 },
  { name: "Kendari", lat: -3.9985, lng: 122.512, tz: 8 },
  { name: "Gorontalo", lat: 0.5435, lng: 123.0568, tz: 8 },
  { name: "Manado", lat: 1.4748, lng: 124.8421, tz: 8 },
  { name: "Ambon", lat: -3.6954, lng: 128.1814, tz: 9 },
  { name: "Ternate", lat: 0.7893, lng: 127.3772, tz: 9 },
  { name: "Sorong", lat: -0.8762, lng: 131.2558, tz: 9 },
  { name: "Manokwari", lat: -0.8615, lng: 134.062, tz: 9 },
  { name: "Jayapura", lat: -2.5337, lng: 140.7181, tz: 9 },
];
