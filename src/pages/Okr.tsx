import { WeeklyExport } from "../reports/WeeklyExport";
import { useMemo, useState } from "react";
import { useOpenRequest } from "../lib/deeplink";
import { flashElement } from "../components/CommandPalette";
import { ChevronLeft, ChevronRight, MoreHorizontal, Pencil, Plus, Trash2, TrendingUp } from "lucide-react";
import type { Item, KeyResult, Objective } from "../lib/types";
import { strip, useRecords } from "../lib/useRecords";
import { dateShort, quarterElapsed, quarterLabel, quarterOf, shiftQuarter } from "../lib/date";
import { formatNumber, krProgress, objectiveProgress, okrHealth } from "../lib/metrics";
import { Confirm, Empty, Field, Modal, Progress, Sparkline } from "../components/ui";
import { useScope } from "../lib/scope";
import { ProjectChip, ProjectSelect } from "../projects/ProjectSwitcher";
import { NO_SECTIONS, usePageLayout } from "../lib/pageLayout";
import { LayoutCheck, LayoutMenu, LayoutSeg } from "../components/LayoutMenu";

const HEALTH_LABEL = { aman: "Sesuai jalur", waspada: "Perlu perhatian", tertinggal: "Tertinggal" };

function ObjectiveForm({ initial, period, onSave, onClose }: { initial?: Item<Objective>; period: string; onSave: (o: Objective) => void; onClose: () => void }) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [p, setP] = useState(initial?.period ?? period);
  const scope = useScope();
  const [projectId, setProjectId] = useState<string | undefined>(initial ? initial.projectId : scope.defaultProjectId);
  const submit = () => {
    if (!title.trim()) return;
    onSave({ ...(initial ? strip(initial) : {}), title: title.trim(), description: description.trim(), period: p, projectId });
    onClose();
  };
  return (
    <Modal
      title={initial ? "Ubah objective" : "Objective baru"}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>Batal</button>
          <button className="btn btn-primary" disabled={!title.trim()} onClick={submit}>Simpan objective</button>
        </>
      }
    >
      <form className="form" onSubmit={(e) => (e.preventDefault(), submit())}>
        <Field label="Objective" hint="Tujuan kualitatif yang ingin dicapai. Contoh: Pelanggan merasa dilayani dengan cepat">
          <input value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label="Kenapa ini penting">
          <textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <Field label="Proyek" hint="Objective proyek tampil di timeline proyek dan dasbor evaluasinya.">
          <ProjectSelect value={projectId} onChange={setProjectId} projects={scope.allProjects} emptyLabel="Pribadi / lintas proyek" />
        </Field>
        <Field label="Periode">
          <select value={p} onChange={(e) => setP(e.target.value)}>
            {[-1, 0, 1, 2, 3].map((n) => {
              const q = shiftQuarter(period, n);
              return <option key={q} value={q}>{quarterLabel(q)}</option>;
            })}
          </select>
        </Field>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

function KrForm({ initial, objectiveId, onSave, onClose }: { initial?: Item<KeyResult>; objectiveId: string; onSave: (k: KeyResult) => void; onClose: () => void }) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [start, setStart] = useState(String(initial?.start ?? 0));
  const [target, setTarget] = useState(String(initial?.target ?? ""));
  const [current, setCurrent] = useState(String(initial?.current ?? initial?.start ?? 0));
  const [unit, setUnit] = useState(initial?.unit ?? "");
  const n = (s: string) => Number(s.replace(",", "."));
  const valid = title.trim() && target !== "" && [start, target, current].every((s) => !Number.isNaN(n(s)));
  const submit = () => {
    if (!valid) return;
    onSave({
      ...(initial ? strip(initial) : { history: [] }),
      objectiveId,
      title: title.trim(),
      start: n(start),
      target: n(target),
      current: n(current),
      unit: unit.trim(),
    });
    onClose();
  };
  return (
    <Modal
      title={initial ? "Ubah key result" : "Key result baru"}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>Batal</button>
          <button className="btn btn-primary" disabled={!valid} onClick={submit}>Simpan key result</button>
        </>
      }
    >
      <form className="form" onSubmit={(e) => (e.preventDefault(), submit())}>
        <Field label="Key result" hint="Hasil terukur. Contoh: Waktu respon rata-rata turun ke 2 jam">
          <input value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <div className="form-row form-row-4">
          <Field label="Awal"><input inputMode="decimal" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
          <Field label="Target"><input inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} /></Field>
          <Field label="Saat ini"><input inputMode="decimal" value={current} onChange={(e) => setCurrent(e.target.value)} /></Field>
          <Field label="Satuan"><input value={unit} placeholder="jam, %, Rp" onChange={(e) => setUnit(e.target.value)} /></Field>
        </div>
        <p className="field-hint">Target boleh lebih kecil dari nilai awal untuk hal yang ingin diturunkan, seperti biaya atau waktu tunggu.</p>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

