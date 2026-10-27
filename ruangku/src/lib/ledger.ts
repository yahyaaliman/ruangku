// Buku kas sederhana (mis. penitipan infaq): pemasukan, pengeluaran, saldo berjalan,
// rekap per donatur, dan laporan donatur yang bisa dicetak / disimpan sebagai PDF.

export type Flow = "masuk" | "keluar";
/** "transfer" = pindah dana antarakun (tidak dihitung pemasukan/pengeluaran) */
export type TxType = Flow | "transfer";
export type Method = "transfer" | "tunai" | "qris" | "kartu" | "ewallet" | "lainnya";

export interface LedgerEntry {
  date: string; // YYYY-MM-DD
  type: TxType;
  amount: number;
  category: string;
  /** Donatur (pemasukan) atau penerima (pengeluaran) */
  party?: string;
  description?: string;
  method?: Method;
  projectId?: string;
  /** No. bukti / referensi transfer */
  ref?: string;
  /** Akun/dompet sumber (pengeluaran/transfer) atau tujuan (pemasukan) */
  accountId?: string;
  /** Transfer: akun tujuan */
  toAccountId?: string;
  /** Dibuat dari transaksi berulang (tagihan/gaji) */
  recurringId?: string;
}

/** Kategori bawaan: pribadi, proyek/usaha, dan dana titipan (infaq). */
export const CATEGORY_GROUPS: Record<Flow, { group: string; items: string[] }[]> = {
  masuk: [
    { group: "Pribadi", items: ["Gaji", "Bonus & THR", "Usaha sampingan", "Investasi", "Hadiah", "Lainnya"] },
    { group: "Proyek", items: ["Pendapatan proyek", "Termin klien", "Hibah/pendanaan"] },
    { group: "Dana titipan", items: ["Infaq", "Sedekah", "Zakat", "Wakaf", "Donasi umum"] },
  ],
  keluar: [
    { group: "Pribadi", items: ["Makan & minum", "Transportasi", "Belanja", "Tagihan & utilitas", "Pulsa & internet", "Rumah & cicilan", "Kesehatan", "Pendidikan", "Hiburan", "Sedekah & zakat", "Keluarga", "Lainnya"] },
    { group: "Proyek", items: ["Gaji tim", "Vendor & jasa", "Peralatan", "Perangkat lunak", "Pemasaran", "Operasional", "Perjalanan dinas"] },
    { group: "Dana titipan", items: ["Penyaluran", "Biaya bank"] },
  ],
};
export const CATEGORIES: Record<Flow, string[]> = {
  masuk: [...new Set(CATEGORY_GROUPS.masuk.flatMap((g) => g.items))],
  keluar: [...new Set(CATEGORY_GROUPS.keluar.flatMap((g) => g.items))],
};

export const METHODS: { id: Method; label: string }[] = [
  { id: "transfer", label: "Transfer" },
  { id: "tunai", label: "Tunai" },
  { id: "qris", label: "QRIS" },
  { id: "kartu", label: "Kartu debit/kredit" },
  { id: "ewallet", label: "E-wallet" },
  { id: "lainnya", label: "Lainnya" },
];

const rp = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });
export const rupiah = (n: number) => rp.format(Math.round(n)).replace(/ /g, " ");

const sign = (e: Pick<LedgerEntry, "type" | "amount">) => (e.type === "masuk" ? e.amount : e.type === "keluar" ? -e.amount : 0);

type E = LedgerEntry & { id: string };

/** Urut kronologis (tanggal, lalu id) — saldo berjalan bergantung pada urutan ini. */
export const chrono = <T extends E>(list: T[]) => [...list].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));

export function summary(entries: E[], from: string, to: string) {
  let opening = 0;
  let masuk = 0;
  let keluar = 0;
  for (const e of entries) {
    if (e.date < from) opening += sign(e);
    else if (e.date <= to) {
      if (e.type === "masuk") masuk += e.amount;
      else if (e.type === "keluar") keluar += e.amount;
    }
  }
  return { opening, masuk, keluar, closing: opening + masuk - keluar };
}

/** Baris dengan saldo berjalan (dalam urutan kronologis). */
export function withBalance<T extends E>(entries: T[]): (T & { balance: number })[] {
  let b = 0;
  return chrono(entries).map((e) => ({ ...e, balance: (b += sign(e)) }));
}

export function byMonth(entries: E[]): { month: string; masuk: number; keluar: number }[] {
  const m = new Map<string, { masuk: number; keluar: number }>();
  for (const e of entries) {
    if (e.type === "transfer") continue;
    const k = e.date.slice(0, 7);
    const v = m.get(k) ?? { masuk: 0, keluar: 0 };
    v[e.type] += e.amount;
    m.set(k, v);
  }
  return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([month, v]) => ({ month, ...v }));
}

export const partyKey = (p: string) => p.trim().toLocaleLowerCase("id-ID").replace(/\s+/g, " ");

