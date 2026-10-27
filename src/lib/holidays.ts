// Libur nasional & cuti bersama Indonesia bawaan (bekerja tanpa internet).
// Sumber: SKB 3 Menteri 2026 dan 2027 (setneg.go.id). Tahun lain: langganan ICS.
import type { IcsEvent } from "./ics";

type H = [date: string, title: string, cuti?: 1];

const DATA: H[] = [
  // 2026
  ["2026-01-01", "Tahun Baru 2026 Masehi"],
  ["2026-01-16", "Isra Mikraj Nabi Muhammad saw."],
  ["2026-02-16", "Tahun Baru Imlek 2577 Kongzili", 1],
  ["2026-02-17", "Tahun Baru Imlek 2577 Kongzili"],
  ["2026-03-18", "Hari Suci Nyepi (Tahun Baru Saka 1948)", 1],
  ["2026-03-19", "Hari Suci Nyepi (Tahun Baru Saka 1948)"],
  ["2026-03-20", "Idulfitri 1447 H", 1],
  ["2026-03-21", "Idulfitri 1447 H"],
  ["2026-03-22", "Idulfitri 1447 H"],
  ["2026-03-23", "Idulfitri 1447 H", 1],
  ["2026-03-24", "Idulfitri 1447 H", 1],
  ["2026-04-03", "Wafat Yesus Kristus"],
  ["2026-04-05", "Kebangkitan Yesus Kristus (Paskah)"],
  ["2026-05-01", "Hari Buruh Internasional"],
  ["2026-05-14", "Kenaikan Yesus Kristus"],
  ["2026-05-15", "Kenaikan Yesus Kristus", 1],
  ["2026-05-27", "Iduladha 1447 H"],
  ["2026-05-28", "Iduladha 1447 H", 1],
  ["2026-05-31", "Hari Raya Waisak 2570 BE"],
  ["2026-06-01", "Hari Lahir Pancasila"],
  ["2026-06-16", "1 Muharam Tahun Baru Islam 1448 H"],
  ["2026-08-17", "Proklamasi Kemerdekaan"],
  ["2026-08-25", "Maulid Nabi Muhammad saw."],
  ["2026-12-24", "Kelahiran Yesus Kristus", 1],
  ["2026-12-25", "Kelahiran Yesus Kristus"],
  // 2027
  ["2027-01-01", "Tahun Baru 2027 Masehi"],
  ["2027-01-05", "Isra Mikraj Nabi Muhammad saw."],
  ["2027-02-05", "Tahun Baru Imlek 2578 Kongzili", 1],
  ["2027-02-06", "Tahun Baru Imlek 2578 Kongzili"],
  ["2027-03-08", "Hari Suci Nyepi (Tahun Baru Saka 1949)"],
  ["2027-03-09", "Idulfitri 1448 H", 1],
  ["2027-03-10", "Idulfitri 1448 H"],
  ["2027-03-11", "Idulfitri 1448 H"],
  ["2027-03-12", "Idulfitri 1448 H", 1],
  ["2027-03-15", "Idulfitri 1448 H", 1],
  ["2027-03-25", "Wafat Yesus Kristus", 1],
  ["2027-03-26", "Wafat Yesus Kristus"],
  ["2027-03-28", "Kebangkitan Yesus Kristus (Paskah)"],
  ["2027-05-01", "Hari Buruh Internasional"],
  ["2027-05-06", "Kenaikan Yesus Kristus"],
  ["2027-05-17", "Iduladha 1448 H"],
  ["2027-05-18", "Iduladha 1448 H", 1],
  ["2027-05-19", "Hari Raya Waisak 2571 BE", 1],
  ["2027-05-20", "Hari Raya Waisak 2571 BE"],
  ["2027-06-01", "Hari Lahir Pancasila"],
  ["2027-06-06", "1 Muharam Tahun Baru Islam 1449 H"],
  ["2027-08-15", "Maulid Nabi Muhammad saw."],
  ["2027-08-17", "Proklamasi Kemerdekaan"],
  ["2027-12-24", "Kelahiran Yesus Kristus", 1],
  ["2027-12-25", "Kelahiran Yesus Kristus"],
  ["2027-12-26", "Isra Mikraj Nabi Muhammad saw."],
];

export const BUILTIN_HOLIDAY_YEARS = [2026, 2027];

export function builtinHolidays(): IcsEvent[] {
  return DATA.map(([date, title, cuti]) => ({ uid: `id-libur-${date}`, title: cuti ? `Cuti bersama: ${title}` : title, date, allDay: true }));
}
