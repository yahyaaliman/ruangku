// Manajemen keuangan pribadi & proyek di atas buku kas: akun/dompet, transfer, anggaran,
// transaksi berulang (tagihan, gaji), arus kas per bulan, proyeksi saldo, dan catat cepat
// dari teks ("25rb makan siang").
import type { BlockColor, Item } from "./types";
import { addDays, dateKey, parseDateKey } from "./date";
import { parseField } from "./customFields";
import type { Flow, LedgerEntry, Method } from "./ledger";

export const LEDGER_KIND = "ledger";
export const ACCOUNT_KIND = "account";
export const BUDGET_KIND = "budget";
export const RECURRING_KIND = "recurring";

export type AccountType = "tunai" | "bank" | "ewallet" | "kartu" | "investasi" | "lainnya";
export const ACCOUNT_TYPE_LABEL: Record<AccountType, string> = { tunai: "Tunai", bank: "Rekening bank", ewallet: "E-wallet", kartu: "Kartu kredit", investasi: "Investasi/tabungan", lainnya: "Lainnya" };
export const ACCOUNT_EMOJI: Record<AccountType, string> = { tunai: "💵", bank: "🏦", ewallet: "📱", kartu: "💳", investasi: "📈", lainnya: "👛" };

export interface Account {
  name: string;
  type: AccountType;
  /** Saldo awal (per `openingDate`) */
  opening: number;
  openingDate?: string;
  color?: BlockColor;
  /** Akun milik proyek (kosong = pribadi) */
  projectId?: string;
  archived?: boolean;
  order?: number;
}

export interface Budget {
  /** Kategori pengeluaran; "*" = semua pengeluaran */
  category: string;
  amount: number;
  /** bulanan = berlaku tiap bulan; total = anggaran seluruh proyek */
  period: "bulanan" | "total";
  projectId?: string;
}

export type RecurFreq = "bulanan" | "mingguan" | "tahunan";
export const RECUR_FREQ_LABEL: Record<RecurFreq, string> = { bulanan: "Setiap bulan", mingguan: "Setiap minggu", tahunan: "Setiap tahun" };

export interface Recurring {
  title: string;
  type: Flow;
  amount: number;
  category: string;
  accountId?: string;
  projectId?: string;
  party?: string;
  method?: Method;
  freq: RecurFreq;
  /** Tanggal pertama jatuh tempo */
  start: string;
  /** Tanggal terakhir (opsional) */
  end?: string;
  /** Kemunculan terakhir yang sudah dicatat (YYYY-MM-DD) */
  lastPosted?: string;
  /** Kemunculan yang dilewati (tidak dibayar) */
  skipped?: string[];
  active: boolean;
  /** Catat otomatis saat jatuh tempo (debit otomatis, langganan) */
  auto?: boolean;
}

// ---------- Akun ----------
/** Saldo tiap akun: saldo awal + masuk − keluar ± transfer (sampai `upTo` bila diisi). */
export function accountBalances(accounts: Item<Account>[], entries: Pick<LedgerEntry, "type" | "amount" | "accountId" | "toAccountId" | "date">[], upTo?: string): Map<string, number> {
  const m = new Map<string, number>(accounts.map((a) => [a.id, a.opening || 0]));
  for (const e of entries) {
    if (upTo && e.date > upTo) continue;
    if (e.type === "masuk" && e.accountId && m.has(e.accountId)) m.set(e.accountId, m.get(e.accountId)! + e.amount);
    else if (e.type === "keluar" && e.accountId && m.has(e.accountId)) m.set(e.accountId, m.get(e.accountId)! - e.amount);
    else if (e.type === "transfer") {
      if (e.accountId && m.has(e.accountId)) m.set(e.accountId, m.get(e.accountId)! - e.amount);
      if (e.toAccountId && m.has(e.toAccountId)) m.set(e.toAccountId, m.get(e.toAccountId)! + e.amount);
    }
  }
  return m;
}

