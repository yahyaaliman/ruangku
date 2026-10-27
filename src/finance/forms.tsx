// Formulir keuangan: transaksi (masuk/keluar/transfer), akun, anggaran, transaksi berulang.
import { useState } from "react";
import { Modal, Field } from "../components/ui";
import type { BlockColor, Item } from "../lib/types";
import type { Project } from "../lib/tasks";
import { CATEGORIES, CATEGORY_GROUPS, METHODS, rupiah, type Flow, type LedgerEntry, type Method, type TxType } from "../lib/ledger";
import { ACCOUNT_EMOJI, ACCOUNT_TYPE_LABEL, RECUR_FREQ_LABEL, type Account, type AccountType, type Budget, type RecurFreq, type Recurring } from "../lib/finance";
import { parseField } from "../lib/customFields";
import { dateKey } from "../lib/date";
import { ProjectSelect } from "../projects/ProjectSwitcher";

type Projects = Item<Project>[];
const money = (s: string) => parseField({ id: "x", name: "x", type: "rupiah" }, s) as number | undefined;
const COLORS: BlockColor[] = ["nila", "laut", "daun", "kunyit", "kopi", "bata", "jambu", "ungu", "abu"];

export function CategoryInput({ type, value, onChange, id, extra }: { type: Flow; value: string; onChange: (v: string) => void; id: string; extra?: string[] }) {
  return (
    <>
      <input list={id} value={value} onChange={(e) => onChange(e.target.value)} />
      <datalist id={id}>
        {[...CATEGORY_GROUPS[type].flatMap((g) => g.items), ...(extra ?? [])].filter((c, i, a) => a.indexOf(c) === i).map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
    </>
  );
}

export function AccountSelect({ value, onChange, accounts, label = "Tanpa akun", allowEmpty = true }: { value?: string; onChange: (v: string | undefined) => void; accounts: Item<Account>[]; label?: string; allowEmpty?: boolean }) {
  return (
    <select value={value ?? ""} onChange={(e) => onChange(e.target.value || undefined)}>
      {allowEmpty && <option value="">{label}</option>}
      {accounts
        .filter((a) => !a.archived || a.id === value)
        .map((a) => (
          <option key={a.id} value={a.id}>
            {ACCOUNT_EMOJI[a.type]} {a.name}
          </option>
        ))}
    </select>
  );
}

export function EntryForm({
  initial,
  type0,
  parties,
  accounts,
  categories,
  onSave,
  onClose,
  defaultProject,
  defaultAccount,
  projects,
}: {
  initial?: Item<LedgerEntry>;
  type0: TxType;
  parties: string[];
  accounts: Item<Account>[];
  categories: string[];
  onSave: (e: LedgerEntry) => void;
  onClose: () => void;
  defaultProject?: string;
  defaultAccount?: string;
  projects: Projects;
}) {
  const [type, setType] = useState<TxType>(initial?.type ?? type0);
  const flow: Flow = type === "masuk" ? "masuk" : "keluar";
  const [date, setDate] = useState(initial?.date ?? dateKey());
  const [amount, setAmount] = useState(initial ? String(initial.amount) : "");
  const [category, setCategory] = useState(initial?.category ?? (type0 === "transfer" ? "Transfer" : CATEGORIES[type0 === "masuk" ? "masuk" : "keluar"][0]));
  const [party, setParty] = useState(initial?.party ?? "");
  const [method, setMethod] = useState<Method>(initial?.method ?? "transfer");
  const [ref, setRef] = useState(initial?.ref ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [projectId, setProjectId] = useState<string | undefined>(initial?.projectId ?? defaultProject);
  const [accountId, setAccountId] = useState<string | undefined>(initial?.accountId ?? defaultAccount);
  const [toAccountId, setToAccountId] = useState<string | undefined>(initial?.toAccountId);
  const value = money(amount);
  const ok = !!value && value > 0 && !!date && (type === "transfer" ? !!accountId && !!toAccountId && accountId !== toAccountId : !!category.trim());
  const title = initial ? "Ubah transaksi" : type === "masuk" ? "Catat pemasukan" : type === "keluar" ? "Catat pengeluaran" : "Transfer antarakun";
  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Batal
          </button>
          <button
            className="btn btn-primary"
            disabled={!ok}
            onClick={() => {
              onSave({
                type,
                date,
                amount: value!,
                category: type === "transfer" ? "Transfer" : category.trim(),
                party: type === "transfer" ? undefined : party.trim() || undefined,
                method,
                ref: ref.trim() || undefined,
                description: description.trim() || undefined,
                projectId,
                accountId,
                toAccountId: type === "transfer" ? toAccountId : undefined,
                recurringId: initial?.recurringId,
              });
              onClose();
            }}
          >
            Simpan
          </button>
        </>
      }
    >
      <div className="form">
        <div className="seg seg-full" role="tablist">
          {(["masuk", "keluar", ...(accounts.length >= 2 ? ["transfer"] : [])] as TxType[]).map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={type === t}
              className={type === t ? "active" : ""}
              onClick={() => {
                setType(t);
                if (t !== "transfer" && !CATEGORIES[t].includes(category)) setCategory(CATEGORIES[t][0]);
              }}
            >
              {t === "masuk" ? "Pemasukan" : t === "keluar" ? "Pengeluaran" : "Transfer"}
            </button>
          ))}
        </div>
        <div className="form-row">
          <Field label="Tanggal">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Jumlah" hint={value ? rupiah(value) : "Boleh ditulis 1,5 jt atau 250rb"}>
            <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="Rp" autoFocus />
          </Field>
        </div>
        {type === "transfer" ? (
          <div className="form-row">
            <Field label="Dari akun">
              <AccountSelect value={accountId} onChange={setAccountId} accounts={accounts} label="Pilih akun" />
            </Field>
            <Field label="Ke akun">
              <AccountSelect value={toAccountId} onChange={setToAccountId} accounts={accounts.filter((a) => a.id !== accountId)} label="Pilih akun" />
            </Field>
          </div>
        ) : (
          <>
            <div className="form-row">
              <Field label="Kategori">
                <CategoryInput id="fin-cats" type={flow} value={category} onChange={setCategory} extra={categories} />
              </Field>
              <Field label={type === "masuk" ? "Dari (donatur/klien)" : "Kepada (penerima/toko)"}>
                <input list="fin-parties" value={party} onChange={(e) => setParty(e.target.value)} placeholder="Opsional" />
                <datalist id="fin-parties">
                  {parties.map((p) => (
                    <option key={p} value={p} />
                  ))}
                </datalist>
              </Field>
            </div>
            <div className="form-row">
              <Field label={type === "masuk" ? "Masuk ke akun" : "Dibayar dari akun"}>
                <AccountSelect value={accountId} onChange={setAccountId} accounts={accounts} />
              </Field>
              <Field label="Metode">
                <select value={method} onChange={(e) => setMethod(e.target.value as Method)}>
                  {METHODS.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          </>
        )}
        <div className="form-row">
          <Field label="Keterangan">
            <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Opsional" />
          </Field>
          <Field label="No. bukti / referensi">
            <input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="Opsional" />
          </Field>
        </div>
        <Field label="Proyek" hint="Kosongkan untuk keuangan pribadi.">
          <ProjectSelect value={projectId} onChange={setProjectId} projects={projects} emptyLabel="Pribadi (tanpa proyek)" />
        </Field>
      </div>
    </Modal>
  );
}

