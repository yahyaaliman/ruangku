//! Perhitungan jadwal sholat (hisab) dan kalender Hijriah, sepenuhnya offline.
//!
//! Parameter mengikuti kriteria Kemenag RI: Subuh saat matahari 20° di bawah
//! ufuk, Isya 18°, Ashar saat bayangan = tinggi benda + bayangan saat zawal
//! (mazhab Syafi'i), imsak 10 menit sebelum Subuh, ihtiyat (pengaman) 2 menit.
//! Dhuha dimulai saat matahari setinggi 4,5° setelah terbit.
//!
//! Algoritma posisi matahari mengikuti rumus pendekatan yang umum dipakai
//! (akurasi sekitar 1 menit untuk lintang Indonesia).

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct Location {
    pub lat: f64,
    pub lng: f64,
    /// Zona waktu dalam jam, mis. 7 untuk WIB.
    pub tz: f64,
    pub elevation: f64,
}

impl Default for Location {
    fn default() -> Self {
        Self { lat: -6.2088, lng: 106.8456, tz: 7.0, elevation: 0.0 }
    }
}

/// Koreksi manual per waktu (menit), untuk menyamakan dengan jadwal masjid setempat.
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct Offsets {
    pub subuh: i32,
    pub dzuhur: i32,
    pub ashar: i32,
    pub maghrib: i32,
    pub isya: i32,
}

/// Semua waktu dalam menit sejak 00:00 waktu lokal.
#[derive(Debug, Clone, Copy, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Times {
    pub imsak: i32,
    pub subuh: i32,
    pub terbit: i32,
    pub dhuha: i32,
    pub dzuhur: i32,
    pub ashar: i32,
    pub maghrib: i32,
    pub isya: i32,
}

const IHTIYAT: f64 = 2.0;

fn rad(d: f64) -> f64 {
    d.to_radians()
}
fn deg(r: f64) -> f64 {
    r.to_degrees()
}
fn fix(a: f64, b: f64) -> f64 {
    let r = a - b * (a / b).floor();
    if r < 0.0 {
        r + b
    } else {
        r
    }
}

/// Julian Day pada 00:00 UT.
pub fn julian(y: i32, m: u32, d: u32) -> f64 {
    let (mut y, mut m) = (y as f64, m as f64);
    if m <= 2.0 {
        y -= 1.0;
        m += 12.0;
    }
    let a = (y / 100.0).floor();
    let b = 2.0 - a + (a / 4.0).floor();
    (365.25 * (y + 4716.0)).floor() + (30.6001 * (m + 1.0)).floor() + d as f64 + b - 1524.5
}

/// (deklinasi matahari dalam derajat, equation of time dalam jam)
fn sun_position(jd: f64) -> (f64, f64) {
    let d = jd - 2451545.0;
    let g = fix(357.529 + 0.98560028 * d, 360.0);
    let q = fix(280.459 + 0.98564736 * d, 360.0);
    let l = fix(q + 1.915 * rad(g).sin() + 0.020 * rad(2.0 * g).sin(), 360.0);
    let e = 23.439 - 0.00000036 * d;
    let ra = fix(deg((rad(e).cos() * rad(l).sin()).atan2(rad(l).cos())) / 15.0, 24.0);
    let mut eqt = q / 15.0 - ra;
    if eqt > 12.0 {
        eqt -= 24.0;
    }
    if eqt < -12.0 {
        eqt += 24.0;
    }
    let decl = deg((rad(e).sin() * rad(l).sin()).asin());
    (decl, eqt)
}

struct Calc {
    jd: f64,
    lat: f64,
}

