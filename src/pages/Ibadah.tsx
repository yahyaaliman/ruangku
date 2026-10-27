import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Minus, MoonStar, Plus, Settings2 } from "lucide-react";
import { addDays, dateKey, dayLong, dayShort, parseDateKey } from "../lib/date";
import { fmtMin } from "../lib/timeblocks";
import { CITIES, fastingKinds, hijriLabel, isRamadan } from "../lib/prayer";
import {
  applicableItems, dayScore, datesBetween, GROUP_LABEL, Group, IbadahConfig, itemTarget, ITEMS, isUdzur, PRAYERS,
  PrayerKey, PrayerStatus, rangeSummary, STATUS, statusLevel, targetLevel,
} from "../lib/ibadah";
import { currentPrayer, nextPrayer, useIbadah } from "../lib/useIbadah";
import { Field, Modal, useToast } from "../components/ui";
import { useNow } from "./Schedule";
import { usePageLayout, type SectionDef } from "../lib/pageLayout";
import { LayoutMenu } from "../components/LayoutMenu";

const FAST_TEXT: Record<string, string> = {
  puasa_ramadan: "puasa Ramadan",
  puasa_senin_kamis: "puasa Senin-Kamis",
  puasa_ayyamul_bidh: "puasa Ayyamul Bidh",
  puasa_arafah: "puasa Arafah",
  puasa_asyura: "puasa Tasu'a/Asyura",
};

export function pct(n: number | null) {
  return n === null ? "–" : `${Math.round(n * 100)}%`;
}

// ---------- Pengaturan awal ----------

function CityPicker({ value, onChange }: { value: Pick<IbadahConfig, "city" | "lat" | "lng" | "tz" | "elevation">; onChange: (v: Pick<IbadahConfig, "city" | "lat" | "lng" | "tz" | "elevation">) => void }) {
  const known = CITIES.find((c) => c.name === value.city);
  const [custom, setCustom] = useState(!!value.city && !known);
  return (
    <>
      <Field label="Kota">
        <select
          value={custom ? "__custom" : value.city}
          onChange={(e) => {
            if (e.target.value === "__custom") return setCustom(true);
            setCustom(false);
            const c = CITIES.find((x) => x.name === e.target.value);
            if (c) onChange({ city: c.name, lat: c.lat, lng: c.lng, tz: c.tz, elevation: c.elevation ?? 0 });
          }}
        >
          <option value="" disabled>
            Pilih kota
          </option>
          {CITIES.map((c) => (
            <option key={c.name} value={c.name}>
              {c.name} ({c.tz === 7 ? "WIB" : c.tz === 8 ? "WITA" : "WIT"})
            </option>
          ))}
          <option value="__custom">Lokasi lain (isi koordinat)</option>
        </select>
      </Field>
      {custom && (
        <div className="form-row form-row-4">
          <Field label="Nama lokasi"><input value={value.city} onChange={(e) => onChange({ ...value, city: e.target.value })} /></Field>
          <Field label="Lintang"><input inputMode="decimal" value={value.lat} onChange={(e) => onChange({ ...value, lat: Number(e.target.value) })} /></Field>
          <Field label="Bujur"><input inputMode="decimal" value={value.lng} onChange={(e) => onChange({ ...value, lng: Number(e.target.value) })} /></Field>
          <Field label="Zona (jam)">
            <select value={value.tz} onChange={(e) => onChange({ ...value, tz: Number(e.target.value) })}>
              <option value={7}>WIB (+7)</option>
              <option value={8}>WITA (+8)</option>
              <option value={9}>WIT (+9)</option>
            </select>
          </Field>
        </div>
      )}
    </>
  );
}

