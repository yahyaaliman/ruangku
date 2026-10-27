import { useEffect, useMemo, useState } from "react";
import { CalendarPlus, ChevronLeft, ChevronRight } from "lucide-react";
import type { KeyResult, Kpi, KpiEntry, Objective, Reminder, TimeBlock } from "../lib/types";
import { useRecords, strip } from "../lib/useRecords";
import { useIbadah } from "../lib/useIbadah";
import { addDays, dateKey, dayShort, parseDateKey } from "../lib/date";
import { durationLabel } from "../lib/timeblocks";
import { computeStats, Data, periodDates, periodKey, periodLabel, QUESTIONS, Review as ReviewT, reviewId, ReviewType, shiftPeriod, Stats } from "../lib/review";
import { PRAYERS } from "../lib/ibadah";
import { formatNumber } from "../lib/metrics";
import { useToast } from "../components/ui";
import { BLOCK_COLORS } from "../widget/TimeGrid";
import { useScope } from "../lib/scope";
import { blockProject } from "../lib/projects";
import ProjectCharts from "../charts/ProjectCharts";
import { usePageLayout, type SectionDef } from "../lib/pageLayout";
import { LayoutCheck, LayoutMenu, LayoutSeg } from "../components/LayoutMenu";

const RV_SECTIONS: SectionDef[] = [
  { id: "tiles", label: "Angka ringkas" },
  { id: "charts", label: "Grafik proyek" },
  { id: "konsistensi", label: "Konsistensi harian" },
  { id: "jenis", label: "Waktu per jenis aktivitas" },
  { id: "proyek", label: "Waktu tercatat per proyek" },
  { id: "kpi", label: "KPI" },
  { id: "okr", label: "Progres OKR" },
  { id: "ibadah", label: "Ibadah" },
  { id: "catatan", label: "Dari evaluasi harian" },
  { id: "refleksi", label: "Refleksi" },
];
const RV_CARDS = ["konsistensi", "jenis", "proyek", "kpi", "okr", "ibadah", "catatan"];

export function useReviewData() {
  const blocks = useRecords<TimeBlock>("timeblock");
  const reminders = useRecords<Reminder>("reminder");
  const kpis = useRecords<Kpi>("kpi");
  const entries = useRecords<KpiEntry>("kpientry");
  const objectives = useRecords<Objective>("objective");
  const krs = useRecords<KeyResult>("keyresult");
  const reviews = useRecords<ReviewT>("review");
  const ib = useIbadah();
  const tasks = useRecords<import("../lib/tasks").Task>("task");
  const projects = useRecords<import("../lib/tasks").Project>("project");
  const data: Data = {
    tasks: tasks.items,
    projects: projects.items,
    blocks: blocks.items,
    reminders: reminders.items,
    kpis: kpis.items,
    entries: entries.items,
    objectives: objectives.items,
    krs: krs.items,
    ibadahConfig: ib.config,
    ibadahLogs: ib.logs,
    reviews: reviews.items,
  };
  return { data, reviews, blocks };
}

const pct = (n: number | null) => (n === null ? "–" : `${Math.round(n * 100)}%`);
const hours = (m: number) => (m ? durationLabel(0, m) : "0 jam");