/** Rekap donatur: total, jumlah transaksi, dan tanggal terakhir. Nama dicocokkan tanpa beda huruf besar/spasi. */
export function byParty(entries: E[], type: Flow = "masuk"): { party: string; total: number; count: number; last: string }[] {
  const m = new Map<string, { party: string; total: number; count: number; last: string }>();
  for (const e of entries) {
    if (e.type !== type || !e.party?.trim()) continue;
    const k = partyKey(e.party);
    const v = m.get(k) ?? { party: e.party.trim(), total: 0, count: 0, last: e.date };
    v.total += e.amount;
    v.count++;
    if (e.date > v.last) v.last = e.date;
    m.set(k, v);
  }
  return [...m.values()].sort((a, b) => b.total - a.total);
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const fDate = (d: string) => new Date(`${d}T00:00`).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });

export interface ReportInput {
  org: string;
  donor: string;
  from: string;
  to: string;
  entries: E[];
  /** Penyaluran pada periode yang sama (untuk transparansi), opsional */
  distributed?: number;
  note?: string;
}

/** Laporan donatur sebagai dokumen HTML mandiri yang rapi saat dicetak (A4). */
export function donorReportHtml(r: ReportInput): string {
  const mine = chrono(r.entries.filter((e) => e.type === "masuk" && e.party && partyKey(e.party) === partyKey(r.donor) && e.date >= r.from && e.date <= r.to));
  const total = mine.reduce((s, e) => s + e.amount, 0);
  const rows = mine
    .map((e) => `<tr><td>${esc(fDate(e.date))}</td><td>${esc(e.category)}${e.description ? ` — ${esc(e.description)}` : ""}</td><td>${esc(METHODS.find((m) => m.id === e.method)?.label ?? "")}</td><td>${esc(e.ref ?? "")}</td><td class="n">${esc(rupiah(e.amount))}</td></tr>`)
    .join("");
  return `<!doctype html><html lang="id"><head><meta charset="utf-8"><title>Laporan donatur — ${esc(r.donor)}</title>
<style>
@page { size: A4; margin: 18mm 16mm; }
* { box-sizing: border-box; }
body { font: 11pt/1.5 "Segoe UI", system-ui, sans-serif; color: #1c2433; margin: 0; }
@media screen { body { padding: 28px 32px; max-width: 820px; margin: 0 auto; } }
header { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #1c2433; padding-bottom: 8px; margin-bottom: 16px; }
h1 { font-size: 18pt; margin: 0; letter-spacing: -0.01em; }
.org { font-weight: 700; font-size: 12pt; }
.muted { color: #5b6476; }
table { width: 100%; border-collapse: collapse; margin: 12px 0; }
th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid #d5dae3; vertical-align: top; }
th { font-size: 9.5pt; text-transform: uppercase; letter-spacing: 0.04em; color: #5b6476; }
td.n, th.n { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
tfoot td { font-weight: 700; border-top: 2px solid #1c2433; border-bottom: 0; }
.box { border: 1px solid #d5dae3; border-radius: 6px; padding: 10px 12px; margin-top: 14px; }
.sign { margin-top: 36px; display: flex; justify-content: flex-end; }
.sign div { text-align: center; min-width: 200px; }
.sign .line { margin-top: 56px; border-top: 1px solid #1c2433; }
</style></head><body>
<header><div><div class="org">${esc(r.org)}</div><h1>Laporan Donatur</h1></div><div class="muted">Periode ${esc(fDate(r.from))} – ${esc(fDate(r.to))}</div></header>
<p>Kepada Yth. <b>${esc(r.donor)}</b>,<br>terima kasih atas kepercayaan Bapak/Ibu. Berikut rincian titipan yang kami terima pada periode ini.</p>
<table><thead><tr><th>Tanggal</th><th>Keterangan</th><th>Metode</th><th>No. bukti</th><th class="n">Jumlah</th></tr></thead>
<tbody>${rows || `<tr><td colspan="5" class="muted">Tidak ada transaksi pada periode ini.</td></tr>`}</tbody>
<tfoot><tr><td colspan="4">Total titipan</td><td class="n">${esc(rupiah(total))}</td></tr></tfoot></table>
${r.distributed !== undefined ? `<div class="box">Pada periode yang sama, lembaga menyalurkan dana sebesar <b>${esc(rupiah(r.distributed))}</b> kepada penerima manfaat.</div>` : ""}
${r.note ? `<div class="box">${esc(r.note).replace(/\n/g, "<br>")}</div>` : ""}
<div class="sign"><div>${esc(fDate(r.to))}<div class="line">Pengelola</div></div></div>
<p class="muted" style="font-size:9pt;margin-top:24px">Dibuat dengan Ruangku.</p>
</body></html>`;
}

/** Baris CSV buku kas (dipakai bersama toCsv). */
export function ledgerRows(entries: (E & { balance?: number })[], projectName: (id?: string) => string) {
  return [
    ["Tanggal", "Jenis", "Kategori", "Donatur/Penerima", "Keterangan", "Metode", "No. bukti", "Masuk", "Keluar", "Saldo", "Proyek"],
    ...withBalance(entries).map((e) => [e.date, e.type === "masuk" ? "Masuk" : e.type === "keluar" ? "Keluar" : "Transfer", e.category, e.party ?? "", e.description ?? "", METHODS.find((m) => m.id === e.method)?.label ?? "", e.ref ?? "", e.type === "masuk" ? e.amount : undefined, e.type === "keluar" ? e.amount : undefined, e.balance, projectName(e.projectId)]),
  ];
}
