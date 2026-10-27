import { useEffect, useState } from "react";
import { Coffee } from "lucide-react";
import { api, onEvent } from "../lib/api";
import { breakAction, breakStatus, BreakStatus } from "./BreakScreen";

export interface BreakConfig {
  enabled: boolean;
  workMin: number;
  breakMin: number;
  eyeEnabled: boolean;
  eyeEvery: number;
  eyeSec: number;
  idleResetMin: number;
  overlay: boolean;
  respectQuiet: boolean;
  snoozeMin: number;
  alignPrayer: boolean;
  alignWindowMin: number;
  prayerBreakMin: number;
}
export const DEFAULT_BREAK: BreakConfig = { enabled: true, workMin: 50, breakMin: 10, eyeEnabled: true, eyeEvery: 20, eyeSec: 20, idleResetMin: 5, overlay: true, respectQuiet: true, snoozeMin: 5, alignPrayer: true, alignWindowMin: 20, prayerBreakMin: 15 };
const KEY = "break_config";

export function useBreakConfig() {
  const [cfg, setCfg] = useState<BreakConfig>(DEFAULT_BREAK);
  useEffect(() => {
    const load = () => api.getSetting(KEY).then((v) => setCfg({ ...DEFAULT_BREAK, ...(v ? JSON.parse(v) : {}) })).catch(() => {});
    load();
    return onEvent<string>("setting-changed", (k) => k === KEY && load());
  }, []);
  const save = (patch: Partial<BreakConfig>) => {
    const n = { ...cfg, ...patch };
    setCfg(n);
    api.setSetting(KEY, JSON.stringify(n));
  };
  return { cfg, save };
}

export function useBreakStatus() {
  const [st, setSt] = useState<BreakStatus | null>(null);
  useEffect(() => {
    const load = () => breakStatus().then(setSt).catch(() => {});
    load();
    const t = window.setInterval(load, 30000);
    const stop = onEvent("break-state", load);
    return () => (window.clearInterval(t), stop());
  }, []);
  return st;
}

const PRESETS: { label: string; work: number; brk: number; hint: string }[] = [
  { label: "50/10", work: 50, brk: 10, hint: "Seimbang (bawaan)" },
  { label: "25/5", work: 25, brk: 5, hint: "Pomodoro" },
  { label: "90/15", work: 90, brk: 15, hint: "Kerja dalam (deep work)" },
];

export default function BreakSettings() {
  const { cfg, save } = useBreakConfig();
  const st = useBreakStatus();
  return (
    <section className="setting" id="istirahat">
      <div className="setting-icon"><Coffee size={20} /></div>
      <div className="setting-body">
        <h2>Pengingat istirahat</h2>
        <p className="muted">Duduk terlalu lama melelahkan mata dan punggung. Ruangku mengingatkan Anda untuk jeda, dan menghitung ulang otomatis bila Anda sudah tidak memakai komputer beberapa menit.</p>
        <label className="switch">
          <input type="checkbox" checked={cfg.enabled} onChange={(e) => save({ enabled: e.target.checked })} />
          <span>Aktifkan pengingat istirahat</span>
        </label>
        {cfg.enabled && (
          <>
            {st && (
              <p className="brk-status">
                {st.onBreakUntil ? "Sedang istirahat." : `Sudah bekerja ${st.workingMin} menit · istirahat berikutnya dalam ${st.nextBreakMin} menit.`}
                <button className="link" onClick={() => breakAction("start")}>Istirahat sekarang</button>
              </p>
            )}
            <div className="chips brk-presets">
              {PRESETS.map((p) => (
                <button key={p.label} className={`chip ${cfg.workMin === p.work && cfg.breakMin === p.brk ? "active" : ""}`} onClick={() => save({ workMin: p.work, breakMin: p.brk })} title={p.hint}>
                  {p.label} <small>· {p.hint}</small>
                </button>
              ))}
            </div>
            <div className="notif-row">
              <label>Kerja <input type="number" min={5} max={240} value={cfg.workMin} onChange={(e) => save({ workMin: Math.max(5, Number(e.target.value) || 50) })} /> menit</label>
              <label>lalu istirahat <input type="number" min={1} max={60} value={cfg.breakMin} onChange={(e) => save({ breakMin: Math.max(1, Number(e.target.value) || 10) })} /> menit</label>
            </div>
            <label className="switch">
              <input type="checkbox" checked={cfg.overlay} onChange={(e) => save({ overlay: e.target.checked })} />
              <span>Tampilkan layar istirahat dengan hitung mundur (bukan hanya notifikasi)</span>
            </label>
            <label className="switch">
              <input type="checkbox" checked={cfg.eyeEnabled} onChange={(e) => save({ eyeEnabled: e.target.checked })} />
              <span>Istirahat mata 20-20-20: tiap {cfg.eyeEvery} menit, lihat jauh {cfg.eyeSec} detik</span>
            </label>
            <div className="notif-row">
              <label>Dianggap istirahat bila komputer tidak dipakai <input type="number" min={2} max={30} value={cfg.idleResetMin} onChange={(e) => save({ idleResetMin: Math.max(2, Number(e.target.value) || 5) })} /> menit</label>
            </div>
            <label className="switch">
              <input type="checkbox" checked={cfg.respectQuiet} onChange={(e) => save({ respectQuiet: e.target.checked })} />
              <span>Jangan ingatkan pada jam tenang</span>
            </label>
            <label className="switch">
              <input type="checkbox" checked={cfg.alignPrayer} onChange={(e) => save({ alignPrayer: e.target.checked })} />
              <span>Selaraskan dengan waktu sholat</span>
            </label>
            {cfg.alignPrayer && (
              <p className="muted small">
                Bila jadwal istirahat jatuh dalam{" "}
                <select className="inline-select" value={cfg.alignWindowMin} onChange={(e) => save({ alignWindowMin: Number(e.target.value) })}>
                  {[10, 15, 20, 30].map((n) => (
                    <option key={n} value={n}>
                      {n} menit
                    </option>
                  ))}
                </select>{" "}
                sebelum adzan, istirahat ditunda dan diambil saat adzan selama{" "}
                <select className="inline-select" value={cfg.prayerBreakMin} onChange={(e) => save({ prayerBreakMin: Number(e.target.value) })}>
                  {[10, 15, 20, 30].map((n) => (
                    <option key={n} value={n}>
                      {n} menit
                    </option>
                  ))}
                </select>{" "}
                sekalian sholat. Memakai lokasi dari halaman Ibadah.
              </p>
            )}
            <p className="muted small">Deteksi "tidak dipakai" memakai aktivitas keyboard dan mouse di Windows. Tombol <b>Tunda</b> menunda {cfg.snoozeMin} menit. Istirahat bisa juga dimulai dari menu tray.</p>
          </>
        )}
      </div>
    </section>
  );
}
