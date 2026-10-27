// Pengaturan notifikasi: blok aktivitas, evaluasi, jam tenang.
import { Bell } from "lucide-react";
import { api, errorText, isDesktop } from "../lib/api";
import { NotifConfig, useNotifConfig } from "../lib/notifConfig";
import { useToast } from "../components/ui";

export function NotifSettings() {
  const toast = useToast();
  const notif = useNotifConfig();
  const nc = notif.config;
  const setNc = (fn: (c: NotifConfig) => NotifConfig) => notif.save(fn(structuredClone(nc)));
  return (
    <>
  <section className="setting">
    <div className="setting-icon"><Bell size={20} /></div>
    <div className="setting-body">
      <h2>Notifikasi</h2>
      <p className="muted">Reminder muncul sebagai notifikasi Windows. Jika tidak muncul, periksa Pengaturan Windows › Sistem › Notifikasi dan pastikan Ruangku diizinkan, serta Fokus (Jangan Ganggu) tidak aktif.</p>
      <button className="btn" onClick={() => api.notifyTest().then(() => toast(isDesktop ? "Notifikasi uji dikirim" : "Di pratinjau browser notifikasi tidak dikirim")).catch((e) => toast(errorText(e), "error"))}>
        <Bell size={15} /> Kirim notifikasi uji
      </button>

      <div className="notif-block">
        <h3>Blok aktivitas</h3>
        <label className="switch">
          <input type="checkbox" checked={nc.blocks.enabled} onChange={(e) => setNc((c) => ((c.blocks.enabled = e.target.checked), c))} />
          <span>Ingatkan setiap blok aktivitas di jadwal per jam</span>
        </label>
        {nc.blocks.enabled && (
          <div className="notif-row">
            <label>
              Saat mulai
              <select value={nc.blocks.lead} onChange={(e) => setNc((c) => ((c.blocks.lead = Number(e.target.value)), c))}>
                {[0, 5, 10, 15, 30].map((n) => <option key={n} value={n}>{n ? `${n} menit sebelumnya` : "Tepat waktu"}</option>)}
              </select>
            </label>
            <label className="switch">
              <input type="checkbox" checked={nc.blocks.atEnd} onChange={(e) => setNc((c) => ((c.blocks.atEnd = e.target.checked), c))} />
              <span>Juga saat blok selesai</span>
            </label>
          </div>
        )}
        <p className="muted small">Setiap blok bisa punya pengaturan sendiri di editor blok pada widget.</p>
      </div>

      <div className="notif-block">
        <h3>Evaluasi</h3>
        <div className="notif-row">
          <label className="switch"><input type="checkbox" checked={nc.review.daily.on} onChange={(e) => setNc((c) => ((c.review.daily.on = e.target.checked), c))} /><span>Harian, pukul</span></label>
          <input type="time" value={nc.review.daily.time} disabled={!nc.review.daily.on} onChange={(e) => setNc((c) => ((c.review.daily.time = e.target.value), c))} />
        </div>
        <div className="notif-row">
          <label className="switch"><input type="checkbox" checked={nc.review.weekly.on} onChange={(e) => setNc((c) => ((c.review.weekly.on = e.target.checked), c))} /><span>Mingguan, setiap</span></label>
          <select value={nc.review.weekly.day} disabled={!nc.review.weekly.on} onChange={(e) => setNc((c) => ((c.review.weekly.day = Number(e.target.value)), c))}>
            {["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"].map((d, i) => <option key={d} value={i}>{d}</option>)}
          </select>
          <input type="time" value={nc.review.weekly.time} disabled={!nc.review.weekly.on} onChange={(e) => setNc((c) => ((c.review.weekly.time = e.target.value), c))} />
        </div>
        <div className="notif-row">
          <label className="switch"><input type="checkbox" checked={nc.review.monthly.on} onChange={(e) => setNc((c) => ((c.review.monthly.on = e.target.checked), c))} /><span>Bulanan, hari terakhir pukul</span></label>
          <input type="time" value={nc.review.monthly.time} disabled={!nc.review.monthly.on} onChange={(e) => setNc((c) => ((c.review.monthly.time = e.target.value), c))} />
        </div>
      </div>

      <div className="notif-block">
        <h3>Jam tenang</h3>
        <div className="notif-row">
          <label className="switch"><input type="checkbox" checked={nc.quiet.enabled} onChange={(e) => setNc((c) => ((c.quiet.enabled = e.target.checked), c))} /><span>Bisukan notifikasi aktivitas dan evaluasi dari</span></label>
          <input type="time" value={nc.quiet.start} disabled={!nc.quiet.enabled} onChange={(e) => setNc((c) => ((c.quiet.start = e.target.value), c))} />
          <span className="muted">sampai</span>
          <input type="time" value={nc.quiet.end} disabled={!nc.quiet.enabled} onChange={(e) => setNc((c) => ((c.quiet.end = e.target.value), c))} />
        </div>
        <p className="muted small">Reminder ibadah dan reminder biasa tetap berbunyi pada jam tenang. Atur reminder ibadah di halaman Ibadah.</p>
      </div>
    </div>
  </section>
    </>
  );
}
