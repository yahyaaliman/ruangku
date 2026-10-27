// Keuangan: buku kas pribadi & proyek. Akun/dompet dengan saldo, transfer, anggaran per
// kategori, tagihan & pemasukan rutin, arus kas bulanan, proyeksi 30 hari, catat cepat
// dari teks, laporan donatur (dana titipan), dan ekspor CSV.
import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, ArrowDownLeft, ArrowLeftRight, ArrowUpRight, CalendarClock, CheckCircle2, Download, FileText, Pencil, PiggyBank, Plus, Printer, Repeat, Search, SkipForward, Trash2, Wallet, Zap } from "lucide-react";
import type { Item } from "../lib/types";
import { strip, useRecords } from "../lib/useRecords";
import { useScope } from "../lib/scope";
import { Confirm, Field, Modal, Progress, useToast } from "../components/ui";
import { byParty, CATEGORY_GROUPS, chrono, donorReportHtml, ledgerRows, METHODS, rupiah, summary, type Flow, type LedgerEntry, type TxType } from "../lib/ledger";
import { ACCOUNT_EMOJI, ACCOUNT_KIND, ACCOUNT_TYPE_LABEL, accountBalances, BUDGET_KIND, budgetStatus, byCategory, cashflow, dueRecurring, forecast, lastMonths, LEDGER_KIND, markRecurring, nextDue, parseMoneyText, postRecurring, RECUR_FREQ_LABEL, RECURRING_KIND, recurringTxId, type Account, type Budget, type Recurring } from "../lib/finance";
import { toCsv } from "../lib/customFields";
import { api, newId, saveTextFile } from "../lib/api";
import { addDays, dateKey, parseDateKey } from "../lib/date";
import { ProjectChip } from "../projects/ProjectSwitcher";
import { projectOf } from "../lib/tasks";
import { scopeSet } from "../lib/projects";
import { useJsonSetting } from "../lib/useSetting";
import { useOpenRequest } from "../lib/deeplink";
import { AccountForm, AccountSelect, BudgetForm, EntryForm, RecurringForm } from "../finance/forms";
import { CashflowChart, CategoryBars, compactRp } from "../finance/FinanceCharts";
import "./ledger.css";
import { groupRuns, usePageLayout, type SectionDef } from "../lib/pageLayout";
import { LayoutCheck, LayoutMenu, LayoutSeg } from "../components/LayoutMenu";

const monthRange = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  return { from: `${ym}-01`, to: dateKey(addDays(new Date(y, m, 1), -1)) };
};
const fMonth = (ym: string) => new Date(`${ym}-01T00:00`).toLocaleDateString("id-ID", { month: "long", year: "numeric" });
const fDay = (d: string) => parseDateKey(d).toLocaleDateString("id-ID", { day: "numeric", month: "short" });
const fDayLong = (d: string) => parseDateKey(d).toLocaleDateString("id-ID", { weekday: "short", day: "numeric", month: "short" });
const daysBetween = (a: string, b: string) => Math.round((parseDateKey(b).getTime() - parseDateKey(a).getTime()) / 86400000);

type E = Item<LedgerEntry>;
type Tab = "ringkasan" | "transaksi" | "anggaran" | "berulang" | "akun" | "donatur";
const TABS: { id: Tab; label: string }[] = [
  { id: "ringkasan", label: "Ringkasan" },
  { id: "transaksi", label: "Transaksi" },
  { id: "anggaran", label: "Anggaran" },
  { id: "berulang", label: "Tagihan rutin" },
  { id: "akun", label: "Akun" },
  { id: "donatur", label: "Donatur" },
];
type Owner = "semua" | "pribadi" | "proyek";
const FIN_SECTIONS: SectionDef[] = [
  { id: "tiles", label: "Kartu ringkasan" },
  { id: "alert", label: "Peringatan jatuh tempo" },
  { id: "cashflow", label: "Arus kas", canWide: true, wide: true },
  { id: "accounts", label: "Akun & dompet", canWide: true },
  { id: "categories", label: "Pengeluaran per kategori", canWide: true },
  { id: "budgets", label: "Anggaran bulan ini", canWide: true },
  { id: "due", label: "Jadwal 14 hari", canWide: true },
];
const CARD_IDS = new Set(["cashflow", "accounts", "categories", "budgets", "due"]);
interface FinPrefs {
  defaultAccount?: string;
  months: number;
}
const TAB_KEY = "ruangku-fin-tab";
const OWNER_KEY = "ruangku-fin-owner";
const TITIPAN = new Set([...(CATEGORY_GROUPS.masuk.find((g) => g.group === "Dana titipan")?.items ?? []), ...(CATEGORY_GROUPS.keluar.find((g) => g.group === "Dana titipan")?.items ?? [])]);
const isTitipan = (e: Pick<LedgerEntry, "category">) => TITIPAN.has(e.category);
const readTab = (): Tab => {
  try {
    const v = localStorage.getItem(TAB_KEY) as Tab | null;
    return v && TABS.some((t) => t.id === v) ? v : "ringkasan";
  } catch {
    return "ringkasan";
  }
};

