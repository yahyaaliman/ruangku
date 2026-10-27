import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { dateKey } from "../lib/date";
import { fmtMin } from "../lib/timeblocks";
import { fastingKinds } from "../lib/prayer";
import { dayScore, isUdzur, itemTarget, PRAYERS, PrayerKey, STATUS, statusLevel, targetLevel, applicableItems } from "../lib/ibadah";
import { currentPrayer, nextPrayer, useIbadah } from "../lib/useIbadah";
import { SecTitle } from "./SecTitle";

const FAST_SHORT: Record<string, string> = {
  puasa_ramadan: "Puasa Ramadan",
  puasa_senin_kamis: "Puasa Senin-Kamis",
  puasa_ayyamul_bidh: "Puasa Ayyamul Bidh",
  puasa_arafah: "Puasa Arafah",
  puasa_asyura: "Puasa Asyura",
};

/** Lima sholat wajib sebagai tombol; klik untuk memilih status. */
export function PrayerPills({ date, now }: { date: string; now: number }) {
  const ib = useIbadah();
  const [open, setOpen] = useState<PrayerKey | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(null);
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [open]);
  const t = ib.times(date);
  const log = ib.logFor(date);
  const tl = targetLevel(ib.config.prayerTarget);
  const isToday = date === dateKey(now);
  const nowMin = new Date(now).getHours() * 60 + new Date(now).getMinutes();
  const cur = isToday && t ? currentPrayer(t, nowMin) : null;
  if (isUdzur(ib.config, log, date)) return <p className="w-empty">Sedang udzur. Sholat wajib tidak dihitung hari ini.</p>;
  return (
    <div className="w-prayers w-nodrag" ref={ref}>
      {PRAYERS.map((p) => {
        const st = log?.prayers[p.id];
        const lv = statusLevel(st);
        const future = isToday && !!t && t[p.id] > nowMin;
        return (
          <div key={p.id} className="w-prayer-wrap">
            <button
              className={`w-prayer ${st ? (lv >= tl ? "perfect" : lv >= 2 ? "ok" : "low") : ""} ${cur === p.id ? "cur" : ""} ${future ? "future" : ""}`}
              onClick={() => setOpen(open === p.id ? null : p.id)}
              aria-haspopup="menu"
              aria-expanded={open === p.id}
              title={st ? STATUS.find((s) => s.id === st)?.label : "Belum dicatat"}
            >
              <span>{p.label}</span>
              <b>{t ? fmtMin(t[p.id]) : ""}</b>
            </button>
            {open === p.id && (
              <div className="w-pop" role="menu">
                {STATUS.map((s) => (
                  <button
                    key={s.id}
                    role="menuitemradio"
                    aria-checked={st === s.id}
                    className={st === s.id ? "on" : ""}
                    onClick={() => {
                      ib.setPrayer(date, p.id, st === s.id ? undefined : s.id);
                      setOpen(null);
                    }}
                  >
                    <i className={`ib-cell lv-${s.level}`} /> {s.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Bagian "Ibadah" di tab Hari ini. */
export function IbadahWidget({ now, onOpenDay }: { now: number; onOpenDay: () => void }) {
  const ib = useIbadah();
  const date = dateKey(now);
  if (ib.loading) return null;
  if (!ib.config.setup)
    return (
      <section className="w-sec">
        <SecTitle id="ibadah">Ibadah</SecTitle>
        <p className="w-empty">Pilih kota untuk jadwal sholat dan reminder.</p>
        <button className="w-btn sm" onClick={() => api.openMain("ibadah")}>Atur jadwal sholat</button>
      </section>
    );
  const t = ib.times(date)!;
  const nowMin = new Date(now).getHours() * 60 + new Date(now).getMinutes();
  const next = nextPrayer(t, nowMin);
  const log = ib.logFor(date);
  const score = dayScore(ib.config, log, date);
  const udzur = isUdzur(ib.config, log, date);
  const fasts = fastingKinds(date, ib.config.hijriOffset).filter((f) => ib.config.items[f]?.on ?? true);
  const tilawah = applicableItems(ib.config, date, udzur).find((d) => d.id === "tilawah");
  const tv = log?.items.tilawah ?? 0;
  return (
    <section className="w-sec">
      <SecTitle id="ibadah" extra={score.total === null ? "" : `${Math.round(score.total * 100)}% hari ini`}>
        Ibadah
      </SecTitle>
      <p className="w-next">
        {next ? (
          <>
            <b>{next.label}</b> {next.inMin >= 60 ? `${Math.floor(next.inMin / 60)} j ${next.inMin % 60} m lagi` : `${next.inMin} menit lagi`} · {fmtMin(next.at)}
          </>
        ) : (
          <>Subuh besok · imsak {fmtMin(t.imsak)}</>
        )}
      </p>
      <PrayerPills date={date} now={now} />
      <div className="w-ib-foot w-nodrag">
        {tilawah && (
          <span className="w-tilawah">
            Tilawah {tv}/{itemTarget(ib.config, tilawah)} hal
            <button className="w-icon" aria-label="Tambah 1 halaman tilawah" onClick={() => ib.setItem(date, "tilawah", tv + 1)}>+</button>
          </span>
        )}
        {fasts.length > 0 && !udzur && <span className="w-fast">{fasts.map((f) => FAST_SHORT[f]).join(" · ")}</span>}
        <button className="w-link" onClick={onOpenDay}>Sunnah {score.sunnahDone}/{score.sunnahTotal}</button>
      </div>
    </section>
  );
}

/** Ringkasan ibadah di detail hari (widget). */
export function DayIbadah({ date, now }: { date: string; now: number }) {
  const ib = useIbadah();
  if (!ib.config.setup) {
    return (
      <>
        <p className="w-empty">Jadwal sholat belum diatur.</p>
        <button className="w-btn sm" onClick={() => api.openMain("ibadah")}>Atur jadwal sholat</button>
      </>
    );
  }
  const log = ib.logFor(date);
  const udzur = isUdzur(ib.config, log, date);
  const s = dayScore(ib.config, log, date);
  const items = applicableItems(ib.config, date, udzur);
  return (
    <>
      <PrayerPills date={date} now={now} />
      <div className="w-sunnah w-nodrag">
        {items.map((d) => {
          const v = log?.items[d.id] ?? 0;
          const target = itemTarget(ib.config, d);
          const done = v >= target;
          return (
            <button
              key={d.id}
              className={`w-sunnah-item ${done ? "done" : v > 0 ? "part" : ""}`}
              onClick={() => ib.setItem(date, d.id, d.kind === "check" ? (done ? 0 : 1) : done ? 0 : target)}
              title={d.kind === "count" ? `${v}/${target} ${d.unit}. Klik untuk menandai target tercapai.` : d.label}
            >
              {d.label}
              {d.kind === "count" && <small>{v}/{target}</small>}
            </button>
          );
        })}
      </div>
      <p className="w-empty">
        Skor {s.total === null ? "–" : `${Math.round(s.total * 100)}%`} · {s.perfectPrayers}/5 sholat sempurna · sunnah {s.sunnahDone}/{s.sunnahTotal}.{" "}
        <button className="w-link" onClick={() => api.openMain("ibadah")}>Detail</button>
      </p>
    </>
  );
}
