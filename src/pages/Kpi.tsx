import { useEffect, useMemo, useState } from "react";
import { BarChart3, ChevronLeft, ChevronRight, Flame, Pencil, Plus, Trash2 } from "lucide-react";
import type { Item, Kpi as KpiT, KpiDirection, KpiEntry, Objective } from "../lib/types";
import { strip, useRecords } from "../lib/useRecords";
import { addDays, dateKey, dayLong, dayShort, parseDateKey } from "../lib/date";
import { average, entriesByDate, formatNumber, hitRate, kpiAchievement, kpiMet, series, streak } from "../lib/metrics";
import { Confirm, Empty, Field, Modal, Sparkline } from "../components/ui";
import { useScope } from "../lib/scope";
import { ProjectChip, ProjectSelect } from "../projects/ProjectSwitcher";
import { NO_SECTIONS, usePageLayout } from "../lib/pageLayout";
import { LayoutCheck, LayoutMenu, LayoutSeg } from "../components/LayoutMenu";

export const entryId = (kpiId: string, date: string) => `${kpiId}:${date}`;

function KpiForm({ initial, objectives, onSave, onClose }: { initial?: Item<KpiT>; objectives: Item<Objective>[]; onSave: (k: KpiT) => void; onClose: () => void }) {
  const [name, setName] = useState(initial?.name ?? "");
  const [unit, setUnit] = useState(initial?.unit ?? "");
  const [target, setTarget] = useState(String(initial?.target ?? ""));
  const [direction, setDirection] = useState<KpiDirection>(initial?.direction ?? "naik");
  const [objectiveId, setObjectiveId] = useState(initial?.objectiveId ?? "");
  const scope = useScope();
  const [projectId, setProjectId] = useState<string | undefined>(initial ? initial.projectId : scope.defaultProjectId);
  const t = Number(target.replace(",", "."));
  const valid = name.trim() && target !== "" && !Number.isNaN(t);
  const submit = () => {
    if (!valid) return;
    onSave({ ...(initial ? strip(initial) : {}), name: name.trim(), unit: unit.trim(), target: t, direction, objectiveId: objectiveId || undefined, projectId });
    onClose();
  };
  return (
    <Modal
      title={initial ? "Ubah KPI" : "KPI baru"}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>Batal</button>
          <button className="btn btn-primary" disabled={!valid} onClick={submit}>Simpan KPI</button>
        </>
      }
    >
      <form className="form" onSubmit={(e) => (e.preventDefault(), submit())}>
        <Field label="Nama KPI" hint="Sesuatu yang Anda ukur setiap hari. Contoh: Panggilan ke klien">
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <div className="form-row">
          <Field label="Target harian"><input inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} /></Field>
          <Field label="Satuan"><input value={unit} placeholder="tiket, jam, Rp" onChange={(e) => setUnit(e.target.value)} /></Field>
        </div>
        <Field label="Dianggap tercapai jika">
          <div className="seg seg-full">
            <button type="button" className={direction === "naik" ? "active" : ""} onClick={() => setDirection("naik")}>Nilai ≥ target</button>
            <button type="button" className={direction === "turun" ? "active" : ""} onClick={() => setDirection("turun")}>Nilai ≤ target</button>
          </div>
        </Field>
        <Field label="Proyek">
          <ProjectSelect value={projectId} onChange={setProjectId} projects={scope.allProjects} emptyLabel="Pribadi / lintas proyek" />
        </Field>
        {objectives.length > 0 && (
          <Field label="Mendukung objective" hint="Opsional">
            <select value={objectiveId} onChange={(e) => setObjectiveId(e.target.value)}>
              <option value="">Tidak terhubung</option>
              {objectives.map((o) => <option key={o.id} value={o.id}>{o.title}</option>)}
            </select>
          </Field>
        )}
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

function ValueInput({ kpi, value, onCommit }: { kpi: Item<KpiT>; value: number | undefined; onCommit: (v: number | null) => void }) {
  const [text, setText] = useState(value === undefined ? "" : String(value));
  useEffect(() => setText(value === undefined ? "" : String(value)), [value]);
  const commit = () => {
    const t = text.trim().replace(",", ".");
    if (t === "") return value !== undefined && onCommit(null);
    const n = Number(t);
    if (!Number.isNaN(n) && n !== value) onCommit(n);
    else if (Number.isNaN(n)) setText(value === undefined ? "" : String(value));
  };
  return (
    <input
      className={`kpi-input ${value !== undefined ? (kpiMet(kpi, value) ? "met" : "miss") : ""}`}
      inputMode="decimal"
      placeholder="Isi"
      aria-label={`Nilai ${kpi.name}`}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") setText(value === undefined ? "" : String(value));
      }}
    />
  );
}