function Setup({ onDone }: { onDone: (c: Partial<IbadahConfig>) => void }) {
  const [loc, setLoc] = useState({ city: "", lat: 0, lng: 0, tz: 7, elevation: 0 });
  const [target, setTarget] = useState<IbadahConfig["prayerTarget"]>("masjid");
  return (
    <section className="ib-setup">
      <MoonStar size={28} className="ib-setup-icon" />
      <h2>Atur jadwal sholat</h2>
      <p className="muted">
        Jadwal dihitung offline dengan kriteria Kemenag RI untuk kota Anda. Setelah itu Ruangku mengingatkan setiap waktu sholat, sunnah, dan puasa. Semua amalan aktif dengan target sempurna; Anda bisa mengubahnya kapan saja.
      </p>
      <div className="form ib-setup-form">
        <CityPicker value={loc} onChange={setLoc} />
        <Field label="Target sholat wajib">
          <div className="seg seg-full">
            <button type="button" className={target === "masjid" ? "active" : ""} onClick={() => setTarget("masjid")}>Berjamaah di masjid</button>
            <button type="button" className={target === "awal" ? "active" : ""} onClick={() => setTarget("awal")}>Awal waktu</button>
          </div>
        </Field>
        <button className="btn btn-primary" disabled={!loc.city || (!loc.lat && !loc.lng)} onClick={() => onDone({ ...loc, prayerTarget: target, setup: true })}>
          Simpan dan aktifkan reminder
        </button>
      </div>
    </section>
  );
}

// ---------- Pengaturan lengkap ----------