function ReportModal({ entries, donors, org0, onClose }: { entries: E[]; donors: string[]; org0: string; onClose: () => void }) {
  const toast = useToast();
  const [donor, setDonor] = useState(donors[0] ?? "");
  const now = new Date();
  const [from, setFrom] = useState(`${now.getFullYear()}-01-01`);
  const [to, setTo] = useState(dateKey());
  const [org, setOrg] = useState(org0);
  const [note, setNote] = useState("");
  const frame = useRef<HTMLIFrameElement>(null);
  const distributed = useMemo(() => entries.filter((e) => e.type === "keluar" && e.category === "Penyaluran" && e.date >= from && e.date <= to).reduce((s, e) => s + e.amount, 0), [entries, from, to]);
  const html = useMemo(() => donorReportHtml({ org, donor, from, to, entries, distributed, note: note.trim() || undefined }), [org, donor, from, to, entries, distributed, note]);
  useEffect(() => {
    api.setSetting("ledger_org", org).catch(() => {});
  }, [org]);
  return (
    <Modal
      title="Laporan donatur"
      onClose={onClose}
      wide
      footer={
        <>
          <button
            className="btn"
            onClick={async () => {
              const p = await saveTextFile("Simpan laporan", `laporan-${donor.replace(/[^\w-]+/g, "-").toLowerCase()}-${to}.html`, html, { name: "Halaman web", extensions: ["html"] }, "text/html");
              if (p) toast(`Laporan disimpan: ${p}`);
            }}
          >
            <Download size={15} /> Simpan HTML
          </button>
          <button className="btn btn-primary" onClick={() => frame.current?.contentWindow?.print()} disabled={!donor}>
            <Printer size={15} /> Cetak / simpan PDF
          </button>
        </>
      }
    >
      <div className="ld-report">
        <div className="form">
          <Field label="Donatur">
            <select value={donor} onChange={(e) => setDonor(e.target.value)}>
              {donors.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </Field>
          <div className="form-row">
            <Field label="Dari">
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </Field>
            <Field label="Sampai">
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </Field>
          </div>
          <Field label="Nama lembaga">
            <input value={org} onChange={(e) => setOrg(e.target.value)} />
          </Field>
          <Field label="Catatan tambahan" hint="Mis. ringkasan program yang didanai.">
            <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
          <p className="muted small">Pilih "Simpan sebagai PDF" di dialog cetak untuk mengirim laporan lewat WhatsApp atau email.</p>
        </div>
        <iframe ref={frame} className="ld-preview" title="Pratinjau laporan" srcDoc={html} />
      </div>
    </Modal>
  );
}

export default function Ledger() {
  const toast = useToast();
  const scope = useScope();
  const ledger = useRecords<LedgerEntry>(LEDGER_KIND);
  const accounts = useRecords<Account>(ACCOUNT_KIND);
  const budgets = useRecords<Budget>(BUDGET_KIND);
  const recurring = useRecords<Recurring>(RECURRING_KIND);
  const [prefs, savePrefs] = useJsonSetting<FinPrefs>("finance_prefs", { months: 6 });
  const today = dateKey();
  const [tab, setTabState] = useState<Tab>(readTab);
  const setTab = (t: Tab) => {
    setTabState(t);
    try {
      localStorage.setItem(TAB_KEY, t);
    } catch {
      /* abaikan */
    }
  };
  const [owner, setOwnerState] = useState<Owner>(() => {
    try {
      return (localStorage.getItem(OWNER_KEY) as Owner) || "semua";
    } catch {
      return "semua";
    }
  });
  const setOwner = (o: Owner) => {
    setOwnerState(o);
    try {
      localStorage.setItem(OWNER_KEY, o);
    } catch {
      /* abaikan */
    }
  };
  const [ym, setYm] = useState(() => today.slice(0, 7));
  const [all, setAll] = useState(false);
  const [q, setQ] = useState("");
  const [fAccount, setFAccount] = useState<string>("");
  const [fType, setFType] = useState<"" | TxType>("");
  const [fCat, setFCat] = useState("");
  const [form, setForm] = useState<{ type: TxType; initial?: E } | null>(null);
  const [accForm, setAccForm] = useState<{ initial?: Item<Account> } | null>(null);
  const [budForm, setBudForm] = useState<{ initial?: Item<Budget>; category?: string } | null>(null);
  const [recForm, setRecForm] = useState<{ initial?: Item<Recurring> } | null>(null);
  const [report, setReport] = useState(false);
  const [del, setDel] = useState<{ title: string; text: string; run: () => void } | null>(null);
  const [org, setOrg] = useState("");
  const [quick, setQuick] = useState("");
  const [quickType, setQuickType] = useState<Flow>("keluar");
  const fl = usePageLayout("keuangan", FIN_SECTIONS);
  const hiddenTabs = fl.opt<string[]>("hideTabs", []);
  const shownTabs = TABS.filter((t) => t.id === tab || !hiddenTabs.includes(t.id));
  useEffect(() => {
    api.getSetting("ledger_org").then((v) => setOrg(v ?? ""));
  }, []);
  // Dari palet/dasbor: "keluar"/"masuk"/"transfer" = buka formulir; "tagihan" = tab rutin.
  useOpenRequest(
    "finance",
    (what) => {
      if (what === "tagihan") return setTab("berulang");
      if (what === "masuk" || what === "keluar" || what === "transfer") setForm({ type: what });
    },
    !ledger.loading,
  );

  // ---------- Ruang lingkup ----------
  const inView = (pid: string | undefined) => scope.match(pid) && (scope.current || owner === "semua" || (owner === "pribadi" ? !pid : !!pid));
  const entries = useMemo(() => ledger.items.filter((e) => inView(e.projectId)), [ledger.items, scope, owner]);
  const accs = useMemo(() => accounts.items.filter((a) => inView(a.projectId)).sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.name.localeCompare(b.name)), [accounts.items, scope, owner]);
  const liveAccs = accs.filter((a) => !a.archived);
  const allLiveAccs = accounts.items.filter((a) => !a.archived && scope.match(a.projectId));
  const buds = useMemo(() => budgets.items.filter((b) => inView(b.projectId)), [budgets.items, scope, owner]);
  const recs = useMemo(() => recurring.items.filter((r) => inView(r.projectId)).sort((a, b) => (nextDue(a, today) ?? "9").localeCompare(nextDue(b, today) ?? "9")), [recurring.items, scope, owner, today]);

  const balances = useMemo(() => accountBalances(accounts.items, ledger.items), [accounts.items, ledger.items]);
  const accIds = useMemo(() => new Set(accs.map((a) => a.id)), [accs]);
  const totalBalance = useMemo(() => {
    let t = accs.reduce((s, a) => s + (balances.get(a.id) ?? 0), 0);
    for (const e of entries) if (e.type !== "transfer" && (!e.accountId || !accIds.has(e.accountId))) t += e.type === "masuk" ? e.amount : -e.amount;
    return t;
  }, [accs, balances, entries, accIds]);

  const range = all ? { from: "0000-01-01", to: "9999-12-31" } : monthRange(ym);
  const sum = summary(entries, range.from, range.to);
  const prevYm = lastMonths(ym, 2)[0];
  const prevSum = summary(entries, monthRange(prevYm).from, monthRange(prevYm).to);
  const months = useMemo(() => lastMonths(ym, prefs.months || 6), [ym, prefs.months]);
  const flow = useMemo(() => cashflow(entries, months), [entries, months]);
  const cats = useMemo(() => byCategory(entries, range.from, range.to), [entries, range.from, range.to]);
  const projSet = (pid: string) => scopeSet(scope.allProjects, pid);
  const budgetMatch = (bp: string | undefined, ep: string | undefined) => (bp ? !!ep && (projSet(bp)?.has(ep) ?? ep === bp) : !ep);
  const bstat = useMemo(() => budgetStatus(buds, ledger.items, ym, budgetMatch), [buds, ledger.items, ym, scope.allProjects]);
  const due = useMemo(() => dueRecurring(recs, dateKey(addDays(parseDateKey(today), 14))), [recs, today]);
  const fc = useMemo(() => forecast(totalBalance, recs, today, 30), [totalBalance, recs, today]);
  const parties = useMemo(() => [...new Set(entries.map((e) => e.party?.trim()).filter(Boolean) as string[])].sort(), [entries]);
  const userCats = useMemo(() => [...new Set(ledger.items.map((e) => e.category))].filter((c) => c && c !== "Transfer"), [ledger.items]);
  const titipan = useMemo(() => entries.filter(isTitipan), [entries]);
  const donors = useMemo(() => byParty(titipan.filter((e) => e.date >= range.from && e.date <= range.to)), [titipan, range.from, range.to]);
  const allDonors = useMemo(() => byParty(titipan).map((d) => d.party), [titipan]);
  const unbudgeted = useMemo(() => byCategory(scope.current ? entries : entries.filter((e) => !e.projectId), range.from, range.to).filter((c) => !buds.some((b) => b.category === c.category && b.period === "bulanan" && !b.projectId === !scope.current)), [entries, buds, range.from, range.to, scope]);
  const projName = (id?: string) => (id ? projectOf(scope.allProjects, id).name : "");
  const accName = (id?: string) => accounts.items.find((a) => a.id === id);
  const defaultAccount = prefs.defaultAccount && allLiveAccs.some((a) => a.id === prefs.defaultAccount) ? prefs.defaultAccount : allLiveAccs.length === 1 ? allLiveAccs[0].id : undefined;

  // ---------- Aksi ----------
  const saveEntry = async (e: LedgerEntry, id?: string) => {
    await ledger.save(e, id ?? newId());
    toast(`${e.type === "masuk" ? "Pemasukan" : e.type === "keluar" ? "Pengeluaran" : "Transfer"} ${rupiah(e.amount)} dicatat`);
  };
  const removeEntry = (e: E) =>
    setDel({
      title: "Hapus transaksi?",
      text: `${e.type === "masuk" ? "Pemasukan" : e.type === "keluar" ? "Pengeluaran" : "Transfer"} ${rupiah(e.amount)} tanggal ${fDay(e.date)} akan dihapus dan saldo dihitung ulang.`,
      run: async () => {
        await ledger.remove(e.id);
        toast("Transaksi dihapus", "info", { label: "Urungkan", run: () => ledger.save(strip(e), e.id) });
      },
    });
  const postDue = async (r: Item<Recurring>, date: string) => {
    await ledger.save(postRecurring(r, date), recurringTxId(r.id, date));
    await recurring.save({ ...strip(r), ...markRecurring(r, date) }, r.id);
    toast(`${r.title} ${rupiah(r.amount)} dicatat (${fDay(date)})`);
  };
  const skipDue = async (r: Item<Recurring>, date: string) => {
    await recurring.save({ ...strip(r), ...markRecurring(r, date, true) }, r.id);
    toast(`${r.title} ${fDay(date)} dilewati`);
  };
  const submitQuick = async () => {
    const p = parseMoneyText(quick, quickType);
    if (!p) return toast("Tulis jumlahnya, mis. 25rb makan siang", "error");
    const e: LedgerEntry = { date: today, type: quickType, amount: p.amount, category: p.category, description: p.description || undefined, accountId: defaultAccount, projectId: scope.defaultProjectId, method: accName(defaultAccount)?.type === "tunai" ? "tunai" : "transfer" };
    const id = newId();
    await ledger.save(e, id);
    setQuick("");
    toast(`${quickType === "masuk" ? "Masuk" : "Keluar"} ${rupiah(p.amount)} · ${p.category}`, "info", { label: "Ubah", run: () => setForm({ type: e.type, initial: { ...e, id, updatedAt: Date.now() } }) });
  };

  // ---------- Baris transaksi ----------
  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    const acc = fAccount ? accounts.items.find((a) => a.id === fAccount) : undefined;
    const effect = (e: E) => {
      if (acc) {
        if (e.type === "transfer") return e.accountId === acc.id ? -e.amount : e.toAccountId === acc.id ? e.amount : 0;
        return e.accountId === acc.id ? (e.type === "masuk" ? e.amount : -e.amount) : 0;
      }
      return e.type === "masuk" ? e.amount : e.type === "keluar" ? -e.amount : 0;
    };
    const base = acc ? ledger.items.filter((e) => e.accountId === acc.id || e.toAccountId === acc.id) : entries;
    let bal = acc ? acc.opening : accs.reduce((s, a) => s + a.opening, 0);
    const withBal = chrono(base).map((e) => ({ ...e, balance: (bal += effect(e)) }));
    return withBal
      .filter((e) => e.date >= range.from && e.date <= range.to)
      .filter((e) => !fType || e.type === fType)
      .filter((e) => !fCat || e.category === fCat)
      .filter((e) => !term || `${e.party ?? ""} ${e.category} ${e.description ?? ""} ${e.ref ?? ""} ${accName(e.accountId)?.name ?? ""}`.toLowerCase().includes(term))
      .reverse();
  }, [entries, ledger.items, accounts.items, accs, range.from, range.to, q, fAccount, fType, fCat]);

  const openTx = (filter: { cat?: string; ym?: string }) => {
    if (filter.ym) (setYm(filter.ym), setAll(false));
    setFCat(filter.cat ?? "");
    setFType(filter.cat ? "keluar" : "");
    setTab("transaksi");
  };

  const delta = (cur: number, prev: number) => (prev ? Math.round(((cur - prev) / prev) * 100) : null);
  const dOut = delta(sum.keluar, prevSum.keluar);
  const overdue = due.filter((d) => d.date <= today);

  const renderSection = (id: string): ReactNode => {
    switch (id) {
      case "tiles":
        return (
          <section className="ld-tiles">
            <div className="ld-tile main">
              <span>
                <Wallet size={14} /> Saldo {liveAccs.length ? `${liveAccs.length} akun` : "kas"}
              </span>
              <b>{rupiah(totalBalance)}</b>
              <small>{entries.length} transaksi tercatat</small>
            </div>
            <div className="ld-tile in">
              <span>
                <ArrowDownLeft size={14} /> Masuk {fMonth(ym)}
              </span>
              <b>{rupiah(sum.masuk)}</b>
              <small>{prevSum.masuk ? `bulan lalu ${compactRp(prevSum.masuk)}` : "—"}</small>
            </div>
            <div className="ld-tile out">
              <span>
                <ArrowUpRight size={14} /> Keluar {fMonth(ym)}
              </span>
              <b>{rupiah(sum.keluar)}</b>
              <small>{dOut === null ? "—" : `${dOut > 0 ? "▲" : dOut < 0 ? "▼" : "="} ${Math.abs(dOut)}% dari bulan lalu`}</small>
            </div>
            <div className="ld-tile">
              <span>
                <CalendarClock size={14} /> Proyeksi 30 hari
              </span>
              <b className={fc.end < 0 ? "neg" : ""}>{rupiah(fc.end)}</b>
              <small>{fc.items.length ? `${fc.items.length} jadwal rutin · −${compactRp(fc.keluar)} +${compactRp(fc.masuk)}` : "belum ada tagihan rutin"}</small>
            </div>
          </section>
        );
      case "alert":
        return (
          <>
          {overdue.length > 0 && (
            <div className="fin-alert" role="status">
              <AlertTriangle size={16} />
              <span>
                {overdue.length} tagihan/pemasukan rutin sudah jatuh tempo: {overdue.slice(0, 3).map((d) => d.rec.title).join(", ")}
                {overdue.length > 3 ? ", …" : ""}
              </span>
              <button className="btn btn-sm" onClick={() => setTab("berulang")}>
                Tinjau
              </button>
            </div>
          )}
          </>
        );
      case "cashflow":
        return (
            <section className={`fin-card ${fl.isWide("cashflow") ? "span2" : ""}`}>
              <header>
                <h2>Arus kas {months.length} bulan</h2>
                <select value={prefs.months || 6} onChange={(e) => savePrefs({ ...prefs, months: Number(e.target.value) })} aria-label="Rentang">
                  <option value={6}>6 bulan</option>
                  <option value={12}>12 bulan</option>
                </select>
              </header>
              <p className="fin-headline">
                {flow[flow.length - 1].net >= 0 ? `Surplus ${rupiah(flow[flow.length - 1].net)}` : `Defisit ${rupiah(-flow[flow.length - 1].net)}`} di {fMonth(ym)}; rata-rata bersih {rupiah(flow.reduce((s, f) => s + f.net, 0) / flow.length)}/bulan.
              </p>
              <CashflowChart data={flow} onPick={(m) => openTx({ ym: m })} />
            </section>
        );
      case "accounts":
        return (
            <section className={`fin-card ${fl.isWide("accounts") ? "span2" : ""}`}>
              <header>
                <h2>Akun & dompet</h2>
                <button className="btn btn-sm btn-ghost" onClick={() => setAccForm({})}>
                  <Plus size={14} /> Akun
                </button>
              </header>
              {liveAccs.length === 0 ? (
                <p className="muted small">Tambahkan rekening, e-wallet, atau dompet tunai agar saldo tiap akun terpantau. Tanpa akun pun buku kas tetap jalan.</p>
              ) : (
                <ul className="fin-accs">
                  {liveAccs.map((a) => (
                    <li key={a.id}>
                      <button
                        onClick={() => {
                          setFAccount(a.id);
                          setTab("transaksi");
                        }}
                      >
                        <span className={`fin-acc-ico cc-${a.color ?? "abu"}`}>{ACCOUNT_EMOJI[a.type]}</span>
                        <span className="fin-acc-name">
                          {a.name}
                          <small>{ACCOUNT_TYPE_LABEL[a.type]}</small>
                        </span>
                        <b className={(balances.get(a.id) ?? 0) < 0 ? "neg" : ""}>{rupiah(balances.get(a.id) ?? 0)}</b>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
        );
      case "categories":
        return (
            <section className={`fin-card ${fl.isWide("categories") ? "span2" : ""}`}>
              <header>
                <h2>Pengeluaran per kategori</h2>
                <small className="muted">{fMonth(ym)}</small>
              </header>
              <CategoryBars data={cats} onPick={(c) => openTx({ cat: c })} />
            </section>
        );
      case "budgets":
        return (
            <section className={`fin-card ${fl.isWide("budgets") ? "span2" : ""}`}>
              <header>
                <h2>Anggaran {fMonth(ym)}</h2>
                <button className="btn btn-sm btn-ghost" onClick={() => setBudForm({})}>
                  <Plus size={14} /> Anggaran
                </button>
              </header>
              <BudgetList stats={bstat.filter((s) => s.budget.period === "bulanan").slice(0, 6)} onEdit={(b) => setBudForm({ initial: b })} empty="Belum ada anggaran bulanan. Tetapkan batas untuk makan, transportasi, atau total pengeluaran." />
            </section>
        );
      case "due":
        return (
            <section className={`fin-card ${fl.isWide("due") ? "span2" : ""}`}>
              <header>
                <h2>Jadwal 14 hari</h2>
                <button className="btn btn-sm btn-ghost" onClick={() => setRecForm({})}>
                  <Plus size={14} /> Rutin
                </button>
              </header>
              <DueList due={due.slice(0, 7)} today={today} onPost={postDue} onSkip={skipDue} accName={(id) => accName(id)?.name} empty="Tidak ada tagihan atau pemasukan rutin dalam 14 hari." />
            </section>
        );
    }
    return null;
  };

  return (
    <div className="page ld-page">
      <header className="page-head">
        <div>
          <h1>Keuangan</h1>
          <p className="page-sub">Buku kas pribadi & proyek: akun, anggaran, tagihan rutin, arus kas, dan laporan donatur.{scope.current ? ` Menampilkan ${scope.current.name}.` : ""}</p>
        </div>
        <div className="btn-row">
          {liveAccs.length >= 2 && (
            <button className="btn" onClick={() => setForm({ type: "transfer" })}>
              <ArrowLeftRight size={15} /> Transfer
            </button>
          )}
          <button className="btn" onClick={() => setForm({ type: "keluar" })}>
            <ArrowUpRight size={15} /> Pengeluaran
          </button>
          <button className="btn btn-primary" onClick={() => setForm({ type: "masuk" })}>
            <Plus size={15} /> Pemasukan
          </button>
        </div>
      </header>

      {fl.opt("quick", true) && <form
        className="fin-quick"
        onSubmit={(e) => {
          e.preventDefault();
          void submitQuick();
        }}
      >
        <Zap size={15} className="fin-quick-ico" />
        <div className="seg" role="tablist" aria-label="Jenis">
          {(["keluar", "masuk"] as Flow[]).map((t) => (
            <button type="button" key={t} role="tab" aria-selected={quickType === t} className={quickType === t ? "active" : ""} onClick={() => setQuickType(t)}>
              {t === "keluar" ? "Keluar" : "Masuk"}
            </button>
          ))}
        </div>
        <input value={quick} onChange={(e) => setQuick(e.target.value)} placeholder={quickType === "keluar" ? "Catat cepat: 25rb makan siang · bensin 50.000 · 1,2jt sewa kos" : "Catat cepat: 1,5jt honor asisten · 250rb jual buku"} aria-label="Catat cepat" />
        {allLiveAccs.length > 0 && (
          <span className="fin-quick-acc" title="Akun bawaan untuk catat cepat">
            <AccountSelect value={defaultAccount} onChange={(v) => savePrefs({ ...prefs, defaultAccount: v })} accounts={allLiveAccs} label="Tanpa akun" />
          </span>
        )}
        <button className="btn btn-primary btn-sm" disabled={!quick.trim()}>
          Catat
        </button>
      </form>}

      <div className="fin-bar">
        <div className="seg" role="tablist">
          {shownTabs.map((t) => (
            <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? "active" : ""} onClick={() => setTab(t.id)}>
              {t.label}
              {t.id === "berulang" && overdue.length > 0 && <span className="fin-badge">{overdue.length}</span>}
            </button>
          ))}
        </div>
        <span className="spacer" />
        <LayoutMenu layout={fl} title="Atur tampilan Keuangan" compact>
          <LayoutCheck label="Kolom catat cepat" checked={fl.opt("quick", true)} onChange={(v) => fl.setOpt("quick", v)} />
          <LayoutSeg label="Kolom kartu di Ringkasan" value={String(fl.opt("cols", 3))} options={[["2", "2 kolom"], ["3", "3 kolom"]]} onChange={(v) => fl.setOpt("cols", Number(v))} />
          <span className="lay-opt-label">Tab yang tampil</span>
          {TABS.filter((t) => t.id !== "ringkasan").map((t) => (
            <LayoutCheck key={t.id} label={t.label} checked={!hiddenTabs.includes(t.id)} onChange={(v) => fl.setOpt("hideTabs", v ? hiddenTabs.filter((x) => x !== t.id) : [...hiddenTabs, t.id])} />
          ))}
        </LayoutMenu>
        {!scope.current && (
          <select className="fin-owner" value={owner} onChange={(e) => setOwner(e.target.value as Owner)} aria-label="Pemilik">
            <option value="semua">Pribadi + proyek</option>
            <option value="pribadi">Pribadi saja</option>
            <option value="proyek">Proyek saja</option>
          </select>
        )}
        {tab !== "akun" && tab !== "berulang" && (
          <>
            <input type="month" value={ym} onChange={(e) => (setYm(e.target.value || today.slice(0, 7)), setAll(false))} disabled={all && tab !== "ringkasan"} aria-label="Bulan" />
            {(tab === "transaksi" || tab === "donatur") && (
              <label className="check-row">
                <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> Semua periode
              </label>
            )}
          </>
        )}
      </div>

      {tab === "ringkasan" &&
        groupRuns(fl.visible.map((x) => x.id), CARD_IDS).map((run) =>
          run.grid ? (
            <div key={run.ids.join("-")} className="fin-grid" style={{ "--fin-cols": fl.opt("cols", 3) } as React.CSSProperties}>
              {run.ids.map((id) => (
                <Fragment key={id}>{renderSection(id)}</Fragment>
              ))}
            </div>
          ) : (
            <Fragment key={run.ids[0]}>{renderSection(run.ids[0])}</Fragment>
          ),
        )}

      {tab === "transaksi" && (
        <>
          <div className="toolbar">
            <label className="search search-sm">
              <Search size={14} />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari keterangan, pihak, bukti…" />
            </label>
            <select value={fType} onChange={(e) => setFType(e.target.value as TxType | "")} aria-label="Jenis">
              <option value="">Semua jenis</option>
              <option value="masuk">Pemasukan</option>
              <option value="keluar">Pengeluaran</option>
              <option value="transfer">Transfer</option>
            </select>
            {accounts.items.length > 0 && (
              <select value={fAccount} onChange={(e) => setFAccount(e.target.value)} aria-label="Akun">
                <option value="">Semua akun</option>
                {accounts.items
                  .filter((a) => scope.match(a.projectId))
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {ACCOUNT_EMOJI[a.type]} {a.name}
                    </option>
                  ))}
              </select>
            )}
            {fCat && (
              <button className="tk-chip fin-filter" onClick={() => setFCat("")} title="Hapus saring kategori">
                {fCat} ×
              </button>
            )}
            <span className="spacer" />
            <button
              className="btn btn-sm"
              disabled={!rows.length}
              onClick={async () => {
                const p = await saveTextFile("Simpan buku kas", `buku-kas-${all ? "semua" : ym}.csv`, toCsv(ledgerRows(rows, projName)), { name: "CSV", extensions: ["csv"] }, "text/csv");
                if (p) toast(`Buku kas disimpan: ${p}`);
              }}
            >
              <Download size={14} /> CSV
            </button>
          </div>
          <div className="ld-table-wrap">
            {rows.length === 0 ? (
              <div className="empty">
                <Wallet size={28} />
                <p className="empty-title">Belum ada transaksi {all ? "" : `di ${fMonth(ym)}`}</p>
                <p className="empty-text">Catat pemasukan dan pengeluaran, atau ketik di kolom catat cepat di atas. Saldo dihitung otomatis.</p>
              </div>
            ) : (
              <table className="ld-table">
                <thead>
                  <tr>
                    <th>Tanggal</th>
                    <th>Keterangan</th>
                    <th className="n">Masuk</th>
                    <th className="n">Keluar</th>
                    <th className="n">Saldo{fAccount ? ` ${accName(fAccount)?.name ?? ""}` : ""}</th>
                    <th aria-label="Aksi" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((e) => {
                    const a = accName(e.accountId);
                    const to = accName(e.toAccountId);
                    const isIn = e.type === "masuk" || (e.type === "transfer" && fAccount && e.toAccountId === fAccount);
                    const isOut = e.type === "keluar" || (e.type === "transfer" && fAccount && e.accountId === fAccount);
                    return (
                      <tr key={e.id} className={e.type === "transfer" ? "tf" : ""}>
                        <td className="ld-date">{fDay(e.date)}</td>
                        <td>
                          <div className="ld-desc">
                            <b>
                              {e.type === "transfer" ? (
                                <>
                                  <ArrowLeftRight size={12} /> {a?.name ?? "?"} → {to?.name ?? "?"}
                                </>
                              ) : (
                                e.party ?? e.description ?? e.category
                              )}
                              {e.recurringId && <Repeat size={11} className="fin-rec-ico" aria-label="Rutin" />}
                            </b>
                            <span className="muted small">{[e.type === "transfer" ? e.description : e.party || e.description ? e.category : null, e.type !== "transfer" && e.party ? e.description : null, e.type !== "transfer" && a ? `${ACCOUNT_EMOJI[a.type]} ${a.name}` : METHODS.find((m) => m.id === e.method)?.label, e.ref].filter(Boolean).join(" · ")}</span>
                            {!scope.current && e.projectId && <ProjectChip id={e.projectId} />}
                          </div>
                        </td>
                        <td className="n in">{isIn ? rupiah(e.amount) : e.type === "transfer" && !fAccount ? <span className="muted">{rupiah(e.amount)}</span> : ""}</td>
                        <td className="n out">{isOut ? rupiah(e.amount) : ""}</td>
                        <td className="n bal">{rupiah(e.balance)}</td>
                        <td className="ld-act">
                          <button className="icon-btn sm" onClick={() => setForm({ type: e.type, initial: e })} aria-label="Ubah">
                            <Pencil size={14} />
                          </button>
                          <button className="icon-btn sm" onClick={() => removeEntry(e)} aria-label="Hapus">
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {tab === "anggaran" && (
        <div className="fin-grid">
          <section className="fin-card span2">
            <header>
              <h2>Anggaran bulanan · {fMonth(ym)}</h2>
              <button className="btn btn-sm btn-primary" onClick={() => setBudForm({})}>
                <Plus size={14} /> Anggaran
              </button>
            </header>
            <BudgetList stats={bstat.filter((s) => s.budget.period === "bulanan")} onEdit={(b) => setBudForm({ initial: b })} detail projName={projName} empty="Belum ada anggaran bulanan." />
            {unbudgeted.length > 0 && (
              <div className="fin-suggest">
                <span className="muted small">Kategori tanpa anggaran bulan ini:</span>
                {unbudgeted
                  .slice(0, 6)
                  .map((c) => (
                    <button key={c.category} className="tk-chip" onClick={() => setBudForm({ category: c.category })}>
                      + {c.category} <small>{compactRp(c.total)}</small>
                    </button>
                  ))}
              </div>
            )}
          </section>
          <section className="fin-card">
            <header>
              <h2>Anggaran proyek (total)</h2>
            </header>
            <BudgetList stats={bstat.filter((s) => s.budget.period === "total")} onEdit={(b) => setBudForm({ initial: b })} detail projName={projName} empty="Tetapkan anggaran total untuk proyek (mis. riset, acara) agar realisasinya terpantau." />
          </section>
        </div>
      )}

      {tab === "berulang" && (
        <div className="fin-grid">
          <section className="fin-card span3">
            <header>
              <h2>Jatuh tempo & 14 hari ke depan</h2>
            </header>
            <DueList due={due} today={today} onPost={postDue} onSkip={skipDue} accName={(id) => accName(id)?.name} empty="Semua tagihan rutin sudah tercatat." />
          </section>
          <section className="fin-card span3">
            <header>
              <h2>Tagihan & pemasukan rutin</h2>
              <button className="btn btn-sm btn-primary" onClick={() => setRecForm({})}>
                <Plus size={14} /> Tambah
              </button>
            </header>
            {recs.length === 0 ? (
              <p className="muted small">Tambahkan listrik, kos, internet, langganan, cicilan, atau gaji. Ruangku mengingatkan saat jatuh tempo dan bisa mencatatnya otomatis.</p>
            ) : (
              <table className="ld-table fin-rec-table">
                <thead>
                  <tr>
                    <th>Nama</th>
                    <th>Jadwal</th>
                    <th>Akun</th>
                    <th className="n">Jumlah</th>
                    <th aria-label="Aksi" />
                  </tr>
                </thead>
                <tbody>
                  {recs.map((r) => {
                    const nd = nextDue(r, today);
                    return (
                      <tr key={r.id} className={r.active ? "" : "off"}>
                        <td>
                          <div className="ld-desc">
                            <b>
                              {r.title} {r.auto && <span className="fin-pill">otomatis</span>} {!r.active && <span className="fin-pill">nonaktif</span>}
                            </b>
                            <span className="muted small">{r.category}</span>
                            {!scope.current && r.projectId && <ProjectChip id={r.projectId} />}
                          </div>
                        </td>
                        <td className="small">
                          {RECUR_FREQ_LABEL[r.freq]}
                          <br />
                          <span className={nd && nd <= today ? "fin-late" : "muted"}>{nd ? `${nd <= today ? "Jatuh tempo" : "Berikutnya"} ${fDayLong(nd)}` : "Selesai"}</span>
                        </td>
                        <td className="small">{accName(r.accountId)?.name ?? <span className="muted">—</span>}</td>
                        <td className={`n ${r.type === "masuk" ? "in" : "out"}`}>
                          {r.type === "masuk" ? "+" : "−"}
                          {rupiah(r.amount)}
                        </td>
                        <td className="ld-act wide">
                          {nd && nd <= dateKey(addDays(parseDateKey(today), 3)) && (
                            <button className="btn btn-sm" onClick={() => postDue(r, nd)}>
                              Catat
                            </button>
                          )}
                          <button className="icon-btn sm" onClick={() => setRecForm({ initial: r })} aria-label="Ubah">
                            <Pencil size={14} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </section>
        </div>
      )}

      {tab === "akun" && (
        <>
          <section className="ld-tiles">
            <div className="ld-tile main">
              <span>
                <PiggyBank size={14} /> Kekayaan bersih
              </span>
              <b>{rupiah(liveAccs.reduce((s, a) => s + (balances.get(a.id) ?? 0), 0))}</b>
              <small>{liveAccs.length} akun aktif</small>
            </div>
            <div className="ld-tile in">
              <span>Aset (saldo positif)</span>
              <b>{rupiah(liveAccs.reduce((s, a) => s + Math.max(0, balances.get(a.id) ?? 0), 0))}</b>
              <small>tunai, bank, e-wallet, investasi</small>
            </div>
            <div className="ld-tile out">
              <span>Utang (saldo negatif)</span>
              <b>{rupiah(-liveAccs.reduce((s, a) => s + Math.min(0, balances.get(a.id) ?? 0), 0))}</b>
              <small>mis. tagihan kartu kredit</small>
            </div>
            <div className="ld-tile">
              <span>Belum berakun</span>
              <b>{entries.filter((e) => e.type !== "transfer" && !e.accountId).length}</b>
              <small>transaksi tanpa akun</small>
            </div>
          </section>
          <div className="fin-acc-grid">
            {accs.map((a) => {
              const b = balances.get(a.id) ?? 0;
              const n = ledger.items.filter((e) => e.accountId === a.id || e.toAccountId === a.id).length;
              return (
                <article key={a.id} className={`fin-acc-card ${a.archived ? "off" : ""}`}>
                  <header>
                    <span className={`fin-acc-ico cc-${a.color ?? "abu"}`}>{ACCOUNT_EMOJI[a.type]}</span>
                    <div>
                      <b>{a.name}</b>
                      <small className="muted">
                        {ACCOUNT_TYPE_LABEL[a.type]}
                        {a.archived ? " · diarsipkan" : ""}
                      </small>
                    </div>
                    <button className="icon-btn sm" onClick={() => setAccForm({ initial: a })} aria-label={`Ubah ${a.name}`}>
                      <Pencil size={14} />
                    </button>
                  </header>
                  <b className={`fin-acc-bal ${b < 0 ? "neg" : ""}`}>{rupiah(b)}</b>
                  <div className="fin-acc-foot">
                    {a.projectId ? <ProjectChip id={a.projectId} /> : <span className="muted small">Pribadi</span>}
                    <button
                      className="btn btn-sm btn-ghost"
                      onClick={() => {
                        setFAccount(a.id);
                        setTab("transaksi");
                        setAll(true);
                      }}
                    >
                      {n} transaksi
                    </button>
                  </div>
                </article>
              );
            })}
            <button className="fin-acc-card add" onClick={() => setAccForm({})}>
              <Plus size={18} /> Akun / dompet baru
            </button>
          </div>
        </>
      )}

      {tab === "donatur" && (
        <div className="ld-body">
          <section className="fin-card">
            <header>
              <h2>Donatur {all ? "(semua periode)" : fMonth(ym)}</h2>
              <button className="btn btn-sm" onClick={() => setReport(true)} disabled={!allDonors.length}>
                <FileText size={14} /> Laporan donatur
              </button>
            </header>
            {donors.length === 0 ? (
              <p className="muted small">Belum ada dana titipan (infaq, sedekah, zakat, wakaf, donasi) dengan nama donatur. Isi kolom "Dari" saat mencatatnya agar rekap dan laporan donatur tersedia.</p>
            ) : (
              <table className="ld-table">
                <thead>
                  <tr>
                    <th>Donatur</th>
                    <th className="n">Transaksi</th>
                    <th>Terakhir</th>
                    <th className="n">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {donors.map((d) => (
                    <tr key={d.party}>
                      <td>
                        <b>{d.party}</b>
                      </td>
                      <td className="n">{d.count}×</td>
                      <td className="small">{fDay(d.last)}</td>
                      <td className="n in">{rupiah(d.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
          <aside className="ld-side">
            <h2>Penyaluran {all ? "" : fMonth(ym)}</h2>
            <ol className="ld-donors">
              {byParty(
                titipan.filter((e) => e.date >= range.from && e.date <= range.to),
                "keluar",
              )
                .slice(0, 10)
                .map((d) => (
                  <li key={d.party}>
                    <span className="ld-dname">{d.party}</span>
                    <span className="muted small">{d.count}×</span>
                    <b>{rupiah(d.total)}</b>
                  </li>
                ))}
            </ol>
          </aside>
        </div>
      )}

      {form && (
        <EntryForm
          type0={form.type}
          initial={form.initial}
          parties={parties}
          accounts={allLiveAccs}
          categories={userCats}
          projects={scope.allProjects}
          defaultProject={scope.defaultProjectId}
          defaultAccount={defaultAccount}
          onClose={() => setForm(null)}
          onSave={(e) => saveEntry(form.initial ? { ...strip(form.initial), ...e } : e, form.initial?.id)}
        />
      )}
      {accForm && (
        <AccountForm
          initial={accForm.initial}
          projects={scope.allProjects}
          defaultProject={scope.defaultProjectId}
          onClose={() => setAccForm(null)}
          onSave={(a) => accounts.save(a, accForm.initial?.id ?? newId()).then(() => toast(`Akun ${a.name} disimpan`))}
          onDelete={
            accForm.initial
              ? () => {
                  const a = accForm.initial!;
                  const used = ledger.items.some((e) => e.accountId === a.id || e.toAccountId === a.id);
                  setAccForm(null);
                  setDel({
                    title: `Hapus akun ${a.name}?`,
                    text: used ? "Akun ini dipakai transaksi. Transaksinya tetap ada tetapi menjadi tanpa akun. Pertimbangkan mengarsipkan saja." : "Akun akan dihapus.",
                    run: () => accounts.remove(a.id),
                  });
                }
              : undefined
          }
        />
      )}
      {budForm && (
        <BudgetForm
          initial={budForm.initial ?? (budForm.category ? ({ id: "", updatedAt: 0, category: budForm.category, amount: 0, period: "bulanan", projectId: scope.defaultProjectId } as Item<Budget>) : undefined)}
          projects={scope.allProjects}
          defaultProject={scope.defaultProjectId}
          categories={userCats}
          onClose={() => setBudForm(null)}
          onSave={(b) => budgets.save(b, budForm.initial?.id ?? newId())}
          onDelete={budForm.initial ? () => (budgets.remove(budForm.initial!.id), setBudForm(null)) : undefined}
        />
      )}
      {recForm && (
        <RecurringForm
          initial={recForm.initial}
          projects={scope.allProjects}
          accounts={allLiveAccs}
          defaultProject={scope.defaultProjectId}
          defaultAccount={defaultAccount}
          categories={userCats}
          onClose={() => setRecForm(null)}
          onSave={(r) => recurring.save(r, recForm.initial?.id ?? newId()).then(() => toast(`${r.title} disimpan`))}
          onDelete={
            recForm.initial
              ? () => {
                  const r = recForm.initial!;
                  setRecForm(null);
                  setDel({ title: `Hapus ${r.title}?`, text: "Jadwal rutin dihapus. Transaksi yang sudah dicatat tetap ada.", run: () => recurring.remove(r.id) });
                }
              : undefined
          }
        />
      )}
      {report && <ReportModal entries={titipan} donors={allDonors} org0={org || scope.current?.name || "Penitipan Infaq"} onClose={() => setReport(false)} />}
      {del && <Confirm title={del.title} text={del.text} confirmLabel="Hapus" onConfirm={del.run} onClose={() => setDel(null)} />}
    </div>
  );
}

function BudgetList({ stats, onEdit, empty, detail, projName }: { stats: ReturnType<typeof budgetStatus>; onEdit: (b: Item<Budget>) => void; empty: string; detail?: boolean; projName?: (id?: string) => string }) {
  if (!stats.length) return <p className="muted small">{empty}</p>;
  return (
    <ul className="fin-budgets">
      {stats.map((s) => {
        const left = s.budget.amount - s.spent;
        return (
          <li key={s.budget.id}>
            <button onClick={() => onEdit(s.budget)}>
              <span className="fin-b-top">
                <b>{s.budget.category === "*" ? "Semua pengeluaran" : s.budget.category}</b>
                {detail && s.budget.projectId && <small className="muted">{projName?.(s.budget.projectId)}</small>}
                <span className={`fin-b-state ${s.state}`}>
                  {s.state === "lewat" ? <AlertTriangle size={12} /> : s.state === "waspada" ? <AlertTriangle size={12} /> : <CheckCircle2 size={12} />}
                  {s.state === "lewat" ? `Lewat ${compactRp(-left)}` : s.state === "waspada" ? `Sisa ${compactRp(left)}` : `Sisa ${compactRp(left)}`}
                </span>
              </span>
              <Progress value={Math.min(1, s.ratio)} tone={s.state === "lewat" ? "tertinggal" : s.state === "waspada" ? "waspada" : "aman"} />
              <small className="muted">
                {rupiah(s.spent)} dari {rupiah(s.budget.amount)} · {Math.round(s.ratio * 100)}%
              </small>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function DueList({ due, today, onPost, onSkip, accName, empty }: { due: { rec: Item<Recurring>; date: string }[]; today: string; onPost: (r: Item<Recurring>, d: string) => void; onSkip: (r: Item<Recurring>, d: string) => void; accName: (id?: string) => string | undefined; empty: string }) {
  if (!due.length) return <p className="muted small">{empty}</p>;
  return (
    <ul className="fin-due">
      {due.map(({ rec, date }) => {
        const d = daysBetween(today, date);
        return (
          <li key={`${rec.id}-${date}`} className={d < 0 ? "late" : d === 0 ? "today" : ""}>
            <span className="fin-due-date">
              <b>{fDay(date)}</b>
              <small>{d < 0 ? `telat ${-d} hr` : d === 0 ? "hari ini" : `${d} hr lagi`}</small>
            </span>
            <span className="fin-due-main">
              <b>{rec.title}</b>
              <small className="muted">{[rec.category, accName(rec.accountId)].filter(Boolean).join(" · ")}</small>
            </span>
            <b className={`fin-due-amt ${rec.type === "masuk" ? "in" : "out"}`}>
              {rec.type === "masuk" ? "+" : "−"}
              {compactRp(rec.amount)}
            </b>
            <span className="fin-due-act">
              <button className="btn btn-sm" onClick={() => onPost(rec, date)} title={`Catat ${rupiah(rec.amount)} pada ${fDay(date)}`}>
                {rec.type === "masuk" ? "Terima" : "Bayar"}
              </button>
              <button className="icon-btn sm" onClick={() => onSkip(rec, date)} aria-label="Lewati" title="Lewati kali ini">
                <SkipForward size={14} />
              </button>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