export function AccountForm({ initial, projects, defaultProject, onSave, onDelete, onClose }: { initial?: Item<Account>; projects: Projects; defaultProject?: string; onSave: (a: Account) => void; onDelete?: () => void; onClose: () => void }) {
  const [a, setA] = useState<Account>(() => (initial ? { ...initial } : { name: "", type: "bank", opening: 0, openingDate: dateKey(), projectId: defaultProject, color: "nila" }));
  const [opening, setOpening] = useState(initial ? String(initial.opening) : "");
  const up = (p: Partial<Account>) => setA((x) => ({ ...x, ...p }));
  const ok = !!a.name.trim();
  return (
    <Modal
      title={initial ? "Ubah akun" : "Akun / dompet baru"}
      onClose={onClose}
      footer={
        <>
          {onDelete && (
            <button className="btn btn-ghost text-danger" onClick={onDelete} style={{ marginRight: "auto" }}>
              Hapus akun
            </button>
          )}
          <button className="btn" onClick={onClose}>
            Batal
          </button>
          <button
            className="btn btn-primary"
            disabled={!ok}
            onClick={() => {
              const { id: _i, updatedAt: _u, ...rest } = a as Item<Account>;
              void _i;
              void _u;
              onSave({ ...rest, name: a.name.trim(), opening: money(opening) ?? 0 });
              onClose();
            }}
          >
            Simpan
          </button>
        </>
      }
    >
      <div className="form">
        <div className="form-row">
          <Field label="Nama akun">
            <input value={a.name} onChange={(e) => up({ name: e.target.value })} placeholder="Mis. BCA, GoPay, Dompet" autoFocus />
          </Field>
          <Field label="Jenis">
            <select value={a.type} onChange={(e) => up({ type: e.target.value as AccountType })}>
              {(Object.keys(ACCOUNT_TYPE_LABEL) as AccountType[]).map((t) => (
                <option key={t} value={t}>
                  {ACCOUNT_EMOJI[t]} {ACCOUNT_TYPE_LABEL[t]}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="form-row">
          <Field label="Saldo awal" hint={a.type === "kartu" ? "Isi negatif bila ada tagihan berjalan, mis. -1,2jt" : money(opening) ? rupiah(money(opening)!) : "Saldo saat mulai mencatat"}>
            <input value={opening} onChange={(e) => setOpening(e.target.value)} inputMode="decimal" placeholder="Rp 0" />
          </Field>
          <Field label="Per tanggal">
            <input type="date" value={a.openingDate ?? ""} onChange={(e) => up({ openingDate: e.target.value || undefined })} />
          </Field>
        </div>
        <Field label="Milik proyek" hint="Kosongkan untuk akun pribadi. Akun proyek ikut tersinkron ke tim.">
          <ProjectSelect value={a.projectId} onChange={(v) => up({ projectId: v })} projects={projects} emptyLabel="Pribadi" />
        </Field>
        <Field label="Warna">
          <div className="fin-colors">
            {COLORS.map((c) => (
              <button key={c} type="button" className={`crs-color cc-${c} ${a.color === c ? "on" : ""}`} onClick={() => up({ color: c })} aria-label={c} />
            ))}
          </div>
        </Field>
        {initial && (
          <label className="check-row">
            <input type="checkbox" checked={!!a.archived} onChange={(e) => up({ archived: e.target.checked })} /> Arsipkan (sembunyikan dari pilihan; riwayat tetap ada)
          </label>
        )}
      </div>
    </Modal>
  );
}

export function BudgetForm({ initial, projects, defaultProject, categories, onSave, onDelete, onClose }: { initial?: Item<Budget>; projects: Projects; defaultProject?: string; categories: string[]; onSave: (b: Budget) => void; onDelete?: () => void; onClose: () => void }) {
  const [category, setCategory] = useState(initial?.category ?? "*");
  const [amount, setAmount] = useState(initial ? String(initial.amount) : "");
  const [period, setPeriod] = useState<Budget["period"]>(initial?.period ?? "bulanan");
  const [projectId, setProjectId] = useState<string | undefined>(initial?.projectId ?? defaultProject);
  const value = money(amount);
  return (
    <Modal
      title={initial ? "Ubah anggaran" : "Anggaran baru"}
      onClose={onClose}
      footer={
        <>
          {onDelete && (
            <button className="btn btn-ghost text-danger" onClick={onDelete} style={{ marginRight: "auto" }}>
              Hapus
            </button>
          )}
          <button className="btn" onClick={onClose}>
            Batal
          </button>
          <button
            className="btn btn-primary"
            disabled={!value || !category.trim()}
            onClick={() => {
              onSave({ category: category.trim() || "*", amount: value!, period, projectId });
              onClose();
            }}
          >
            Simpan
          </button>
        </>
      }
    >
      <div className="form">
        <Field label="Kategori pengeluaran">
          <select value={categories.includes(category) || category === "*" ? category : "__"} onChange={(e) => setCategory(e.target.value === "__" ? "" : e.target.value)}>
            <option value="*">Semua pengeluaran</option>
            {CATEGORY_GROUPS.keluar.map((g) => (
              <optgroup key={g.group} label={g.group}>
                {g.items.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </optgroup>
            ))}
            {categories.filter((c) => !CATEGORIES.keluar.includes(c)).length > 0 && (
              <optgroup label="Kategori Anda">
                {categories
                  .filter((c) => !CATEGORIES.keluar.includes(c))
                  .map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
              </optgroup>
            )}
          </select>
        </Field>
        <div className="form-row">
          <Field label="Batas" hint={value ? rupiah(value) : "Mis. 2jt"}>
            <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="Rp" autoFocus />
          </Field>
          <Field label="Periode">
            <select value={period} onChange={(e) => setPeriod(e.target.value as Budget["period"])}>
              <option value="bulanan">Setiap bulan</option>
              <option value="total">Total (seluruh proyek)</option>
            </select>
          </Field>
        </div>
        <Field label="Berlaku untuk" hint="Anggaran proyek menghitung pengeluaran proyek itu (termasuk subproyek); kosong = pribadi.">
          <ProjectSelect value={projectId} onChange={setProjectId} projects={projects} emptyLabel="Pribadi (tanpa proyek)" />
        </Field>
      </div>
    </Modal>
  );
}

export function RecurringForm({ initial, projects, accounts, defaultProject, defaultAccount, categories, onSave, onDelete, onClose }: { initial?: Item<Recurring>; projects: Projects; accounts: Item<Account>[]; defaultProject?: string; defaultAccount?: string; categories: string[]; onSave: (r: Recurring) => void; onDelete?: () => void; onClose: () => void }) {
  const [r, setR] = useState<Recurring>(() => (initial ? { ...initial } : { title: "", type: "keluar", amount: 0, category: "Tagihan & utilitas", freq: "bulanan", start: dateKey(), active: true, projectId: defaultProject, accountId: defaultAccount, method: "transfer" }));
  const [amount, setAmount] = useState(initial ? String(initial.amount) : "");
  const up = (p: Partial<Recurring>) => setR((x) => ({ ...x, ...p }));
  const value = money(amount);
  const ok = !!r.title.trim() && !!value && !!r.start;
  return (
    <Modal
      title={initial ? "Ubah transaksi berulang" : "Tagihan / pemasukan rutin"}
      onClose={onClose}
      footer={
        <>
          {onDelete && (
            <button className="btn btn-ghost text-danger" onClick={onDelete} style={{ marginRight: "auto" }}>
              Hapus
            </button>
          )}
          <button className="btn" onClick={onClose}>
            Batal
          </button>
          <button
            className="btn btn-primary"
            disabled={!ok}
            onClick={() => {
              const { id: _i, updatedAt: _u, ...rest } = r as Item<Recurring>;
              void _i;
              void _u;
              onSave({ ...rest, title: r.title.trim(), amount: value! });
              onClose();
            }}
          >
            Simpan
          </button>
        </>
      }
    >
      <div className="form">
        <div className="seg seg-full" role="tablist">
          {(["keluar", "masuk"] as Flow[]).map((t) => (
            <button key={t} role="tab" aria-selected={r.type === t} className={r.type === t ? "active" : ""} onClick={() => up({ type: t, category: t === "masuk" ? "Gaji" : "Tagihan & utilitas" })}>
              {t === "keluar" ? "Tagihan / pengeluaran" : "Pemasukan rutin"}
            </button>
          ))}
        </div>
        <div className="form-row">
          <Field label="Nama">
            <input value={r.title} onChange={(e) => up({ title: e.target.value })} placeholder={r.type === "keluar" ? "Mis. Listrik PLN, Kos, Spotify" : "Mis. Gaji, Honor asisten"} autoFocus />
          </Field>
          <Field label="Jumlah" hint={value ? rupiah(value) : "Perkiraan bila berubah-ubah"}>
            <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="Rp" />
          </Field>
        </div>
        <div className="form-row">
          <Field label="Kategori">
            <CategoryInput id="rec-cats" type={r.type} value={r.category} onChange={(v) => up({ category: v })} extra={categories} />
          </Field>
          <Field label={r.type === "masuk" ? "Masuk ke akun" : "Dibayar dari akun"}>
            <AccountSelect value={r.accountId} onChange={(v) => up({ accountId: v })} accounts={accounts} />
          </Field>
        </div>
        <div className="form-row">
          <Field label="Pengulangan">
            <select value={r.freq} onChange={(e) => up({ freq: e.target.value as RecurFreq })}>
              {(Object.keys(RECUR_FREQ_LABEL) as RecurFreq[]).map((f) => (
                <option key={f} value={f}>
                  {RECUR_FREQ_LABEL[f]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Jatuh tempo pertama">
            <input type="date" value={r.start} onChange={(e) => up({ start: e.target.value })} />
          </Field>
          <Field label="Sampai (opsional)">
            <input type="date" value={r.end ?? ""} onChange={(e) => up({ end: e.target.value || undefined })} />
          </Field>
        </div>
        <Field label="Proyek">
          <ProjectSelect value={r.projectId} onChange={(v) => up({ projectId: v })} projects={projects} emptyLabel="Pribadi (tanpa proyek)" />
        </Field>
        <label className="check-row">
          <input type="checkbox" checked={!!r.auto} onChange={(e) => up({ auto: e.target.checked })} /> Catat otomatis saat jatuh tempo (cocok untuk debit otomatis & langganan)
        </label>
        <label className="check-row">
          <input type="checkbox" checked={r.active} onChange={(e) => up({ active: e.target.checked })} /> Aktif
        </label>
      </div>
    </Modal>
  );
}