function SettingsModal({ config, onSave, onClose }: { config: IbadahConfig; onSave: (c: IbadahConfig) => void; onClose: () => void }) {
  const [c, setC] = useState(config);
  const r = c.reminders;
  const setR = (patch: Partial<IbadahConfig["reminders"]>) => setC({ ...c, reminders: { ...r, ...patch } });
  const groups = [...new Set(ITEMS.map((i) => i.group))] as Group[];
  return (
    <Modal
      title="Pengaturan ibadah"
      wide
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>Batal</button>
          <button className="btn btn-primary" onClick={() => (onSave(c), onClose())}>Simpan pengaturan</button>
        </>
      }
    >
      <div className="form">
        <h3 className="ib-h3">Lokasi dan perhitungan</h3>
        <CityPicker value={c} onChange={(v) => setC({ ...c, ...v })} />
        <div className="form-row">
          <Field label="Target sholat wajib">
            <div className="seg seg-full">
              <button type="button" className={c.prayerTarget === "masjid" ? "active" : ""} onClick={() => setC({ ...c, prayerTarget: "masjid" })}>Berjamaah di masjid</button>
              <button type="button" className={c.prayerTarget === "awal" ? "active" : ""} onClick={() => setC({ ...c, prayerTarget: "awal" })}>Awal waktu</button>
            </div>
          </Field>
          <Field label="Koreksi tanggal Hijriah" hint="Sesuaikan bila berbeda dengan hasil sidang isbat">
            <select value={c.hijriOffset} onChange={(e) => setC({ ...c, hijriOffset: Number(e.target.value) })}>
              {[-2, -1, 0, 1, 2].map((n) => <option key={n} value={n}>{n > 0 ? `+${n}` : n} hari</option>)}
            </select>
          </Field>
        </div>
        <Field label="Koreksi waktu sholat (menit)" hint="Untuk menyamakan dengan jadwal masjid setempat">
          <div className="ib-offsets">
            {PRAYERS.map((p) => (
              <label key={p.id}>
                <span>{p.label}</span>
                <input type="number" min={-15} max={15} value={c.offsets[p.id]} onChange={(e) => setC({ ...c, offsets: { ...c.offsets, [p.id]: Number(e.target.value) || 0 } })} />
              </label>
            ))}
          </div>
        </Field>

        <h3 className="ib-h3">Reminder</h3>
        <label className="switch"><input type="checkbox" checked={r.enabled} onChange={(e) => setR({ enabled: e.target.checked })} /><span>Aktifkan reminder ibadah</span></label>
        {r.enabled && (
          <div className="ib-rem-grid">
            <label>
              <span>Pengingat sebelum sholat</span>
              <select value={r.prayerBefore} onChange={(e) => setR({ prayerBefore: Number(e.target.value) })}>
                {[0, 5, 10, 15, 20, 30].map((n) => <option key={n} value={n}>{n ? `${n} menit` : "Mati"}</option>)}
              </select>
            </label>
            <label className="switch"><input type="checkbox" checked={r.prayerAtTime} onChange={(e) => setR({ prayerAtTime: e.target.checked })} /><span>Saat waktu sholat masuk</span></label>
            <label className="switch"><input type="checkbox" checked={r.dhuha} onChange={(e) => setR({ dhuha: e.target.checked })} /><span>Waktu dhuha</span></label>
            <label className="switch"><input type="checkbox" checked={r.tahajud} onChange={(e) => setR({ tahajud: e.target.checked })} /><span>Sepertiga malam terakhir (tahajud)</span></label>
            <label className="switch"><input type="checkbox" checked={r.dzikir} onChange={(e) => setR({ dzikir: e.target.checked })} /><span>Dzikir pagi dan petang</span></label>
            <label className="switch"><input type="checkbox" checked={r.tilawah} onChange={(e) => setR({ tilawah: e.target.checked })} /><span>Tilawah setelah Isya</span></label>
            <label className="switch"><input type="checkbox" checked={r.fasting} onChange={(e) => setR({ fasting: e.target.checked })} /><span>Puasa: niat malam sebelumnya, sahur, imsak, berbuka</span></label>
            <label>
              <span>Pengingat sahur</span>
              <select value={r.sahurBeforeImsak} onChange={(e) => setR({ sahurBeforeImsak: Number(e.target.value) })}>
                {[0, 30, 45, 60, 90].map((n) => <option key={n} value={n}>{n ? `${n} menit sebelum imsak` : "Mati"}</option>)}
              </select>
            </label>
            <label className="switch"><input type="checkbox" checked={r.muteDuringUdzur} onChange={(e) => setR({ muteDuringUdzur: e.target.checked })} /><span>Bisukan reminder sholat dan puasa saat udzur</span></label>
          </div>
        )}

        <h3 className="ib-h3">Amalan dan target</h3>
        <p className="field-hint">Target default adalah yang sempurna. Matikan amalan yang tidak ingin dipantau.</p>
        {groups.map((g) => (
          <div key={g} className="ib-cfg-group">
            <p className="ib-cfg-title">{GROUP_LABEL[g]}</p>
            {ITEMS.filter((i) => i.group === g).map((d) => {
              const on = c.items[d.id]?.on ?? true;
              return (
                <div key={d.id} className="ib-cfg-row">
                  <label className="switch">
                    <input type="checkbox" checked={on} onChange={(e) => setC({ ...c, items: { ...c.items, [d.id]: { ...c.items[d.id], on: e.target.checked } } })} />
                    <span>{d.label}{d.hint && <small className="muted"> · {d.hint}</small>}</span>
                  </label>
                  {d.kind === "count" && on && (
                    <label className="ib-target">
                      Target
                      <input type="number" min={1} value={itemTarget(c, d)} onChange={(e) => setC({ ...c, items: { ...c.items, [d.id]: { on, target: Math.max(1, Number(e.target.value) || d.target) } } })} />
                      {d.unit}
                    </label>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </Modal>
  );
}

// ---------- Komponen catatan harian ----------

export function PrayerRow({
  id, label, at, status, target, disabled, future, onSet,
}: { id: PrayerKey; label: string; at: number | null; status?: PrayerStatus; target: number; disabled?: boolean; future?: boolean; onSet: (s: PrayerStatus | undefined) => void }) {
  const lv = statusLevel(status);
  return (
    <li className={`ib-prayer ${status ? (lv >= target ? "perfect" : lv >= 2 ? "ok" : "low") : ""} ${future ? "future" : ""}`}>
      <div className="ib-prayer-name">
        <b>{label}</b>
        <span className="muted">{at !== null ? fmtMin(at) : ""}</span>
      </div>
      <div className="ib-chips" role="radiogroup" aria-label={`Status ${label}`}>
        {STATUS.map((s) => (
          <button
            key={s.id}
            role="radio"
            aria-checked={status === s.id}
            disabled={disabled}
            className={`ib-chip lv-${s.level} ${status === s.id ? "on" : ""}`}
            onClick={() => onSet(status === s.id ? undefined : s.id)}
            title={s.label}
            data-prayer={id}
          >
            {s.short}
          </button>
        ))}
      </div>
    </li>
  );
}

export function ItemControl({ label, unit, kind, target, value, step, hint, onSet }: { label: string; unit?: string; kind: "check" | "count"; target: number; value: number; step?: number; hint?: string; onSet: (v: number) => void }) {
  const done = value >= target;
  if (kind === "check")
    return (
      <button className={`ib-item ib-check ${done ? "done" : ""}`} aria-pressed={done} onClick={() => onSet(done ? 0 : 1)}>
        <span className="ib-tick" aria-hidden="true" />
        <span className="ib-item-label">{label}{hint && <small>{hint}</small>}</span>
      </button>
    );
  return (
    <div className={`ib-item count ${done ? "done" : ""}`}>
      <span className="ib-item-label">{label}<small>{value}/{target} {unit}</small></span>
      <div className="ib-stepper">
        <button aria-label={`Kurangi ${label}`} onClick={() => onSet(Math.max(0, value - (step ?? 1)))} disabled={value <= 0}><Minus size={13} /></button>
        <input
          inputMode="numeric"
          aria-label={`${label} (${unit})`}
          value={value || ""}
          placeholder="0"
          onChange={(e) => onSet(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
        />
        <button aria-label={`Tambah ${label}`} onClick={() => onSet(value + (step ?? 1))}><Plus size={13} /></button>
      </div>
      <div className="ib-mini-bar"><i style={{ width: `${Math.min(100, (value / target) * 100)}%` }} /></div>
    </div>
  );
}

const IB_SECTIONS: SectionDef[] = [
  { id: "top", label: "Skor & jadwal sholat" },
  { id: "wajib", label: "Sholat wajib" },
  ...(Object.keys(GROUP_LABEL) as (keyof typeof GROUP_LABEL)[]).map((g) => ({ id: `grp-${g}`, label: GROUP_LABEL[g] })),
  { id: "muhasabah", label: "Muhasabah" },
  { id: "konsistensi", label: "Konsistensi 7 hari" },
];

export default function Ibadah() {
  const ib = useIbadah();
  const toast = useToast();
  const now = useNow(30000);
  const [date, setDate] = useState(dateKey());
  const [settings, setSettings] = useState(false);
  const { config } = ib;
  const today = dateKey(now);
  const log = ib.logFor(date);
  const udzur = isUdzur(config, log, date);
  const t = ib.times(date);
  const nowMin = new Date(now).getHours() * 60 + new Date(now).getMinutes();
  const score = dayScore(config, log, date);
  const items = applicableItems(config, date, udzur);
  const fasts = fastingKinds(date, config.hijriOffset).filter((f) => config.items[f]?.on ?? true);
  const tl = targetLevel(config.prayerTarget);
  const [muhasabah, setMuhasabah] = useState(log?.muhasabah ?? "");
  useEffect(() => setMuhasabah(log?.muhasabah ?? ""), [log?.muhasabah, date]);

  const week = useMemo(() => datesBetween(dateKey(addDays(parseDateKey(date), -6)), 7), [date]);
  const summary = useMemo(() => rangeSummary(config, ib.logs, week), [config, ib.logs, week]);
  const il = usePageLayout("ibadah", IB_SECTIONS);
  const ibSec = (id: string) => ({ hidden: !il.isOn(id), style: { order: il.sections.findIndex((x) => x.id === id) } });

  if (ib.loading) return <div className="page" />;
  if (!config.setup)
    return (
      <div className="page page-narrow">
        <header className="page-head"><div><h1>Ibadah</h1><p className="page-sub">Catatan sholat wajib, sunnah, tilawah, dzikir, dan puasa, beserta reminder-nya.</p></div></header>
        <Setup onDone={(c) => ib.saveConfig(c).then(() => toast("Jadwal sholat aktif. Reminder akan muncul sesuai waktu."))} />
      </div>
    );

  const next = date === today && t ? nextPrayer(t, nowMin) : null;
  const cur = date === today && t ? currentPrayer(t, nowMin) : null;
  const groups = [...new Set(items.map((i) => i.group))] as Group[];

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Ibadah</h1>
          <p className="page-sub">
            {hijriLabel(date, config.hijriOffset)} · {config.city} · target {config.prayerTarget === "masjid" ? "berjamaah di masjid" : "awal waktu"}
          </p>
        </div>
        <div className="btn-row">
          <LayoutMenu layout={il} title="Atur tampilan Ibadah" />
          <button className="btn" onClick={() => setSettings(true)}><Settings2 size={16} /> Pengaturan ibadah</button>
        </div>
      </header>

      <div className="period">
        <button className="icon-btn" onClick={() => setDate(dateKey(addDays(parseDateKey(date), -1)))} aria-label="Hari sebelumnya"><ChevronLeft size={18} /></button>
        <div className="period-main">
          <strong>{date === today ? `Hari ini, ${dayLong(parseDateKey(date).getTime())}` : dayLong(parseDateKey(date).getTime())}</strong>
          <span className="period-legend">
            {fasts.length > 0 && !udzur ? `Disunnahkan ${fasts.map((f) => FAST_TEXT[f]).join(" dan ")}` : isRamadan(date, config.hijriOffset) ? "Ramadan" : "Tidak ada puasa yang dianjurkan khusus hari ini"}
          </span>
        </div>
        <button className="icon-btn" disabled={date >= today} onClick={() => setDate(dateKey(addDays(parseDateKey(date), 1)))} aria-label="Hari berikutnya"><ChevronRight size={18} /></button>
        {date !== today && <button className="chip-btn" onClick={() => setDate(today)}>Ke hari ini</button>}
      </div>

      <div className="lay-stack">
      <div className="ib-top" {...ibSec("top")}>
        <section className="ib-score">
          <div className="ib-score-big">{pct(score.total)}</div>
          <div className="ib-score-text">
            <b>Kualitas ibadah {date === today ? "hari ini" : "hari itu"}</b>
            <span>Wajib {pct(score.wajib)} · {score.perfectPrayers}/5 sholat sempurna</span>
            <span>Sunnah {score.sunnahDone}/{score.sunnahTotal} tuntas</span>
          </div>
          <label className="switch ib-udzur">
            <input
              type="checkbox"
              checked={udzur}
              onChange={(e) => {
                ib.setDayUdzur(date, e.target.checked);
                if (date === today) ib.saveConfig({ udzurActive: e.target.checked, udzurSince: e.target.checked ? date : undefined });
              }}
            />
            <span>Udzur (haid/nifas)</span>
          </label>
        </section>
        {t && (
          <section className="ib-times" aria-label="Jadwal sholat">
            {([["Imsak", t.imsak], ["Subuh", t.subuh], ["Terbit", t.terbit], ["Dhuha", t.dhuha], ["Dzuhur", t.dzuhur], ["Ashar", t.ashar], ["Maghrib", t.maghrib], ["Isya", t.isya]] as [string, number][]).map(([n, m]) => (
              <div key={n} className={`ib-time ${next?.label === n ? "next" : ""}`}>
                <span>{n}</span>
                <b>{fmtMin(m)}</b>
              </div>
            ))}
            {next && <p className="ib-next">{next.label} dalam {next.inMin >= 60 ? `${Math.floor(next.inMin / 60)} j ${next.inMin % 60} m` : `${next.inMin} menit`}</p>}
          </section>
        )}
      </div>

      <section className="ib-section" {...ibSec("wajib")}>
        <h2>Sholat wajib</h2>
        {udzur ? (
          <p className="muted">Sedang udzur. Sholat wajib tidak dihitung pada hari ini.</p>
        ) : (
          <ul className="ib-prayers">
            {PRAYERS.map((p) => (
              <PrayerRow
                key={p.id}
                id={p.id}
                label={p.label + (cur === p.id ? " · sekarang" : "")}
                at={t ? t[p.id] : null}
                status={log?.prayers[p.id]}
                target={tl}
                future={date === today && !!t && t[p.id] > nowMin}
                onSet={(s) => ib.setPrayer(date, p.id, s)}
              />
            ))}
          </ul>
        )}
      </section>

      {groups.map((g) => (
        <section key={g} className="ib-section" {...ibSec(`grp-${g}`)}>
          <h2>{GROUP_LABEL[g]}</h2>
          <div className="ib-items">
            {items.filter((i) => i.group === g).map((d) => (
              <ItemControl key={d.id} label={d.label} unit={d.unit} kind={d.kind} target={itemTarget(config, d)} step={d.step} hint={d.hint} value={log?.items[d.id] ?? 0} onSet={(v) => ib.setItem(date, d.id, v)} />
            ))}
          </div>
        </section>
      ))}

      <section className="ib-section" {...ibSec("muhasabah")}>
        <h2>Muhasabah</h2>
        <textarea
          className="ib-muhasabah"
          rows={3}
          value={muhasabah}
          placeholder="Apa yang ingin diperbaiki dari ibadah hari ini? Apa yang disyukuri?"
          onChange={(e) => setMuhasabah(e.target.value)}
          onBlur={() => muhasabah !== (log?.muhasabah ?? "") && ib.setMuhasabah(date, muhasabah.trim())}
        />
      </section>

      <section className="ib-section" {...ibSec("konsistensi")}>
        <h2>Konsistensi 7 hari</h2>
        <div className="ib-week" role="table" aria-label="Konsistensi sholat 7 hari">
          <div className="ib-week-row head" role="row">
            <span role="columnheader" />
            {week.map((d) => <span key={d} role="columnheader">{dayShort(parseDateKey(d).getTime()).split(",")[0]}</span>)}
            <span role="columnheader">Sempurna</span>
          </div>
          {PRAYERS.map((p) => {
            const sum = summary.perPrayer.find((x) => x.id === p.id)!;
            return (
              <div key={p.id} className="ib-week-row" role="row">
                <span role="rowheader">{p.label}</span>
                {week.map((d) => {
                  const l = ib.logFor(d);
                  const st = l?.prayers[p.id];
                  const u = isUdzur(config, l, d);
                  return <span key={d} role="cell" className={`ib-cell ${u ? "udzur" : st ? `lv-${statusLevel(st)}` : ""}`} title={u ? "Udzur" : STATUS.find((s) => s.id === st)?.label ?? "Belum dicatat"} />;
                })}
                <span role="cell" className="ib-week-sum">{sum.perfect}/{sum.days}</span>
              </div>
            );
          })}
          <div className="ib-week-row" role="row">
            <span role="rowheader">Skor</span>
            {summary.scores.map((s) => <span key={s.date} role="cell" className="ib-week-score">{s.score === null ? "–" : Math.round(s.score * 100)}</span>)}
            <span role="cell" className="ib-week-sum">{pct(summary.average)}</span>
          </div>
        </div>
        <div className="ib-legend">
          {STATUS.map((s) => <span key={s.id}><i className={`ib-cell lv-${s.level}`} /> {s.short}</span>)}
          <span><i className="ib-cell udzur" /> Udzur</span>
        </div>
      </section>

      </div>

      {settings && <SettingsModal config={config} onClose={() => setSettings(false)} onSave={(c) => ib.saveConfig(c).then(() => toast("Pengaturan ibadah disimpan"))} />}
    </div>
  );
}
