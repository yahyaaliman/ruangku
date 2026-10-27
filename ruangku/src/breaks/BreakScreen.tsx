// Layar istirahat: muncul di atas semua jendela saat waktunya istirahat.
import { useEffect, useState } from "react";
import { api, onEvent } from "../lib/api";

const IDEAS = [
  { t: "Berdiri dan regangkan badan", d: "Putar bahu 10 kali, regangkan leher ke kiri dan kanan." },
  { t: "Minum segelas air", d: "Tubuh yang cukup minum lebih mudah fokus." },
  { t: "Istirahatkan mata", d: "Lihat benda yang jauh, lalu kedipkan mata pelan beberapa kali." },
  { t: "Ambil wudhu", d: "Segarkan wajah dan niatkan kembali pekerjaan sebagai ibadah." },
  { t: "Tarik napas 4-7-8", d: "Tarik 4 hitungan, tahan 7, embuskan 8. Ulangi 4 kali." },
  { t: "Dzikir singkat", d: "Subhanallah, Alhamdulillah, Allahu akbar — 33 kali." },
  { t: "Jalan sebentar", d: "Beberapa langkah ke luar ruangan membantu sirkulasi darah." },
];

export interface BreakStatus {
  enabled: boolean;
  workingMin: number;
  nextBreakMin: number;
  onBreakUntil: number | null;
  breakMin: number;
}

export const breakStatus = () => (window as any).__TAURI_INTERNALS__
  ? import("@tauri-apps/api/core").then(({ invoke }) => invoke<BreakStatus>("break_status"))
  : Promise.resolve<BreakStatus>({ enabled: true, workingMin: 50, nextBreakMin: 0, onBreakUntil: Date.now() + 9 * 60000 + 42000, breakMin: 10 });
export const breakAction = (action: "skip" | "snooze" | "done" | "start") =>
  (window as any).__TAURI_INTERNALS__ ? import("@tauri-apps/api/core").then(({ invoke }) => invoke<void>("break_action", { action })) : Promise.resolve();

export default function BreakScreen() {
  const [st, setSt] = useState<BreakStatus | null>(null);
  const [now, setNow] = useState(Date.now());
  const [idea] = useState(() => IDEAS[Math.floor(Math.random() * IDEAS.length)]);
  useEffect(() => {
    const load = () => breakStatus().then(setSt).catch(() => {});
    load();
    const t = window.setInterval(() => (setNow(Date.now()), Date.now() % 5000 < 1000 && load()), 1000);
    const stop = onEvent("break-state", load);
    return () => (window.clearInterval(t), stop());
  }, []);
  const left = st?.onBreakUntil ? Math.max(0, st.onBreakUntil - now) : 0;
  const total = (st?.breakMin ?? 10) * 60000;
  const mm = Math.floor(left / 60000);
  const ss = Math.floor((left % 60000) / 1000);
  const pct = total ? 1 - left / total : 0;
  const R = 92;
  const C = 2 * Math.PI * R;
  return (
    <div className="brk">
      <div className="brk-card" role="dialog" aria-label="Waktunya istirahat">
        <p className="brk-kicker">Waktunya istirahat</p>
        <div className="brk-ring">
          <svg width="220" height="220" viewBox="0 0 220 220" aria-hidden="true">
            <circle cx="110" cy="110" r={R} className="brk-track" />
            <circle cx="110" cy="110" r={R} className="brk-prog" strokeDasharray={C} strokeDashoffset={C * (1 - pct)} />
          </svg>
          <span className="brk-time" aria-live="off">{String(mm).padStart(2, "0")}:{String(ss).padStart(2, "0")}</span>
        </div>
        <h1>{idea.t}</h1>
        <p className="brk-desc">{idea.d}</p>
        <p className="brk-note">Anda sudah bekerja {st?.workingMin ?? 50} menit tanpa jeda.</p>
        <div className="brk-btns">
          <button className="brk-btn" onClick={() => breakAction("snooze")}>Tunda 5 menit</button>
          <button className="brk-btn" onClick={() => breakAction("skip")}>Lewati</button>
          <button className="brk-btn primary" onClick={() => breakAction("done")}>{left > 0 ? "Sudah istirahat" : "Lanjut bekerja"}</button>
        </div>
      </div>
      <button className="brk-settings" onClick={() => api.openMain("settings")}>Atur pengingat istirahat</button>
    </div>
  );
}
