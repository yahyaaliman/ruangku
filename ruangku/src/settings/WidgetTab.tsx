// Pengaturan widget desktop langsung dari aplikasi (sama dengan panel di widget; perubahan
// langsung terlihat karena disimpan ke setelan "widget_prefs" yang dipantau jendela widget).
import { useState, type CSSProperties } from "react";
import { ArrowDown, ArrowUp, LayoutPanelLeft, Lock, MousePointerClick, RotateCcw, Sparkles } from "lucide-react";
import { api, emitTo, errorText, isDesktop } from "../lib/api";
import { ACCENTS, PLACES, PRESETS, SECTION_LABEL, SIZE_PRESETS, accentHex, moveSection, useWidgetPrefs } from "../lib/widgetPrefs";
import type { WidgetConfig } from "../lib/types";
import { Confirm, useToast } from "../components/ui";

function Seg<T extends string>({ value, options, onChange, label }: { value: T; options: [T, string][]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="seg" role="radiogroup" aria-label={label}>
      {options.map(([v, l]) => (
        <button key={v} role="radio" aria-checked={value === v} className={value === v ? "active" : ""} onClick={() => onChange(v)}>
          {l}
        </button>
      ))}
    </div>
  );
}

function Range({ label, value, min, max, step = 1, unit, onChange }: { label: string; value: number; min: number; max: number; step?: number; unit: string; onChange: (v: number) => void }) {
  return (
    <label className="set-range">
      <span>{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      <b>
        {value}
        {unit}
      </b>
    </label>
  );
}

export function WidgetTab() {
  const toast = useToast();
  const { prefs, update, config, setConfig } = useWidgetPrefs();
  const [clickConfirm, setClickConfirm] = useState(false);
  const wc = config;
  const set = (p: Promise<WidgetConfig>) => p.then(setConfig).catch((e) => toast(errorText(e), "error"));
  const dark = prefs.tone === "gelap";
  const accent = accentHex(prefs.accent, dark);
  const openInWidget = async () => {
    const was = wc?.visible;
    setConfig(await api.widgetSetVisible(true));
    window.setTimeout(() => emitTo("widget", "widget-open-settings"), was ? 0 : 900);
  };

  return (
    <>
      <section className="setting">
        <div className="setting-icon">
          <LayoutPanelLeft size={20} />
        </div>
        <div className="setting-body">
          <h2>Widget desktop</h2>
          <p className="muted">Panel transparan di desktop berisi jam, ibadah, agenda (jadwal, rapat, kelas, pengingat, kalender), tugas, KPI, OKR, dan catatan, plus mode mini. Perubahan di sini langsung terlihat di widget.</p>
          <div className="set-widget">
            <div className="set-widget-controls">
              <label className="switch">
                <input type="checkbox" checked={!!wc?.visible} disabled={!wc} onChange={(e) => set(api.widgetSetVisible(e.target.checked))} />
                <span>Tampilkan widget di desktop</span>
              </label>
              <div className="set-field">
                <span>Letak lapisan</span>
                <Seg label="Letak widget" value={wc?.layer ?? "desktop"} options={[["desktop", "Di desktop"], ["normal", "Biasa"], ["top", "Selalu di atas"]]} onChange={(v) => set(api.widgetSetLayer(v))} />
              </div>
              <div className="set-field">
                <span>Gaya cepat</span>
                <div className="set-chips">
                  {PRESETS.map((p) => (
                    <button
                      key={p.name}
                      className="chip-btn"
                      onClick={() => {
                        update(p.prefs);
                        set(api.widgetSetEffect(p.effect));
                      }}
                    >
                      <Sparkles size={12} /> {p.name}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div
              className={`set-widget-prev ${dark ? "dark" : "light"}`}
              style={{ "--wp-op": prefs.opacity / 100, "--wp-r": `${prefs.radius}px`, "--wp-acc": accent, fontSize: `${(prefs.scale / 100) * 12}px` } as CSSProperties}
              aria-hidden="true"
            >
              {prefs.showClock && (
                <div className="wp-clock">
                  09:41{prefs.showSeconds ? <small>:27</small> : null}
                  <span>Selasa, 27 Okt</span>
                </div>
              )}
              {prefs.sections
                .filter((s) => s.on)
                .slice(0, 4)
                .map((s) => (
                  <div key={s.id} className="wp-sec">
                    <i />
                    {SECTION_LABEL[s.id].split(" (")[0]}
                  </div>
                ))}
              <small className="wp-cap">Pratinjau</small>
            </div>
          </div>
          {!isDesktop && (
            <p className="muted small">
              Di pratinjau browser, lihat widget di{" "}
              <a href="#widget" target="_blank" rel="noreferrer">
                halaman pratinjau widget
              </a>
              .
            </p>
          )}
        </div>
      </section>

      <section className="setting">
        <div className="setting-icon">
          <Sparkles size={20} />
        </div>
        <div className="setting-body">
          <h2>Tampilan widget</h2>
          <div className="set-grid2">
            <div className="set-field">
              <span>Warna</span>
              <Seg label="Warna widget" value={prefs.tone} options={[["gelap", "Gelap"], ["terang", "Terang"]]} onChange={(tone) => update({ tone })} />
            </div>
            <div className="set-field">
              <span>Efek latar Windows</span>
              <Seg label="Efek" value={wc?.effect ?? "none"} options={[["none", "Tanpa"], ["blur", "Blur"], ["acrylic", "Acrylic"], ["mica", "Mica"]]} onChange={(e) => set(api.widgetSetEffect(e))} />
            </div>
            <Range label="Kepekatan latar" value={prefs.opacity} min={0} max={100} unit="%" onChange={(opacity) => update({ opacity })} />
            <Range label="Ukuran teks" value={prefs.scale} min={70} max={150} step={5} unit="%" onChange={(scale) => update({ scale })} />
            <Range label="Sudut membulat" value={prefs.radius} min={0} max={28} unit=" px" onChange={(radius) => update({ radius })} />
            <Range label="Ukuran grid jam" value={prefs.gridSize} min={60} max={180} step={10} unit="%" onChange={(gridSize) => update({ gridSize })} />
          </div>
          <div className="set-field">
            <span>Warna aksen</span>
            <div className="set-accents" role="radiogroup" aria-label="Warna aksen">
              {ACCENTS.map((a) => (
                <button key={a.id} role="radio" aria-checked={prefs.accent === a.id} className={prefs.accent === a.id ? "on" : ""} style={{ "--sw": dark ? a.dark : a.light } as CSSProperties} onClick={() => update({ accent: a.id })} title={a.label} aria-label={a.label} />
              ))}
            </div>
          </div>
          <p className="muted small">Acrylic dan Blur memburamkan desktop di belakang widget. Mica hanya di Windows 11.</p>
        </div>
      </section>

      <section className="setting">
        <div className="setting-icon">
          <LayoutPanelLeft size={20} />
        </div>
        <div className="setting-body">
          <h2>Isi & susunan</h2>
          <div className="set-field">
            <span>Arah isi</span>
            <Seg label="Arah isi" value={prefs.orientation} options={[["vertikal", "Vertikal"], ["horizontal", "Horizontal"]]} onChange={(orientation) => update({ orientation })} />
          </div>
          <div className="set-field">
            <span>Ukuran jendela</span>
            <div className="set-chips">
              {SIZE_PRESETS.map((sz) => (
                <button
                  key={sz.id}
                  className={`chip-btn ${wc && wc.width === sz.w && wc.height === sz.h ? "on" : ""}`}
                  onClick={() => {
                    update({ orientation: sz.orientation });
                    set(api.widgetSetSize(sz.w, sz.h));
                  }}
                  title={`${sz.w}×${sz.h}`}
                >
                  {sz.label}
                </button>
              ))}
            </div>
          </div>
          <label className="switch">
            <input type="checkbox" checked={prefs.showClock} onChange={(e) => update({ showClock: e.target.checked })} />
            <span>Jam dan tanggal</span>
          </label>
          {prefs.showClock && (
            <label className="switch">
              <input type="checkbox" checked={prefs.showSeconds} onChange={(e) => update({ showSeconds: e.target.checked })} />
              <span>Tampilkan detik</span>
            </label>
          )}
          <div className="set-list">
            <p className="set-list-head">Bagian widget</p>
            {prefs.sections.map((s, i) => (
              <div key={s.id} className="set-list-row">
                <label className="switch">
                  <input type="checkbox" checked={s.on} onChange={(e) => update({ sections: prefs.sections.map((x) => (x.id === s.id ? { ...x, on: e.target.checked } : x)) })} />
                  <span>{SECTION_LABEL[s.id]}</span>
                </label>
                <span className="spacer" />
                <button className="icon-btn sm" disabled={i === 0} onClick={() => update({ sections: moveSection(prefs.sections, s.id, -1) })} aria-label={`Naikkan ${SECTION_LABEL[s.id]}`}>
                  <ArrowUp size={14} />
                </button>
                <button className="icon-btn sm" disabled={i === prefs.sections.length - 1} onClick={() => update({ sections: moveSection(prefs.sections, s.id, 1) })} aria-label={`Turunkan ${SECTION_LABEL[s.id]}`}>
                  <ArrowDown size={14} />
                </button>
              </div>
            ))}
          </div>
          <Range label="Jumlah agenda" value={prefs.agendaCount} min={1} max={12} unit="" onChange={(agendaCount) => update({ agendaCount })} />
        </div>
      </section>

      <section className="setting">
        <div className="setting-icon">
          <Lock size={20} />
        </div>
        <div className="setting-body">
          <h2>Posisi & perilaku</h2>
          <label className="switch">
            <input type="checkbox" checked={prefs.locked} onChange={(e) => update({ locked: e.target.checked })} />
            <span>Kunci posisi dan ukuran (mencegah tergeser tidak sengaja)</span>
          </label>
          <label className="switch">
            <input type="checkbox" checked={!!wc?.clickThrough} onChange={(e) => (e.target.checked ? setClickConfirm(true) : set(api.widgetSetClickThrough(false)))} />
            <span>
              <MousePointerClick size={14} /> Klik tembus (klik diteruskan ke desktop di belakang widget)
            </span>
          </label>
          <div className="set-field">
            <span>Letakkan di</span>
            <div className="set-chips">
              {PLACES.map((p) => (
                <button key={p.id} className="chip-btn" onClick={() => set(api.widgetSnap(p.id))}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          <div className="btn-row">
            <button className="btn" onClick={() => set(api.widgetResetPosition()).then(() => toast("Widget dikembalikan ke kanan atas layar"))}>
              <RotateCcw size={15} /> Kembalikan posisi
            </button>
            <button className="btn" onClick={openInWidget}>
              Atur langsung di widget
            </button>
          </div>
        </div>
      </section>
      {clickConfirm && (
        <Confirm
          title="Aktifkan klik tembus?"
          text="Setelah ini widget tidak bisa diklik. Untuk mematikannya lagi, buka tab ini atau klik kanan ikon Ruangku di tray lalu pilih Buka kunci widget."
          confirmLabel="Aktifkan"
          onConfirm={() => set(api.widgetSetClickThrough(true))}
          onClose={() => setClickConfirm(false)}
        />
      )}
    </>
  );
}