function HistoryModal({ kpi, map, onClose }: { kpi: Item<KpiT>; map: Map<string, number>; onClose: () => void }) {
  const s = series(map, 30);
  const max = Math.max(kpi.target, ...s.map((x) => x.value ?? 0)) || 1;
  return (
    <Modal title={`Riwayat ${kpi.name}`} onClose={onClose} wide>
      <div className="bars" role="img" aria-label="Grafik 30 hari">
        <div className="bars-target" style={{ bottom: `${(kpi.target / max) * 100}%` }}>
          <span>Target {formatNumber(kpi.target)}</span>
        </div>
        {s.map((x) => (
          <div key={x.date} className="bar-col" title={`${dayShort(parseDateKey(x.date).getTime())}: ${x.value === null ? "kosong" : formatNumber(x.value)}`}>
            <div className={`bar ${x.value === null ? "bar-empty" : kpiMet(kpi, x.value) ? "bar-met" : "bar-miss"}`} style={{ height: `${x.value === null ? 2 : Math.max(2, (x.value / max) * 100)}%` }} />
          </div>
        ))}
      </div>
      <div className="bars-axis">
        <span>{dayShort(parseDateKey(s[0].date).getTime())}</span>
        <span>Hari ini</span>
      </div>
      <dl className="stats">
        <div><dt>Rata-rata 30 hari</dt><dd>{average(s.map((x) => x.value)) === null ? "–" : formatNumber(average(s.map((x) => x.value))!)} {kpi.unit}</dd></div>
        <div><dt>Hari tercapai</dt><dd>{s.filter((x) => x.value !== null && kpiMet(kpi, x.value)).length} dari {s.filter((x) => x.value !== null).length}</dd></div>
        <div><dt>Streak saat ini</dt><dd>{streak(kpi, map)} hari</dd></div>
      </dl>
    </Modal>
  );
}