function CheckInForm({ kr, onSave, onClose }: { kr: Item<KeyResult>; onSave: (k: KeyResult) => void; onClose: () => void }) {
  const [value, setValue] = useState(String(kr.current));
  const [note, setNote] = useState("");
  const v = Number(value.replace(",", "."));
  const submit = () => {
    if (Number.isNaN(v)) return;
    const history = [...(kr.history ?? []), { at: Date.now(), value: v, note: note.trim() || undefined }].slice(-60);
    onSave({ ...strip(kr), current: v, history });
    onClose();
  };
  const preview = Number.isNaN(v) ? krProgress(kr) : krProgress({ ...kr, current: v });
  return (
    <Modal
      title="Perbarui progres"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>Batal</button>
          <button className="btn btn-primary" disabled={Number.isNaN(v)} onClick={submit}>Simpan progres</button>
        </>
      }
    >
      <form className="form" onSubmit={(e) => (e.preventDefault(), submit())}>
        <p className="kr-title-lg">{kr.title}</p>
        <Field label={`Nilai sekarang${kr.unit ? ` (${kr.unit})` : ""}`} hint={`Awal ${formatNumber(kr.start)}, target ${formatNumber(kr.target)}`}>
          <input inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} />
        </Field>
        <div className="checkin-preview">
          <Progress value={preview} />
          <span>{Math.round(preview * 100)}%</span>
        </div>
        <Field label="Catatan check-in" hint="Opsional. Apa yang berubah minggu ini?">
          <input value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        {kr.history && kr.history.length > 0 && (
          <ul className="history">
            {kr.history.slice(-5).reverse().map((h) => (
              <li key={h.at}>
                <span>{dateShort(h.at)}</span>
                <b>{formatNumber(h.value)} {kr.unit}</b>
                {h.note && <span className="muted">{h.note}</span>}
              </li>
            ))}
          </ul>
        )}
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