/** Isian evaluasi: energi, suasana hati, pertanyaan refleksi, target. Disimpan otomatis. */
export function ReviewForm({ type, pkey, compact }: { type: ReviewType; pkey: string; compact?: boolean }) {
  const { reviews, blocks } = useReviewData();
  const toast = useToast();
  const id = reviewId(type, pkey);
  const cur = reviews.items.find((r) => r.id === id);
  const [answers, setAnswers] = useState<Record<string, string>>(cur?.answers ?? {});
  const [targets, setTargets] = useState<string[]>(cur?.targets ?? ["", "", ""]);
  useEffect(() => {
    setAnswers(cur?.answers ?? {});
    setTargets(cur?.targets ?? ["", "", ""]);
  }, [id, cur?.updatedAt]); // eslint-disable-line react-hooks/exhaustive-deps

  const base: ReviewT = cur ? strip(cur) : { type, key: pkey, answers: {} };
  const save = (patch: Partial<ReviewT>) => reviews.save({ ...base, answers, targets: type === "day" ? undefined : targets, ...patch }, id);

  const scale = (label: string, field: "energy" | "mood", lo: string, hi: string) => (
    <div className="rv-scale">
      <span className="rv-scale-label">{label}</span>
      <div className="rv-scale-btns" role="radiogroup" aria-label={label}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} role="radio" aria-checked={base[field] === n} className={base[field] === n ? "on" : ""} onClick={() => save({ [field]: base[field] === n ? undefined : n })}>
            {n}
          </button>
        ))}
      </div>
      <span className="rv-scale-hint">{lo} – {hi}</span>
    </div>
  );

  const tomorrow = dateKey(addDays(parseDateKey(pkey), 1));
  return (
    <div className={`rv-form ${compact ? "compact" : ""}`}>
      {(type === "day" || !compact) && (
        <div className="rv-scales">
          {scale("Energi", "energy", "lelah", "segar")}
          {scale("Suasana hati", "mood", "berat", "senang")}
        </div>
      )}
      {QUESTIONS[type].map((q) => (
        <label key={q.id} className="rv-q">
          <span>{q.label}</span>
          <textarea
            rows={compact ? 2 : 3}
            value={answers[q.id] ?? ""}
            placeholder={q.placeholder}
            onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
            onBlur={() => (answers[q.id] ?? "") !== (base.answers[q.id] ?? "") && save({})}
          />
        </label>
      ))}
      {type === "day" && answers.tomorrow?.trim() && (
        <button
          className="chip-btn rv-plan"
          onClick={async () => {
            await blocks.save({ date: tomorrow, start: 8 * 60, end: 9 * 60 + 30, title: answers.tomorrow.trim(), color: "nila" });
            toast("Prioritas besok ditambahkan sebagai blok 08:00–09:30");
          }}
        >
          <CalendarPlus size={13} /> Jadwalkan besok pagi
        </button>
      )}
      {type !== "day" && (
        <div className="rv-targets">
          <span>{type === "week" ? "3 target minggu depan" : "3 target bulan depan"}</span>
          {targets.map((t, i) => (
            <input
              key={i}
              value={t}
              placeholder={`Target ${i + 1}`}
              onChange={(e) => setTargets(targets.map((x, j) => (j === i ? e.target.value : x)))}
              onBlur={() => JSON.stringify(targets) !== JSON.stringify(base.targets ?? ["", "", ""]) && save({})}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rv-tile">
      <span className="rv-tile-label">{label}</span>
      <b className="rv-tile-value">{value}</b>
      {sub && <span className="rv-tile-sub">{sub}</span>}
    </div>
  );
}

type Metric = "activity" | "kpi" | "ibadah";

function Heatmap({ stats, type, metric }: { stats: Stats; type: ReviewType; metric: Metric }) {
  const first = parseDateKey(stats.days[0].date);
  const pad = type === "month" ? (first.getDay() + 6) % 7 : 0;
  return (
    <div className={`rv-heat ${type}`} role="img" aria-label="Peta konsistensi harian">
      {type === "month" && ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"].map((d) => <span key={d} className="rv-heat-wd">{d}</span>)}
      {Array.from({ length: pad }, (_, i) => <span key={`p${i}`} />)}
      {stats.days.map((d) => {
        const v = d[metric];
        const lvl = v === null ? -1 : v >= 0.9 ? 4 : v >= 0.7 ? 3 : v >= 0.45 ? 2 : v > 0 ? 1 : 0;
        return (
          <span key={d.date} className={`rv-heat-cell l${lvl}`} title={`${dayShort(parseDateKey(d.date).getTime())}: ${v === null ? "tidak ada data" : pct(v)}`}>
            <i>{parseDateKey(d.date).getDate()}</i>
            {type === "week" && <small>{v === null ? "–" : pct(v)}</small>}
          </span>
        );
      })}
    </div>
  );
}

/** Batasi data evaluasi ke ruang lingkup proyek yang dipilih. */
function scopeData(data: Data, match: (pid: string | undefined) => boolean, all: boolean): Data {
  if (all) return data;
  const tasks = data.tasks ?? [];
  return {
    ...data,
    blocks: data.blocks.filter((b) => match(blockProject(b, tasks))),
    reminders: data.reminders.filter((r) => match(r.projectId)),
    kpis: data.kpis.filter((k) => match(k.projectId)),
    objectives: data.objectives.filter((o) => match(o.projectId)),
    tasks: tasks.filter((t) => match(t.projectId)),
  };
}

export default function Review() {
  const { data: allData } = useReviewData();
  const scope = useScope();
  const data = useMemo(() => scopeData(allData, scope.match, !scope.ids), [allData, scope]);
  const [type, setType] = useState<ReviewType>("day");
  const [key, setKey] = useState(() => periodKey("day", dateKey()));
  const [metric, setMetric] = useState<Metric>("activity");
  const switchType = (t: ReviewType) => {
    setType(t);
    setKey(periodKey(t, dateKey()));
  };
  const dates = useMemo(() => periodDates(type, key), [type, key]);
  const stats = useMemo(() => computeStats(dates, data), [dates, data]);
  const prev = useMemo(() => (type === "month" ? computeStats(periodDates(type, shiftPeriod(type, key, -1)), data) : null), [type, key, data]);
  const isCurrent = key === periodKey(type, dateKey());
  const ib = stats.ibadah;
  const ibOn = data.ibadahConfig.setup;

  const delta = (a: number | null, b: number | null | undefined) => (a === null || b === null || b === undefined ? "" : `${a - b >= 0 ? "+" : ""}${Math.round((a - b) * 100)} poin dari bulan lalu`);
  const prevActivity = prev && prev.planned ? prev.done / prev.planned : null;

  const rv = usePageLayout("evaluasi", RV_SECTIONS);
  const rvIndex = (id: string) => rv.sections.findIndex((x) => x.id === id);
  const rvSec = (id: string) => ({ hidden: !rv.isOn(id), style: { order: rvIndex(id) } });
  const cardsOn = RV_CARDS.some((id) => rv.isOn(id));
  const reflectOn = rv.isOn("refleksi");
  const reflectPos = rv.opt<"samping" | "bawah">("reflect", "samping");
  const cardCols = rv.opt<1 | 2>("cardCols", 1);
  const stacked = reflectPos === "bawah" || !cardsOn || !reflectOn;

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Evaluasi{scope.current ? <span className="page-scope"> · {scope.current.name}</span> : null}</h1>
          <p className="page-sub">Angka terisi otomatis dari jadwal, KPI, OKR, dan ibadah. Anda cukup merenung dan menetapkan langkah berikutnya.</p>
        </div>
        <div className="btn-row">
          <div className="seg">
            {([["day", "Harian"], ["week", "Mingguan"], ["month", "Bulanan"]] as [ReviewType, string][]).map(([t, l]) => (
              <button key={t} className={type === t ? "active" : ""} onClick={() => switchType(t)}>{l}</button>
            ))}
          </div>
          <LayoutMenu layout={rv} title="Atur tampilan Evaluasi">
            <LayoutSeg<"samping" | "bawah">
              label="Refleksi"
              value={reflectPos}
              options={[
                ["samping", "Di samping"],
                ["bawah", "Di bawah"],
              ]}
              onChange={(v) => rv.setOpt("reflect", v)}
            />
            <LayoutCheck label="Kartu dua kolom saat refleksi di bawah" checked={cardCols === 2} onChange={(on) => rv.setOpt("cardCols", on ? 2 : 1)} />
          </LayoutMenu>
        </div>
      </header>

      <div className="period">
        <button className="icon-btn" onClick={() => setKey(shiftPeriod(type, key, -1))} aria-label="Periode sebelumnya"><ChevronLeft size={18} /></button>
        <div className="period-main">
          <strong>{type === "day" && isCurrent ? "Hari ini" : type === "week" && isCurrent ? "Minggu ini" : type === "month" && isCurrent ? "Bulan ini" : periodLabel(type, key)}</strong>
          <span className="period-legend">{periodLabel(type, key)}</span>
        </div>
        <button className="icon-btn" disabled={isCurrent} onClick={() => setKey(shiftPeriod(type, key, 1))} aria-label="Periode berikutnya"><ChevronRight size={18} /></button>
        {!isCurrent && <button className="chip-btn" onClick={() => setKey(periodKey(type, dateKey()))}>Ke periode ini</button>}
      </div>

      <div className="lay-stack">
      <div className="rv-tiles" {...rvSec("tiles")}>
        <Tile label="Aktivitas selesai" value={stats.planned ? pct(stats.done / stats.planned) : "–"} sub={stats.planned ? `${hours(stats.done)} dari ${hours(stats.planned)}` : "Belum ada blok waktu"} />
        <Tile label="KPI tercapai" value={pct(stats.kpiRate)} sub={stats.kpi.length ? `${stats.kpi.reduce((s, k) => s + k.met, 0)} dari ${stats.kpi.reduce((s, k) => s + k.filled, 0)} isian` : "Belum ada KPI"} />
        <Tile label="Tugas selesai" value={String(stats.tasksDone)} sub={`reminder ${stats.remindersDone}/${stats.remindersDue} selesai`} />
        <Tile label="Waktu tercatat" value={stats.tracked ? hours(stats.tracked) : "–"} sub={stats.trackedByProject[0] ? `terbanyak: ${stats.trackedByProject[0].name}` : "dari timer tugas"} />
        {ibOn && <Tile label="Kualitas ibadah" value={pct(ib.average)} sub={`${ib.loggedDays} dari ${dates.length} hari dicatat`} />}
        <Tile label="Check-in OKR" value={String(stats.checkIns)} sub={stats.okr.filter((o) => o.delta > 0).length ? `${stats.okr.filter((o) => o.delta > 0).length} objective maju` : "Belum ada kemajuan tercatat"} />
        {type !== "day" && <Tile label="Energi rata-rata" value={stats.energyAvg === null ? "–" : `${formatNumber(stats.energyAvg)}/5`} sub={stats.moodAvg === null ? "dari evaluasi harian" : `suasana hati ${formatNumber(stats.moodAvg)}/5`} />}
      </div>
      {type === "month" && prev && rv.isOn("tiles") && (
        <p className="muted small rv-compare" style={rvSec("tiles").style}>
          Dibanding bulan lalu: aktivitas {delta(stats.planned ? stats.done / stats.planned : null, prevActivity) || "–"}, KPI {delta(stats.kpiRate, prev.kpiRate) || "–"}
          {ibOn ? `, ibadah ${delta(ib.average, prev.ibadah.average) || "–"}` : ""}.
        </p>
      )}

      <div {...rvSec("charts")}>
      <ProjectCharts
        data={allData}
        dates={type === "day" ? Array.from({ length: 14 }, (_, i) => dateKey(addDays(parseDateKey(key), i - 13))) : dates}
        periodText={type === "day" ? "14 hari terakhir" : periodLabel(type, key)}
      />
      </div>

      <div className={`rv-grid ${stacked ? "rv-stacked" : ""}`} style={{ order: Math.min(...[...RV_CARDS, "refleksi"].map(rvIndex)) }} hidden={!cardsOn && !reflectOn}>
        <div className={`rv-col ${stacked && cardCols === 2 ? "cols-2" : ""}`} hidden={!cardsOn} style={{ order: Math.min(...RV_CARDS.map(rvIndex)) }}>
          {type !== "day" && (
            <section className="rv-card" {...rvSec("konsistensi")}>
              <header className="rv-card-head">
                <h2>Konsistensi harian</h2>
                <div className="seg">
                  <button className={metric === "activity" ? "active" : ""} onClick={() => setMetric("activity")}>Aktivitas</button>
                  <button className={metric === "kpi" ? "active" : ""} onClick={() => setMetric("kpi")}>KPI</button>
                  {ibOn && <button className={metric === "ibadah" ? "active" : ""} onClick={() => setMetric("ibadah")}>Ibadah</button>}
                </div>
              </header>
              <Heatmap stats={stats} type={type} metric={metric} />
            </section>
          )}

          {stats.byColor.length > 0 && (
            <section className="rv-card" {...rvSec("jenis")}>
              <h2>Waktu per jenis aktivitas</h2>
              <ul className="rv-bars">
                {stats.byColor.map((c) => (
                  <li key={c.color}>
                    <span>{BLOCK_COLORS.find((x) => x.id === c.color)?.label}</span>
                    <div className="rv-bar"><i className={`bc-${c.color}`} style={{ width: `${(c.minutes / stats.byColor[0].minutes) * 100}%` }} /></div>
                    <b>{hours(c.minutes)}</b>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {stats.trackedByProject.length > 0 && (
            <section className="rv-card" {...rvSec("proyek")}>
              <h2>Waktu tercatat per proyek</h2>
              <ul className="rv-bars">
                {stats.trackedByProject.map((c) => (
                  <li key={c.id}>
                    <span className="rv-bar-name">{c.name}</span>
                    <div className="rv-bar"><i className={`bc-${c.color}`} style={{ width: `${(c.minutes / stats.trackedByProject[0].minutes) * 100}%`, background: "var(--bc)" }} /></div>
                    <b>{hours(c.minutes)}</b>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {stats.kpi.length > 0 && (
            <section className="rv-card" {...rvSec("kpi")}>
              <h2>KPI</h2>
              <ul className="rv-list">
                {stats.kpi.map((k) => (
                  <li key={k.id}>
                    <span>{k.name}</span>
                    <b>{k.filled ? `${k.met}/${k.filled} tercapai` : "belum diisi"}</b>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {stats.okr.length > 0 && (
            <section className="rv-card" {...rvSec("okr")}>
              <h2>Progres OKR</h2>
              <ul className="rv-list">
                {stats.okr.map((o) => (
                  <li key={o.id}>
                    <span>{o.title}</span>
                    <b className={o.delta > 0 ? "up" : ""}>{Math.round(o.progress * 100)}% {o.delta !== 0 && `(${o.delta > 0 ? "+" : ""}${Math.round(o.delta * 100)})`}</b>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {ibOn && type !== "day" && (
            <section className="rv-card" {...rvSec("ibadah")}>
              <h2>Ibadah</h2>
              <ul className="rv-list">
                {ib.perPrayer.map((p) => (
                  <li key={p.id}>
                    <span>{PRAYERS.find((x) => x.id === p.id)?.label}</span>
                    <b>{p.perfect}/{p.days} sempurna</b>
                  </li>
                ))}
              </ul>
              {ib.perItem.length > 0 && (
                <ul className="rv-list rv-list-small">
                  {[...ib.perItem].sort((a, b) => b.done / b.days - a.done / a.days).map((i) => (
                    <li key={i.id}>
                      <span>{i.label}</span>
                      <b>{i.done}/{i.days} hari</b>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {type !== "day" && stats.notes.length > 0 && (
            <section className="rv-card" {...rvSec("catatan")}>
              <h2>Dari evaluasi harian</h2>
              <ul className="rv-notes">
                {stats.notes.map((n) => (
                  <li key={n.date}>
                    <span className="rv-note-date">{dayShort(parseDateKey(n.date).getTime())}</span>
                    <div>
                      {n.good && <p><b>Baik:</b> {n.good}</p>}
                      {n.obstacle && <p><b>Hambatan:</b> {n.obstacle}</p>}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <section className="rv-card rv-reflect" {...rvSec("refleksi")}>
          <h2>{type === "day" ? "Refleksi hari ini" : type === "week" ? "Refleksi minggu ini" : "Refleksi bulan ini"}</h2>
          <ReviewForm type={type} pkey={key} />
        </section>
      </div>
      </div>
    </div>
  );
}
