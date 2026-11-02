// Petunjuk saat Ruangku tidak merespons: lebih baik daripada halaman kosong tanpa penjelasan.
import { useEffect, useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { isStalled, onStall, STALL_MS } from "../lib/watchdog";

const HOW_TO_RECOVER = "Tutup Ruangku lewat ikon di tray (klik kanan, lalu Keluar), kemudian buka lagi. Data Anda tetap aman.";

/** Banner global bila perintah backend yang biasanya instan tertahan terlalu lama. */
export function StallBanner() {
  const [stalled, setStalled] = useState(isStalled);
  useEffect(() => onStall(setStalled), []);
  if (!stalled) return null;
  return (
    <div className="stall-banner" role="alert">
      <AlertTriangle size={16} aria-hidden="true" />
      <span>
        <b>Ruangku tidak merespons.</b> Data belum bisa dimuat. {HOW_TO_RECOVER}
      </span>
    </div>
  );
}

/** Pengganti halaman selama kodenya dimuat. Kosong sesaat, lalu indikator, lalu petunjuk bila tertahan. */
export function PageLoading() {
  const [stage, setStage] = useState<0 | 1 | 2>(0);
  useEffect(() => {
    const a = window.setTimeout(() => setStage(1), 600);
    const b = window.setTimeout(() => setStage(2), STALL_MS);
    return () => {
      window.clearTimeout(a);
      window.clearTimeout(b);
    };
  }, []);
  return (
    <div className="page page-loading" aria-busy="true">
      {stage >= 1 && (
        <p className="muted page-loading-msg">
          <Loader2 size={16} className="spin" aria-hidden="true" /> Memuat halaman…
        </p>
      )}
      {stage === 2 && <p className="page-loading-help">Halaman ini belum juga termuat. {HOW_TO_RECOVER}</p>}
    </div>
  );
}