export default function Okr() {
  const objectives = useRecords<Objective>("objective");
  const krs = useRecords<KeyResult>("keyresult");
  const [period, setPeriod] = useState(quarterOf());
  const [editObj, setEditObj] = useState<Item<Objective> | "new" | null>(null);
  const [editKr, setEditKr] = useState<{ objectiveId: string; kr?: Item<KeyResult> } | null>(null);
  const [checkIn, setCheckIn] = useState<Item<KeyResult> | null>(null);
  const [del, setDel] = useState<{ kind: "obj" | "kr"; id: string; title: string } | null>(null);
  const [menu, setMenu] = useState<string | null>(null);

  const elapsed = quarterElapsed(period);
  const scope = useScope();
  const list = useMemo(
    () => objectives.items.filter((o) => o.period === period && !o.archived && scope.match(o.projectId)).sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.title.localeCompare(b.title)),
    [objectives.items, period, scope],
  );
  // Dibuka dari palet perintah / kalender: pindah ke periode objektif lalu sorot kartunya.
  useOpenRequest(
    "objective",
    (id) => {
      const o = objectives.items.find((x) => x.id === id);
      if (o && o.period !== period) setPeriod(o.period);
      flashElement(id);
    },
    !objectives.loading,
  );
  const krsOf = (id: string) => krs.items.filter((k) => k.objectiveId === id).sort((a, b) => a.title.localeCompare(b.title));
  const overall = objectiveProgress(list.flatMap((o) => krsOf(o.id)));

  const removeObjective = async (id: string) => {
    await Promise.all(krsOf(id).map((k) => krs.remove(k.id)));
    await objectives.remove(id);
  };

  const ol = usePageLayout("okr", NO_SECTIONS);
  const okrCols = ol.opt<number>("cols", 1);
  const showPeriod = ol.opt("period", true);
  const showDesc = ol.opt("desc", true);
  const showSpark = ol.opt("spark", true);

  return (
    <div className="page" onClick={() => menu && setMenu(null)}>
      <header className="page-head">
        <div>
          <h1>OKR{scope.current ? <span className="page-scope"> · {scope.current.name}</span> : null}</h1>
          <p className="page-sub">Objective dan key result per kuartal. Progres dibandingkan dengan waktu yang sudah berjalan.</p>
        </div>
        <div className="btn-row">
          <WeeklyExport />
          <LayoutMenu layout={ol} title="Atur tampilan OKR">
            <LayoutSeg<number>
              label="Kolom objective"
              value={okrCols}
              options={[
                [1, "1"],
                [2, "2"],
              ]}
              onChange={(v) => ol.setOpt("cols", v)}
            />
            <LayoutCheck label="Bilah kuartal & progres" checked={showPeriod} onChange={(v) => ol.setOpt("period", v)} />
            <LayoutCheck label="Deskripsi objective" checked={showDesc} onChange={(v) => ol.setOpt("desc", v)} />
            <LayoutCheck label="Grafik kecil riwayat key result" checked={showSpark} onChange={(v) => ol.setOpt("spark", v)} />
          </LayoutMenu>
          <button className="btn btn-primary" onClick={() => setEditObj("new")}>
            <Plus size={16} /> Tambah objective
          </button>
        </div>
      </header>

      <div className="period" hidden={!showPeriod}>
        <button className="icon-btn" onClick={() => setPeriod(shiftQuarter(period, -1))} aria-label="Kuartal sebelumnya"><ChevronLeft size={18} /></button>
        <div className="period-main">
          <strong>{quarterLabel(period)}</strong>
          <div className="period-track" aria-label={`Kuartal berjalan ${Math.round(elapsed * 100)} persen`}>
            <div className="period-elapsed" style={{ width: `${elapsed * 100}%` }} />
            <div className="period-progress" style={{ width: `${overall * 100}%` }} />
          </div>
          <span className="period-legend">
            <span><i className="lg-progress" /> Progres {Math.round(overall * 100)}%</span>
            <span><i className="lg-elapsed" /> Waktu berjalan {Math.round(elapsed * 100)}%</span>
          </span>
        </div>
        <button className="icon-btn" onClick={() => setPeriod(shiftQuarter(period, 1))} aria-label="Kuartal berikutnya"><ChevronRight size={18} /></button>
      </div>

      {!objectives.loading && list.length === 0 && (
        <Empty
          title={`Belum ada objective untuk ${quarterLabel(period)}`}
          text="Mulai dengan 1 sampai 3 objective, masing-masing dengan 2 sampai 4 key result yang terukur."
          action={<button className="btn btn-primary" onClick={() => setEditObj("new")}><Plus size={16} /> Tambah objective</button>}
        />
      )}

      <div className={`okr-list ${okrCols === 2 ? "cols-2" : ""}`}>
        {list.map((o) => {
          const ks = krsOf(o.id);
          const p = objectiveProgress(ks);
          const h = okrHealth(p, elapsed);
          return (
            <section key={o.id} className="objective" data-oid={o.id}>
              <header className="objective-head">
                <div className="objective-pct" data-health={h}>{Math.round(p * 100)}<small>%</small></div>
                <div className="objective-text">
                  <h2>{o.title}</h2>
                  {!scope.current && o.projectId && <ProjectChip id={o.projectId} />}
                  {showDesc && o.description && <p>{o.description}</p>}
                  <span className={`health health-${h}`}>{HEALTH_LABEL[h]}</span>
                </div>
                <div className="menu-wrap">
                  <button className="icon-btn" aria-label="Menu objective" onClick={(e) => (e.stopPropagation(), setMenu(menu === o.id ? null : o.id))}>
                    <MoreHorizontal size={18} />
                  </button>
                  {menu === o.id && (
                    <div className="menu" role="menu">
                      <button onClick={() => setEditObj(o)}><Pencil size={14} /> Ubah objective</button>
                      <button onClick={() => setDel({ kind: "obj", id: o.id, title: o.title })}><Trash2 size={14} /> Hapus objective</button>
                    </div>
                  )}
                </div>
              </header>
              <ul className="kr-list">
                {ks.map((k) => {
                  const kp = krProgress(k);
                  const hist = (k.history ?? []).map((x) => x.value);
                  return (
                    <li key={k.id} className="kr">
                      <div className="kr-main">
                        <span className="kr-title">{k.title}</span>
                        <div className="kr-bar">
                          <Progress value={kp} tone={okrHealth(kp, elapsed)} />
                          <span className="kr-num">
                            <b>{formatNumber(k.current)}</b> / {formatNumber(k.target)} {k.unit}
                          </span>
                        </div>
                      </div>
                      {showSpark && hist.length > 1 && <Sparkline values={hist} width={84} height={28} target={k.target} />}
                      <div className="row-actions always">
                        <button className="chip-btn" onClick={() => setCheckIn(k)}><TrendingUp size={13} /> Perbarui</button>
                        <button className="icon-btn" title="Ubah" onClick={() => setEditKr({ objectiveId: o.id, kr: k })}><Pencil size={15} /></button>
                        <button className="icon-btn" title="Hapus" onClick={() => setDel({ kind: "kr", id: k.id, title: k.title })}><Trash2 size={15} /></button>
                      </div>
                    </li>
                  );
                })}
              </ul>
              <button className="add-inline" onClick={() => setEditKr({ objectiveId: o.id })}>
                <Plus size={15} /> Tambah key result
              </button>
            </section>
          );
        })}
      </div>

      {editObj && (
        <ObjectiveForm
          initial={editObj === "new" ? undefined : editObj}
          period={period}
          onClose={() => setEditObj(null)}
          onSave={(o) => objectives.save(o, editObj === "new" ? undefined : editObj.id)}
        />
      )}
      {editKr && (
        <KrForm initial={editKr.kr} objectiveId={editKr.objectiveId} onClose={() => setEditKr(null)} onSave={(k) => krs.save(k, editKr.kr?.id)} />
      )}
      {checkIn && <CheckInForm kr={checkIn} onClose={() => setCheckIn(null)} onSave={(k) => krs.save(k, checkIn.id)} />}
      {del && (
        <Confirm
          title={del.kind === "obj" ? "Hapus objective?" : "Hapus key result?"}
          text={del.kind === "obj" ? `"${del.title}" beserta semua key result-nya akan dihapus.` : `"${del.title}" akan dihapus.`}
          confirmLabel="Hapus"
          onConfirm={() => (del.kind === "obj" ? removeObjective(del.id) : krs.remove(del.id))}
          onClose={() => setDel(null)}
        />
      )}
    </div>
  );
}