impl Calc {
    fn midday(&self, t: f64) -> f64 {
        let (_, eqt) = sun_position(self.jd + t / 24.0);
        fix(12.0 - eqt, 24.0)
    }
    /// Waktu saat matahari berada `angle` derajat di bawah ufuk (negatif = di atas).
    fn angle_time(&self, angle: f64, t: f64, before_noon: bool) -> f64 {
        let (decl, _) = sun_position(self.jd + t / 24.0);
        let noon = self.midday(t);
        let c = (-rad(angle).sin() - rad(decl).sin() * rad(self.lat).sin()) / (rad(decl).cos() * rad(self.lat).cos());
        let v = deg(c.clamp(-1.0, 1.0).acos()) / 15.0;
        if before_noon {
            noon - v
        } else {
            noon + v
        }
    }
    fn asr_time(&self, t: f64) -> f64 {
        let (decl, _) = sun_position(self.jd + t / 24.0);
        let altitude = deg((1.0 / (1.0 + rad((self.lat - decl).abs()).tan())).atan());
        self.angle_time(-altitude, t, false)
    }
}

pub fn compute(y: i32, m: u32, d: u32, loc: &Location, off: &Offsets) -> Times {
    let c = Calc { jd: julian(y, m, d) - loc.lng / (15.0 * 24.0), lat: loc.lat };
    let horizon = 0.833 + 0.0347 * loc.elevation.max(0.0).sqrt();
    // Tebakan awal (jam), lalu diperhalus dua kali.
    let mut t = [5.0, 6.0, 7.0, 12.0, 13.0, 18.0, 18.0];
    for _ in 0..2 {
        let p = t.map(|x| x / 24.0);
        t = [
            c.angle_time(20.0, p[0] * 24.0, true),
            c.angle_time(horizon, p[1] * 24.0, true),
            c.angle_time(-4.5, p[2] * 24.0, true),
            c.midday(p[3] * 24.0),
            c.asr_time(p[4] * 24.0),
            c.angle_time(horizon, p[5] * 24.0, false),
            c.angle_time(18.0, p[6] * 24.0, false),
        ];
    }
    let shift = loc.tz - loc.lng / 15.0;
    let mins = |h: f64| (h + shift) * 60.0;
    // Pengaman: waktu sholat dibulatkan ke atas, terbit ke bawah.
    let up = |h: f64, extra: i32| ((mins(h) + IHTIYAT).ceil() as i32) + extra;
    let subuh = up(t[0], off.subuh);
    Times {
        imsak: subuh - 10,
        subuh,
        terbit: (mins(t[1]) - IHTIYAT).floor() as i32,
        // Dhuha: tanpa ihtiyat tambahan (sudah ada jeda dari terbit).
        dhuha: mins(t[2]).ceil() as i32,
        dzuhur: up(t[3], off.dzuhur),
        ashar: up(t[4], off.ashar),
        maghrib: up(t[5], off.maghrib),
        isya: up(t[6], off.isya),
    }
}

/// Awal sepertiga malam terakhir (menit sejak 00:00 hari berikutnya bila setelah tengah malam).
pub fn last_third_of_night(maghrib: i32, next_subuh: i32) -> i32 {
    let night = next_subuh + 1440 - maghrib;
    let start = maghrib + night * 2 / 3;
    start - 1440
}