export default function Kpi() {
  const kpis = useRecords<KpiT>("kpi");
  const entries = useRecords<KpiEntry>("kpientry");
  const objectives = useRecords<Objective>("objective");
  const [date, setDate] = useState(dateKey());
  const [edit, setEdit] = useState<Item<KpiT> | "new" | null>(null);
  const [history, setHistory] = useState<Item<KpiT> | null>(null);
  const [del, setDel] = useState<Item<KpiT> | null>(null);

  const scope = useScope();
  const list = useMemo(() => kpis.items.filter((k) => !k.archived && scope.match(k.projectId)).sort((a, b) => (a.order ?? 99) - (b.order ?? 99) || a.name.localeCompare(b.name)), [kpis.items, scope]);
  const maps = useMemo(() => new Map(list.map((k) => [k.id, entriesByDate(entries.items, k.id)])), [list, entries.items]);

  const isToday = date === dateKey();
  const filled = list.filter((k) => maps.get(k.id)!.has(date));
  const met = filled.filter((k) => kpiMet(k, maps.get(k.id)!.get(date)!));

  const commit = (k: Item<KpiT>, v: number | null) => {
    const id = entryId(k.id, date);
    if (v === null) entries.remove(id);
    else entries.save({ kpiId: k.id, date, value: v }, id);
  };

  const removeKpi = async (k: Item<KpiT>) => {
    await Promise.all(entries.items.filter((e) => e.kpiId === k.id).map((e) => entries.remove(e.id)));
    await kpis.remove(k.id);
  };

  const kl = usePageLayout("kpi", NO_SECTIONS);
  const colTarget = kl.opt("target", true);
  const colTrend = kl.opt("trend", true);
  const colRate = kl.opt("rate", true);
  const trendDays = kl.opt<number>("trendDays", 14);
  // Kolom bawaan diatur CSS; bila ada kolom yang disembunyikan, susun ulang lajurnya di sini.
  const rowStyle =
    colTarget && colTrend && colRate
      ? undefined
      : { gridTemplateColumns: ["minmax(180px, 1.4fr)", colTarget && "110px", "150px", colTrend && "170px", colRate && "110px", "100px"].filter(Boolean).join(" ") };

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>KPI harian{scope.current ? <span className="page-scope"> · {scope.current.name}</span> : null}</h1>
          <p className="page-sub">Isi angka setiap hari. Tekan Enter atau pindah kolom untuk menyimpan.</p>
        </div>
        <div className="btn-row">
          <LayoutMenu layout={kl} title="Atur tampilan KPI">
            <span className="lay-opt-label">Kolom</span>
            <LayoutCheck label="Target" checked={colTarget} onChange={(v) => kl.setOpt("target", v)} />
            <LayoutCheck label="Grafik tren" checked={colTrend} onChange={(v) => kl.setOpt("trend", v)} />
            <LayoutCheck label="Tercapai 30 hari & runtutan" checked={colRate} onChange={(v) => kl.setOpt("rate", v)} />
            <LayoutSeg<number>
              label="Rentang grafik tren"
              value={trendDays}
              options={[
                [7, "7 hari"],
                [14, "14 hari"],
                [30, "30 hari"],
              ]}
              onChange={(v) => kl.setOpt("trendDays", v)}
            />
          </LayoutMenu>
          <button className="btn btn-primary" onClick={() => setEdit("new")}><Plus size={16} /> Tambah KPI</button>
        </div>
      </header>

      <div className="period">
        <button className="icon-btn" onClick={() => setDate(dateKey(addDays(parseDateKey(date), -1)))} aria-label="Hari sebelumnya"><ChevronLeft size={18} /></button>
        <div className="period-main">
          <strong>{isToday ? `Hari ini, ${dayLong(parseDateKey(date).getTime())}` : dayLong(parseDateKey(date).getTime())}</strong>
          {list.length > 0 && (
            <span className="period-legend">
              {filled.length === 0 ? "Belum ada angka untuk hari ini" : `${met.length} dari ${filled.length} KPI terisi mencapai target`}
              {filled.length < list.length && filled.length > 0 && `, ${list.length - filled.length} belum diisi`}
            </span>
          )}
        </div>
        <button className="icon-btn" disabled={isToday} onClick={() => setDate(dateKey(addDays(parseDateKey(date), 1)))} aria-label="Hari berikutnya"><ChevronRight size={18} /></button>
        {!isToday && <button className="chip-btn" onClick={() => setDate(dateKey())}>Ke hari ini</button>}
      </div>

      {!kpis.loading && list.length === 0 ? (
        <Empty
          title="Belum ada KPI"
          text="Pilih 3 sampai 5 angka yang paling menentukan hari kerja Anda, lalu isi setiap sore."
          action={<button className="btn btn-primary" onClick={() => setEdit("new")}><Plus size={16} /> Tambah KPI</button>}
        />
      ) : (
        <div className="kpi-table" role="table" aria-label="KPI harian">
          <div className="kpi-row kpi-headrow" role="row" style={rowStyle}>
            <span role="columnheader">KPI</span>
            {colTarget && <span role="columnheader">Target</span>}
            <span role="columnheader">Nilai</span>
            {colTrend && <span role="columnheader">{trendDays} hari terakhir</span>}
            {colRate && <span role="columnheader">Tercapai 30 hari</span>}
            <span role="columnheader" />
          </div>
          {list.map((k) => {
            const map = maps.get(k.id)!;
            const v = map.get(date);
            const s14 = series(map, trendDays, date).map((x) => x.value);
            const rate = hitRate(k, series(map, 30, date).map((x) => x.value));
            const st = streak(k, map, date);
            const obj = objectives.items.find((o) => o.id === k.objectiveId);
            return (
              <div key={k.id} className="kpi-row" role="row" data-oid={k.id} style={rowStyle}>
                <span className="kpi-name" role="cell">
                  <b>{k.name}</b>
                  {obj && <span className="muted small">{obj.title}</span>}
                  {!scope.current && k.projectId && <ProjectChip id={k.projectId} />}
                </span>
                {colTarget && (
                  <span className="kpi-target" role="cell">
                    {k.direction === "naik" ? "≥" : "≤"} {formatNumber(k.target)} <span className="muted">{k.unit}</span>
                  </span>
                )}
                <span role="cell" className="kpi-val">
                  <ValueInput kpi={k} value={v} onCommit={(x) => commit(k, x)} />
                  {v !== undefined && <span className="kpi-ach">{Math.round(kpiAchievement(k, v) * 100)}%</span>}
                </span>
                {colTrend && <span role="cell"><Sparkline values={s14} target={k.target} width={150} height={34} /></span>}
                {colRate && (
                  <span role="cell" className="kpi-rate">
                    {rate === null ? <span className="muted">–</span> : `${Math.round(rate * 100)}%`}
                    {st >= 2 && <span className="streak" title={`${st} hari berturut-turut tercapai`}><Flame size={13} /> {st}</span>}
                  </span>
                )}
                <span role="cell" className="row-actions">
                  <button className="icon-btn" title="Riwayat" onClick={() => setHistory(k)}><BarChart3 size={16} /></button>
                  <button className="icon-btn" title="Ubah" onClick={() => setEdit(k)}><Pencil size={16} /></button>
                  <button className="icon-btn" title="Hapus" onClick={() => setDel(k)}><Trash2 size={16} /></button>
                </span>
              </div>
            );
          })}
        </div>
      )}

      {edit && (
        <KpiForm
          initial={edit === "new" ? undefined : edit}
          objectives={objectives.items.filter((o) => !o.archived)}
          onClose={() => setEdit(null)}
          onSave={(k) => kpis.save(edit === "new" ? { ...k, order: list.length + 1 } : k, edit === "new" ? undefined : edit.id)}
        />
      )}
      {history && <HistoryModal kpi={history} map={maps.get(history.id) ?? new Map()} onClose={() => setHistory(null)} />}
      {del && (
        <Confirm
          title="Hapus KPI?"
          text={`"${del.name}" beserta seluruh riwayat angkanya akan dihapus.`}
          confirmLabel="Hapus KPI"
          onConfirm={() => removeKpi(del)}
          onClose={() => setDel(null)}
        />
      )}
    </div>
  );
}