// ---------- Arus kas ----------
export const monthKey = (d: string) => d.slice(0, 7);
export function lastMonths(ym: string, n: number): string[] {
  const [y, m] = ym.split("-").map(Number);
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(y, m - 1 - (n - 1 - i), 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
}

/** Masuk, keluar, dan bersih per bulan untuk deret bulan tertentu (transfer diabaikan). */
export function cashflow(entries: Pick<LedgerEntry, "type" | "amount" | "date">[], months: string[]): { month: string; masuk: number; keluar: number; net: number }[] {
  const idx = new Map(months.map((m, i) => [m, i]));
  const out = months.map((month) => ({ month, masuk: 0, keluar: 0, net: 0 }));
  for (const e of entries) {
    const i = idx.get(monthKey(e.date));
    if (i === undefined || e.type === "transfer") continue;
    out[i][e.type] += e.amount;
  }
  for (const r of out) r.net = r.masuk - r.keluar;
  return out;
}

/** Pengeluaran per kategori dalam rentang tanggal, terbesar dulu. */
export function byCategory(entries: Pick<LedgerEntry, "type" | "amount" | "date" | "category">[], from: string, to: string, type: Flow = "keluar"): { category: string; total: number }[] {
  const m = new Map<string, number>();
  for (const e of entries) if (e.type === type && e.date >= from && e.date <= to) m.set(e.category, (m.get(e.category) ?? 0) + e.amount);
  return [...m.entries()].map(([category, total]) => ({ category, total })).sort((a, b) => b.total - a.total);
}

// ---------- Anggaran ----------
export interface BudgetStatus {
  budget: Item<Budget>;
  spent: number;
  /** 0..∞ */
  ratio: number;
  state: "aman" | "waspada" | "lewat";
}
/** Status anggaran: bulanan dihitung untuk bulan `ym`, total dihitung sepanjang masa. */
export function budgetStatus(budgets: Item<Budget>[], entries: Pick<LedgerEntry, "type" | "amount" | "date" | "category" | "projectId">[], ym: string, inProject: (budgetProject: string | undefined, entryProject: string | undefined) => boolean): BudgetStatus[] {
  return budgets.map((b) => {
    const spent = entries
      .filter((e) => e.type === "keluar" && (b.category === "*" || e.category === b.category) && inProject(b.projectId, e.projectId) && (b.period === "total" || monthKey(e.date) === ym))
      .reduce((s, e) => s + e.amount, 0);
    const ratio = b.amount > 0 ? spent / b.amount : 0;
    return { budget: b, spent, ratio, state: ratio > 1 ? "lewat" : ratio >= 0.8 ? "waspada" : "aman" };
  });
}

// ---------- Transaksi berulang ----------
function addPeriod(d: Date, freq: RecurFreq, n: number, anchorDay: number): Date {
  if (freq === "mingguan") return addDays(d, 7 * n);
  if (freq === "tahunan") return new Date(d.getFullYear() + n, d.getMonth(), Math.min(anchorDay, daysIn(d.getFullYear() + n, d.getMonth())));
  const y = d.getFullYear();
  const m = d.getMonth() + n;
  const yy = y + Math.floor(m / 12);
  const mm = ((m % 12) + 12) % 12;
  return new Date(yy, mm, Math.min(anchorDay, daysIn(yy, mm)));
}
const daysIn = (y: number, m: number) => new Date(y, m + 1, 0).getDate();

/** Semua tanggal jatuh tempo dalam [from, to]. Tanggal 31 di bulan pendek jatuh di hari terakhir bulan. */
export function occurrences(r: Pick<Recurring, "freq" | "start" | "end">, from: string, to: string): string[] {
  const out: string[] = [];
  const start = parseDateKey(r.start);
  const anchor = start.getDate();
  for (let i = 0; i < 1000; i++) {
    const d = addPeriod(start, r.freq, i, anchor);
    const k = dateKey(d);
    if (k > to || (r.end && k > r.end)) break;
    if (k >= from) out.push(k);
  }
  return out;
}

/** Jatuh tempo yang belum dicatat sampai `until` (termasuk yang terlewat). */
export function dueRecurring(list: Item<Recurring>[], until: string): { rec: Item<Recurring>; date: string }[] {
  const out: { rec: Item<Recurring>; date: string }[] = [];
  for (const r of list) {
    if (!r.active) continue;
    const from = r.lastPosted ? dateKey(addDays(parseDateKey(r.lastPosted), 1)) : r.start;
    for (const d of occurrences(r, from, until)) if (!r.skipped?.includes(d)) out.push({ rec: r, date: d });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.rec.title.localeCompare(b.rec.title));
}

/** Id transaksi dari kemunculan berulang: tetap, sehingga tidak tercatat dua kali antar-perangkat. */
export const recurringTxId = (recId: string, date: string) => `rtx-${recId}-${date}`;

/** Patch setelah kemunculan `date` dicatat atau dilewati. */
export function markRecurring(r: Recurring, date: string, skip = false): Partial<Recurring> {
  const lastPosted = !r.lastPosted || date > r.lastPosted ? date : r.lastPosted;
  return skip ? { lastPosted, skipped: [...new Set([...(r.skipped ?? []), date])].slice(-24) } : { lastPosted };
}

/** Kemunculan berikutnya setelah yang terakhir dicatat (untuk ditampilkan). */
export function nextDue(r: Pick<Recurring, "freq" | "start" | "end" | "lastPosted" | "skipped" | "active">, today: string): string | undefined {
  if (!r.active) return undefined;
  const from = r.lastPosted ? dateKey(addDays(parseDateKey(r.lastPosted), 1)) : r.start;
  const until = dateKey(addDays(parseDateKey(from > today ? from : today), 400));
  return occurrences(r, from, until).find((d) => !r.skipped?.includes(d));
}

/** Transaksi dari satu kemunculan berulang. */
export function postRecurring(r: Item<Recurring>, date: string): LedgerEntry {
  return { date, type: r.type, amount: r.amount, category: r.category, party: r.party, description: r.title, method: r.method, projectId: r.projectId, accountId: r.accountId, recurringId: r.id };
}

/** Proyeksi saldo `days` hari ke depan dari transaksi berulang yang akan jatuh tempo. */
export function forecast(balance: number, list: Item<Recurring>[], today: string, days = 30): { end: number; masuk: number; keluar: number; items: { rec: Item<Recurring>; date: string }[] } {
  const until = dateKey(addDays(parseDateKey(today), days));
  const items = dueRecurring(list, until).filter((x) => x.date >= today);
  let masuk = 0;
  let keluar = 0;
  for (const { rec } of items) {
    if (rec.type === "masuk") masuk += rec.amount;
    else keluar += rec.amount;
  }
  return { end: balance + masuk - keluar, masuk, keluar, items };
}

// ---------- Catat cepat ----------
const KEYWORDS: [RegExp, string][] = [
  [/\b(makan|minum|kopi|jajan|resto|warteg|bakso|nasi|gofood|grabfood|shopeefood|sarapan|snack)\b/i, "Makan & minum"],
  [/\b(bensin|pertalite|pertamax|parkir|ojek|ojol|grab|gojek|maxim|tol|transport|kereta|krl|mrt|lrt|bus|tiket|taksi|angkot)\b/i, "Transportasi"],
  [/\b(listrik|pln|token|pdam|air|gas|elpiji|iuran|ipl|sampah)\b/i, "Tagihan & utilitas"],
  [/\b(pulsa|kuota|internet|wifi|indihome|biznet|myrepublic|paket data)\b/i, "Pulsa & internet"],
  [/\b(belanja|indomaret|alfamart|supermarket|pasar|shopee|tokopedia|lazada|baju|sabun)\b/i, "Belanja"],
  [/\b(obat|dokter|apotek|klinik|rs|rumah sakit|bpjs|vitamin)\b/i, "Kesehatan"],
  [/\b(buku|ukt|spp|kursus|kuliah|sekolah|les|seminar|fotokopi|print)\b/i, "Pendidikan"],
  [/\b(netflix|spotify|youtube|nonton|bioskop|game|hiburan|langganan)\b/i, "Hiburan"],
  [/\b(sedekah|infaq|infak|zakat|donasi|wakaf)\b/i, "Sedekah & zakat"],
  [/\b(sewa|kos|kost|kontrakan|cicilan|kpr|angsuran)\b/i, "Rumah & cicilan"],
  [/\b(gaji|salary|payroll)\b/i, "Gaji"],
  [/\b(bonus|thr)\b/i, "Bonus & THR"],
  [/\b(proyek|termin|invoice|klien|client|fee)\b/i, "Pendapatan proyek"],
];

export function guessCategory(text: string, type: Flow): string {
  for (const [re, cat] of KEYWORDS) if (re.test(text)) {
    const income = ["Gaji", "Bonus & THR", "Pendapatan proyek"].includes(cat);
    if (income === (type === "masuk")) return cat;
  }
  return "Lainnya";
}

/** "25rb makan siang", "makan siang 25.000", "1,5jt gaji" → jumlah, keterangan, kategori tebakan. */
export function parseMoneyText(text: string, type: Flow): { amount: number; description: string; category: string } | null {
  const t = text.trim();
  const re = /(?:rp\.?\s*)?(\d{1,3}(?:[.,]\d{3})+|\d+(?:[.,]\d+)?)\s*(rb|ribu|k|jt|juta)?\b/i;
  const m = re.exec(t);
  if (!m) return null;
  const amount = parseField({ id: "x", name: "x", type: "rupiah" }, `${m[1]}${m[2] ?? ""}`) as number | undefined;
  if (!amount || amount <= 0) return null;
  const description = `${t.slice(0, m.index)} ${t.slice(m.index + m[0].length)}`.replace(/\s+/g, " ").replace(/^[-–:,\s]+|[-–:,\s]+$/g, "").trim();
  return { amount, description, category: guessCategory(description, type) };
}

// ---------- Ringkasan teks (bot, asisten, MCP) ----------
const rpText = (n: number) => `Rp${Math.round(n).toLocaleString("id-ID")}`;

export function financeSummaryText(input: { accounts: Item<Account>[]; entries: Item<LedgerEntry>[]; recurring: Item<Recurring>[]; budgets: Item<Budget>[]; today: string; match?: (projectId: string | undefined) => boolean }): string {
  const match = input.match ?? (() => true);
  const accs = input.accounts.filter((a) => !a.archived && match(a.projectId));
  const entries = input.entries.filter((e) => match(e.projectId));
  const bal = accountBalances(input.accounts, input.entries);
  const ym = input.today.slice(0, 7);
  let masuk = 0;
  let keluar = 0;
  for (const e of entries) if (e.date.startsWith(ym)) e.type === "masuk" ? (masuk += e.amount) : e.type === "keluar" ? (keluar += e.amount) : 0;
  const until = dateKey(addDays(parseDateKey(input.today), 7));
  const due = dueRecurring(input.recurring.filter((r) => match(r.projectId)), until);
  const bs = budgetStatus(input.budgets.filter((b) => b.period === "bulanan" && match(b.projectId)), input.entries, ym, (bp, ep) => (bp ? ep === bp : !ep)).filter((s) => s.state !== "aman");
  const top = byCategory(entries, `${ym}-01`, input.today).slice(0, 3);
  return [
    "💰 *Keuangan*",
    ...(accs.length ? [`Saldo: ${rpText(accs.reduce((s, a) => s + (bal.get(a.id) ?? 0), 0))}`, ...accs.map((a) => `• ${a.name}: ${rpText(bal.get(a.id) ?? 0)}`)] : []),
    `Bulan ini: masuk ${rpText(masuk)}, keluar ${rpText(keluar)} (bersih ${rpText(masuk - keluar)})`,
    ...(top.length ? [`Terbesar: ${top.map((t) => `${t.category} ${rpText(t.total)}`).join(", ")}`] : []),
    ...(bs.length ? ["", "*Anggaran*", ...bs.map((s) => `• ${s.budget.category === "*" ? "Total" : s.budget.category}: ${rpText(s.spent)} / ${rpText(s.budget.amount)}${s.state === "lewat" ? " ⚠️ lewat" : ""}`)] : []),
    ...(due.length ? ["", "*Jatuh tempo 7 hari*", ...due.slice(0, 8).map((d) => `• ${d.date}${d.date < input.today ? " (telat)" : ""} ${d.rec.title} ${d.rec.type === "masuk" ? "+" : "−"}${rpText(d.rec.amount)}`)] : []),
  ].join("\n");
}