/// Kalender Hijriah tabular (aritmatika) dengan koreksi hari `offset`.
/// Bisa berbeda ±1 hari dari hasil sidang isbat, karena itu ada `offset`.
pub fn hijri(y: i32, m: u32, d: u32, offset: i32) -> (i32, u32, u32) {
    let jdn = (julian(y, m, d) + 0.5).floor() as i64 + offset as i64;
    let mut l = jdn - 1948440 + 10632;
    let n = (l - 1) / 10631;
    l = l - 10631 * n + 354;
    let j = ((10985 - l) / 5316) * ((50 * l) / 17719) + (l / 5670) * ((43 * l) / 15238);
    l = l - ((30 - j) / 15) * ((17719 * j) / 50) - (j / 16) * ((15238 * j) / 43) + 29;
    let hm = (24 * l) / 709;
    let hd = l - (709 * hm) / 24;
    let hy = 30 * n + j - 30;
    (hy as i32, hm as u32, hd as u32)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn hm(m: i32) -> String {
        format!("{:02}:{:02}", m / 60, m % 60)
    }

    fn assert_close(label: &str, got: i32, want: &str) {
        let (h, mi) = want.split_once(':').unwrap();
        let w = h.parse::<i32>().unwrap() * 60 + mi.parse::<i32>().unwrap();
        assert!((got - w).abs() <= 2, "{label}: dapat {} , acuan {want}", hm(got));
    }

    /// Acuan: jadwal Jakarta Oktober 2026 yang dipublikasikan media (hisab).
    #[test]
    fn jakarta_oktober_2026() {
        let loc = Location::default();
        let off = Offsets::default();
        let cases = [
            ((2026, 10, 1), ["04:13", "04:23", "05:36", "06:00", "11:45", "14:51", "17:49", "18:59"]),
            ((2026, 10, 15), ["04:06", "04:16", "05:30", "05:54", "11:41", "14:46", "17:48", "18:58"]),
        ];
        for ((y, m, d), want) in cases {
            let t = compute(y, m, d, &loc, &off);
            let got = [t.imsak, t.subuh, t.terbit, t.dhuha, t.dzuhur, t.ashar, t.maghrib, t.isya];
            let names = ["imsak", "subuh", "terbit", "dhuha", "dzuhur", "ashar", "maghrib", "isya"];
            for i in 0..8 {
                assert_close(&format!("{d}/{m} {}", names[i]), got[i], want[i]);
            }
        }
    }

    #[test]
    fn offsets_and_order() {
        let loc = Location { lat: -6.9175, lng: 107.6191, tz: 7.0, elevation: 700.0 };
        let base = compute(2026, 10, 26, &loc, &Offsets::default());
        let adj = compute(2026, 10, 26, &loc, &Offsets { maghrib: 3, ..Default::default() });
        assert_eq!(adj.maghrib, base.maghrib + 3);
        let seq = [base.imsak, base.subuh, base.terbit, base.dhuha, base.dzuhur, base.ashar, base.maghrib, base.isya];
        assert!(seq.windows(2).all(|w| w[0] < w[1]), "urutan waktu: {seq:?}");
    }

    #[test]
    fn night_third() {
        // maghrib 18:00, subuh 04:30 -> malam 10,5 jam, sepertiga terakhir mulai 01:00
        assert_eq!(last_third_of_night(18 * 60, 4 * 60 + 30), 60);
    }

    #[test]
    fn hijri_dates() {
        // 1 Muharram 1448 H jatuh sekitar 16-17 Juni 2026; Ramadan 1447 mulai sekitar 18-19 Feb 2026.
        let (y, m, d) = hijri(2026, 6, 17, 0);
        assert!(y == 1448 && ((m == 1 && d <= 2) || (m == 12 && d >= 29)), "{y}-{m}-{d}");
        let (y, m, d) = hijri(2026, 2, 19, 0);
        assert!(y == 1447 && ((m == 9 && d <= 2) || (m == 8 && d >= 29)), "{y}-{m}-{d}");
        let a = hijri(2026, 10, 26, 0);
        let b = hijri(2026, 10, 26, 1);
        assert_eq!(b.2 as i32 - a.2 as i32, 1);
    }
}


#[cfg(test)]
mod fixture {
    /// Cetak hasil untuk dibandingkan dengan versi TypeScript (src/lib/prayer.test.ts).
    #[test]
    fn print_fixture() {
        let places = [(-6.2088, 106.8456, 7.0, 0.0), (-6.9175, 107.6191, 7.0, 700.0), (-8.6705, 115.2126, 8.0, 0.0), (3.5952, 98.6722, 7.0, 0.0), (-2.5337, 140.7181, 9.0, 0.0)];
        let dates = [(2026, 1, 15), (2026, 3, 20), (2026, 6, 21), (2026, 10, 26), (2027, 12, 31)];
        for (lat, lng, tz, el) in places {
            for (y, m, d) in dates {
                let t = super::compute(y, m, d, &super::Location { lat, lng, tz, elevation: el }, &super::Offsets::default());
                println!("FX [{lat},{lng},{tz},{el},{y},{m},{d},[{},{},{},{},{},{},{},{}]],", t.imsak, t.subuh, t.terbit, t.dhuha, t.dzuhur, t.ashar, t.maghrib, t.isya);
            }
        }
        for (y, m, d) in dates {
            let (a, b, c) = super::hijri(y, m, d, 0);
            println!("HX [{y},{m},{d},{a},{b},{c}],");
        }
    }
}
