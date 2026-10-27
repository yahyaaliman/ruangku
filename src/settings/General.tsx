// Pengaturan umum: tema, sidebar & menu, jalan otomatis, data demo.
import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Database, Monitor, Moon, PanelLeft, Power, Sun, Trash2 } from "lucide-react";
import { api, errorText } from "../lib/api";
import { useToast } from "../components/ui";
import { useThemePref, type ThemePref } from "../lib/theme";
import { ACCENTS, FONTS, useAppearance, type Density, type FontChoice, type PageWidth, type Radius } from "../lib/appearance";
import { DEFAULT_SIDEBAR, useSidebarPrefs, type NavItem } from "../sidebar/Sidebar";
import { DEMO_STATE_KEY, demoRecords } from "../lib/demo";

const THEMES: { id: ThemePref; label: string; icon: typeof Sun; hint: string }[] = [
  { id: "system", label: "Ikuti Windows", icon: Monitor, hint: "Berganti otomatis mengikuti mode terang/gelap Windows." },
  { id: "light", label: "Terang", icon: Sun, hint: "Selalu terang." },
  { id: "dark", label: "Gelap", icon: Moon, hint: "Selalu gelap, nyaman di malam hari." },
];

export function AppearanceSettings() {
  const [theme, setTheme] = useThemePref();
  const [ap, setAp, resetAp] = useAppearance();
  return (
    <section className="setting">
      <div className="setting-icon">
        <Sun size={20} />
      </div>
      <div className="setting-body">
        <h2>Tampilan</h2>
        <p className="muted">Tema, warna aksen, ukuran tampilan, kepadatan, huruf, dan lebar halaman untuk aplikasi, jendela catat cepat, dan sticky note. Warna widget desktop diatur terpisah di tab Widget. Tiap halaman juga punya tombol <b>Tampilan</b> untuk mengatur bagiannya.</p>
        <div className="set-themes" role="radiogroup" aria-label="Tema">
          {THEMES.map((t) => (
            <button key={t.id} role="radio" aria-checked={theme === t.id} className={`set-theme th-${t.id} ${theme === t.id ? "on" : ""}`} onClick={() => setTheme(t.id)}>
              <span className="set-theme-prev" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
              <b>
                <t.icon size={14} /> {t.label}
              </b>
              <small>{t.hint}</small>
            </button>
          ))}
        </div>
        <div className="set-field">
          <span>Warna aksen</span>
          <div className="set-accents big" role="radiogroup" aria-label="Warna aksen">
            {ACCENTS.map((a) => (
              <button key={a.id} role="radio" aria-checked={ap.accent === a.id} className={ap.accent === a.id ? "on" : ""} style={{ "--sw": a.light[0] } as React.CSSProperties} onClick={() => setAp({ accent: a.id })} title={a.label} aria-label={a.label} />
            ))}
          </div>
        </div>
        <label className="set-range">
          <span>Ukuran tampilan</span>
          <input type="range" min={80} max={150} step={5} value={ap.zoom} onChange={(e) => setAp({ zoom: Number(e.target.value) })} />
          <b>{ap.zoom}%</b>
        </label>
        <p className="muted small">Pintasan: Ctrl + = memperbesar, Ctrl + − memperkecil.</p>
        <div className="set-grid2">
          <div className="set-field">
            <span>Kepadatan</span>
            <div className="seg" role="radiogroup" aria-label="Kepadatan">
              {(
                [
                  ["ringkas", "Ringkas"],
                  ["nyaman", "Nyaman"],
                  ["lega", "Lega"],
                ] as [Density, string][]
              ).map(([v, l]) => (
                <button key={v} role="radio" aria-checked={ap.density === v} className={ap.density === v ? "active" : ""} onClick={() => setAp({ density: v })}>
                  {l}
                </button>
              ))}
            </div>
          </div>
          <div className="set-field">
            <span>Lebar halaman</span>
            <div className="seg" role="radiogroup" aria-label="Lebar halaman">
              {(
                [
                  ["normal", "Normal"],
                  ["lebar", "Lebar"],
                  ["penuh", "Penuh"],
                ] as [PageWidth, string][]
              ).map(([v, l]) => (
                <button key={v} role="radio" aria-checked={ap.width === v} className={ap.width === v ? "active" : ""} onClick={() => setAp({ width: v })}>
                  {l}
                </button>
              ))}
            </div>
          </div>
          <div className="set-field">
            <span>Huruf</span>
            <select value={ap.font} onChange={(e) => setAp({ font: e.target.value as FontChoice })} style={{ width: "auto" }}>
              {FONTS.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>
          <div className="set-field">
            <span>Sudut</span>
            <div className="seg" role="radiogroup" aria-label="Sudut">
              {(
                [
                  ["tegas", "Tegas"],
                  ["sedang", "Sedang"],
                  ["membulat", "Membulat"],
                ] as [Radius, string][]
              ).map(([v, l]) => (
                <button key={v} role="radio" aria-checked={ap.radius === v} className={ap.radius === v ? "active" : ""} onClick={() => setAp({ radius: v })}>
                  {l}
                </button>
              ))}
            </div>
          </div>
        </div>
        <label className="switch">
          <input type="checkbox" checked={ap.reduceMotion} onChange={(e) => setAp({ reduceMotion: e.target.checked })} />
          <span>Kurangi animasi</span>
        </label>
        <button className="btn btn-sm" onClick={resetAp}>
          Kembalikan tampilan bawaan
        </button>
      </div>
    </section>
  );
}

export function SidebarSettings({ moduleNav }: { moduleNav: NavItem[] }) {
  const [prefs, setPrefs] = useSidebarPrefs();
  const ordered = useMemo(() => {
    const order = prefs.navOrder;
    return [...moduleNav].sort((a, b) => (order.indexOf(a.id) + 1 || 999) - (order.indexOf(b.id) + 1 || 999));
  }, [moduleNav, prefs.navOrder]);
  const move = (i: number, d: -1 | 1) =>
    setPrefs((x) => {
      const ids = ordered.map((m) => m.id);
      [ids[i], ids[i + d]] = [ids[i + d], ids[i]];
      return { ...x, navOrder: ids };
    });
  return (
    <section className="setting">
      <div className="setting-icon">
        <PanelLeft size={20} />
      </div>
      <div className="setting-body">
        <h2>Sidebar & menu</h2>
        <p className="muted">Bagian Ruang berisi proyek, subproyek, dan halaman catatan seperti Notion: seret untuk memindah, klik kanan untuk menu, klik + untuk menambah. Di sini Anda mengatur lebar dan menu modul.</p>
        <label className="switch">
          <input type="checkbox" checked={!prefs.hidden} onChange={(e) => setPrefs((x) => ({ ...x, hidden: !e.target.checked }))} />
          <span>Tampilkan sidebar (Ctrl+\ untuk menyembunyikan/menampilkan)</span>
        </label>
        <label className="set-range">
          <span>Lebar sidebar</span>
          <input type="range" min={200} max={380} step={4} value={prefs.width} onChange={(e) => setPrefs((x) => ({ ...x, width: Number(e.target.value) }))} />
          <b>{prefs.width} px</b>
        </label>
        <div className="set-list">
          <p className="set-list-head">Menu modul di sidebar</p>
          {ordered.map((n, i) => {
            const shown = !prefs.navHidden.includes(n.id);
            return (
              <div key={n.id} className="set-list-row">
                <label className="switch">
                  <input type="checkbox" checked={shown} onChange={(e) => setPrefs((x) => ({ ...x, navHidden: e.target.checked ? x.navHidden.filter((h) => h !== n.id) : [...x.navHidden, n.id] }))} />
                  <span>
                    <n.icon size={14} /> {n.label}
                  </span>
                </label>
                <span className="spacer" />
                <button className="icon-btn sm" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Naikkan ${n.label}`}>
                  <ArrowUp size={14} />
                </button>
                <button className="icon-btn sm" disabled={i === ordered.length - 1} onClick={() => move(i, 1)} aria-label={`Turunkan ${n.label}`}>
                  <ArrowDown size={14} />
                </button>
              </div>
            );
          })}
          <p className="muted small">Modul yang dimatikan di tab Plugin & ekstensi tidak muncul di daftar ini.</p>
        </div>
        <button className="btn btn-sm" onClick={() => setPrefs((x) => ({ ...x, width: DEFAULT_SIDEBAR.width, navHidden: [], navOrder: [], hidden: false }))}>
          Kembalikan susunan bawaan
        </button>
      </div>
    </section>
  );
}

export function AutostartSettings() {
  const toast = useToast();
  const [autostart, setAutostart] = useState<boolean | null>(null);
  useEffect(() => {
    api.autostartGet().then(setAutostart).catch(() => setAutostart(null));
  }, []);
  return (
    <section className="setting">
      <div className="setting-icon">
        <Power size={20} />
      </div>
      <div className="setting-body">
        <h2>Jalan otomatis</h2>
        <p className="muted">Buka Ruangku di system tray saat Windows menyala, supaya reminder, bot, dan server MCP tidak terlewat. Menutup jendela juga hanya menyembunyikannya ke tray; keluar lewat ikon tray.</p>
        <label className="switch">
          <input
            type="checkbox"
            checked={!!autostart}
            disabled={autostart === null}
            onChange={async (e) => {
              const v = e.target.checked;
              try {
                await api.autostartSet(v);
                setAutostart(v);
                toast(v ? "Ruangku akan berjalan saat Windows menyala" : "Jalan otomatis dimatikan");
              } catch (err) {
                toast(errorText(err), "error");
              }
            }}
          />
          <span>Jalankan saat Windows menyala</span>
        </label>
      </div>
    </section>
  );
}

export function DemoSettings() {
  const toast = useToast();
  return (
    <section className="setting">
      <div className="setting-icon">
        <Database size={20} />
      </div>
      <div className="setting-body">
        <h2>Data demo</h2>
        <p className="muted">Data contoh berisi enam proyek (Internal, Jitu, Kuliah, Penitipan Infaq, Recruitment, Riset Thesis) lengkap dengan tugas, jadwal, rapat, mata kuliah, keuangan, OKR, KPI, catatan, dan anggota tim. Menghapus data demo juga menghapus data contoh yang sudah Anda ubah; data buatan Anda sendiri tetap aman.</p>
        <div className="btn-row">
          <button
            className="btn"
            onClick={async () => {
              const n = await api.removeDemo();
              await api.setSetting(DEMO_STATE_KEY, "removed");
              await api.setSetting("project_scope", "all");
              toast(`${n} data demo dihapus`);
            }}
          >
            <Trash2 size={15} /> Hapus data demo
          </button>
          <button
            className="btn"
            onClick={async () => {
              const n = await api.importRecords(demoRecords());
              await api.setSetting(DEMO_STATE_KEY, "loaded");
              toast(`${n} data demo dimuat`);
            }}
          >
            <Database size={15} /> Muat ulang data demo
          </button>
        </div>
      </div>
    </section>
  );
}
