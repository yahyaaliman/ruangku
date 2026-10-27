// Kolom tambahan per proyek (mis. "Sumber kandidat", "Skor wawancara", "Link CV").
// Didefinisikan di proyek, diwarisi subproyek, nilainya disimpan di tugas (`custom`).
import type { Item } from "./types";
import type { Project, Task } from "./tasks";
import { lineage } from "./projects";

export type FieldType = "teks" | "angka" | "rupiah" | "pilihan" | "tanggal" | "centang" | "tautan";

export interface FieldDef {
  id: string;
  name: string;
  type: FieldType;
  options?: string[];
}

export const FIELD_TYPES: { id: FieldType; label: string }[] = [
  { id: "teks", label: "Teks" },
  { id: "angka", label: "Angka" },
  { id: "rupiah", label: "Rupiah" },
  { id: "pilihan", label: "Pilihan" },
  { id: "tanggal", label: "Tanggal" },
  { id: "centang", label: "Centang" },
  { id: "tautan", label: "Tautan" },
];

export type FieldValue = string | number | boolean;

/** Kolom yang berlaku untuk proyek: milik leluhur dulu, lalu milik proyek itu sendiri. */
export function fieldsFor(projects: Item<Project>[], projectId: string | undefined): FieldDef[] {
  if (!projectId) return [];
  const seen = new Set<string>();
  const out: FieldDef[] = [];
  for (const p of lineage(projects, projectId)) for (const f of p.fields ?? []) if (!seen.has(f.id)) (seen.add(f.id), out.push(f));
  return out;
}

const rp = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });
const num = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 });

export function formatField(f: FieldDef, v: FieldValue | undefined): string {
  if (v === undefined || v === "" || v === null) return "";
  switch (f.type) {
    case "rupiah":
      return typeof v === "number" ? rp.format(v) : String(v);
    case "angka":
      return typeof v === "number" ? num.format(v) : String(v);
    case "centang":
      return v ? "Ya" : "Tidak";
    case "tanggal":
      return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T00:00`).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" }) : String(v);
    default:
      return String(v);
  }
}

/** Ubah teks masukan menjadi nilai sesuai jenis kolom (mis. "Rp 7,5 jt" → 7500000). */
export function parseField(f: FieldDef, raw: string | boolean): FieldValue | undefined {
  if (f.type === "centang") return Boolean(raw);
  const s = String(raw).trim();
  if (!s) return undefined;
  if (f.type === "angka" || f.type === "rupiah") {
    let t = s.toLowerCase().replace(/rp\.?/g, "").replace(/\s/g, "");
    let mult = 1;
    if (/(jt|juta)$/.test(t)) (mult = 1e6), (t = t.replace(/(jt|juta)$/, ""));
    else if (/(rb|ribu|k)$/.test(t)) (mult = 1e3), (t = t.replace(/(rb|ribu|k)$/, ""));
    // Format Indonesia: titik ribuan, koma desimal.
    if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(t)) t = t.replace(/\./g, "").replace(",", ".");
    else t = t.replace(",", ".");
    const n = Number(t) * mult;
    return Number.isFinite(n) ? Math.round(n * 100) / 100 : undefined;
  }
  if (f.type === "tautan" && !/^[a-z]+:\/\//i.test(s) && /\./.test(s)) return `https://${s}`;
  return s;
}

export type SortDir = 1 | -1;

/** Urutkan tugas berdasarkan kolom (bawaan atau tambahan); kosong selalu di bawah. */
export function sortByField(tasks: Item<Task>[], key: string, dir: SortDir, fields: FieldDef[]): Item<Task>[] {
  const f = fields.find((x) => x.id === key);
  const val = (t: Item<Task>): FieldValue | undefined => (f ? t.custom?.[f.id] : (t as unknown as Record<string, FieldValue | undefined>)[key]);
  return [...tasks].sort((a, b) => {
    const x = val(a);
    const y = val(b);
    const ex = x === undefined || x === "";
    const ey = y === undefined || y === "";
    if (ex || ey) return ex === ey ? 0 : ex ? 1 : -1;
    if (typeof x === "number" && typeof y === "number") return (x - y) * dir;
    return String(x).localeCompare(String(y), "id") * dir;
  });
}

/** CSV (pemisah ;) yang langsung terbuka benar di Excel berbahasa Indonesia. */
export function toCsv(rows: (string | number | boolean | undefined)[][]): string {
  const cell = (v: string | number | boolean | undefined) => {
    const s = v === undefined ? "" : typeof v === "number" ? String(v).replace(".", ",") : String(v);
    return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return "﻿" + rows.map((r) => r.map(cell).join(";")).join("\r\n") + "\r\n";
}
