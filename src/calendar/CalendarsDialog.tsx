// Kelola kalender luar: libur nasional, langganan ICS, Google Calendar, dan ekspor .ics.
import { useEffect, useState } from "react";
import { Download, ExternalLink, Link2, LogOut, Plus, RefreshCw, Trash2 } from "lucide-react";
import { Field, Modal, useToast } from "../components/ui";
import { api, errorText, isDesktop, saveTextFile } from "../lib/api";
import { relativeAgo } from "../lib/date";
import type { BlockColor } from "../lib/types";
import { BLOCK_COLORS } from "../widget/TimeGrid";
import { HOLIDAY_ICS, toIcs, type ExportItem } from "../lib/ics";
import { BUILTIN_HOLIDAY_YEARS } from "../lib/holidays";
import { refreshIcs, type CalCache, type CalSub } from "./sources";
import { connect, disconnect, gcalClient, runGoogleSync, saveGcal, useGcalConfig } from "./useGoogle";
import type { useRecords } from "../lib/useRecords";

type Subs = ReturnType<typeof useRecords<CalSub>>;

function ColorPick({ value, onChange }: { value: BlockColor; onChange: (c: BlockColor) => void }) {
  return (
    <select className={`cal-colorsel cc-${value}`} value={value} onChange={(e) => onChange(e.target.value as BlockColor)} aria-label="Warna">
      {BLOCK_COLORS.map((c) => (
        <option key={c.id} value={c.id}>
          {c.label}
        </option>
      ))}
    </select>
  );
}

export default function CalendarsDialog({ subs, caches, onClose, exportItems }: { subs: Subs; caches: Map<string, CalCache>; onClose: () => void; exportItems: (days: number) => ExportItem[] }) {
  const [tab, setTab] = useState<"langganan" | "google" | "ekspor">("langganan");
  return (
    <Modal title="Kalender luar" onClose={onClose} wide>
      <div className="seg cal-tabs" role="tablist">
        {(
          [
            ["langganan", "Langganan & libur"],
            ["google", "Google Calendar"],
            ["ekspor", "Ekspor .ics"],
          ] as const
        ).map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? "active" : ""} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>
      {tab === "langganan" && <Subscriptions subs={subs} caches={caches} />}
      {tab === "google" && <Google subs={subs} />}
      {tab === "ekspor" && <Export exportItems={exportItems} />}
    </Modal>
  );
}

function Subscriptions({ subs, caches }: { subs: Subs; caches: Map<string, CalCache> }) {
  const toast = useToast();
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [color, setColor] = useState<BlockColor>("ungu");
  const [holiday, setHoliday] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const list = subs.items.filter((s) => s.source !== "google");

  const add = async () => {
    const u = url.trim();
    if (!/^(https?|webcal):\/\//i.test(u)) return toast("URL harus diawali https:// atau webcal://", "error");
    const id = `calsub-${Date.now().toString(36)}`;
    const sub: CalSub = { name: name.trim() || "Kalender", source: "ics", url: u, color, enabled: true, holiday };
    await subs.save(sub, id);
    setBusy(id);
    const c = await refreshIcs(id, sub);
    setBusy(null);
    if (c.error) toast(`Langganan disimpan, tetapi belum bisa dimuat: ${c.error}`, "error");
    else toast(`${c.events.length} acara dimuat dari "${sub.name}"`);
    setName("");
    setUrl("");
    setHoliday(false);
  };

  return (
    <div className="cal-subs">
      <ul className="cal-sublist">
        {list.map((s) => {
          const c = caches.get(s.id);
          return (
            <li key={s.id}>
              <label className="cal-sub-toggle">
                <input type="checkbox" checked={s.enabled} onChange={(e) => subs.save({ ...s, enabled: e.target.checked }, s.id)} />
                <i className={`cal-swatch cc-${s.color}`} />
                <span>
                  <b>{s.name}</b>
                  <small>
                    {s.source === "builtin"
                      ? `Bawaan, tanpa internet (SKB 3 Menteri ${BUILTIN_HOLIDAY_YEARS.join(" & ")})`
                      : c?.error
                        ? `Gagal dimuat: ${c.error}`
                        : c?.at
                          ? `${c.events.length} acara · diperbarui ${relativeAgo(c.at)}`
                          : "Belum dimuat"}
                  </small>
                </span>
              </label>
              <ColorPick value={s.color} onChange={(col) => subs.save({ ...s, color: col }, s.id)} />
              {s.source === "ics" && (
                <>
                  <button
                    className="icon-btn sm"
                    aria-label="Muat ulang"
                    disabled={busy === s.id}
                    onClick={async () => {
                      setBusy(s.id);
                      const r = await refreshIcs(s.id, s);
                      setBusy(null);
                      r.error ? toast(r.error, "error") : toast(`${r.events.length} acara dimuat`);
                    }}
                  >
                    <RefreshCw size={14} className={busy === s.id ? "spin" : ""} />
                  </button>
                  <button className="icon-btn sm" aria-label="Hapus langganan" onClick={() => subs.remove(s.id)}>
                    <Trash2 size={14} />
                  </button>
                </>
              )}
            </li>
          );
        })}
      </ul>

      <h3 className="cal-h3">Tambah langganan ICS</h3>
      <p className="muted small">
        Tempel alamat kalender berformat iCalendar. Di Google Calendar: Setelan kalender → <i>Alamat rahasia dalam format iCal</i>. Outlook, Apple, dan kalender kampus biasanya punya tautan serupa.
      </p>
      <div className="cal-addform">
        <Field label="URL">
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://… .ics atau webcal://…" />
        </Field>
        <Field label="Nama">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Mis. Jadwal kuliah" />
        </Field>
        <div className="cal-addrow">
          <ColorPick value={color} onChange={setColor} />
          <label className="qc-check">
            <input type="checkbox" checked={holiday} onChange={(e) => setHoliday(e.target.checked)} /> tandai sebagai hari libur
          </label>
          <span className="spacer" />
          <button
            className="link"
            onClick={() => {
              setUrl(HOLIDAY_ICS);
              setName("Libur Indonesia (Google)");
              setColor("bata");
              setHoliday(true);
            }}
          >
            Isi contoh: libur Indonesia dari Google
          </button>
          <button className="btn btn-sm btn-primary" onClick={add} disabled={!url.trim()}>
            <Plus size={14} /> Tambah
          </button>
        </div>
      </div>
    </div>
  );
}

function Google({ subs }: { subs: Subs }) {
  const toast = useToast();
  const cfg = useGcalConfig();
  const [clientId, setClientId] = useState("");
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [cals, setCals] = useState<{ id: string; summary: string; primary?: boolean; accessRole: string }[] | null>(null);
  const [store, setStore] = useState("");

  useEffect(() => {
    if (cfg?.clientId && !clientId) setClientId(cfg.clientId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg?.clientId]);
  useEffect(() => {
    api.secretStore().then(setStore).catch(() => {});
  }, []);
  useEffect(() => {
    if (!cfg?.connected) return;
    gcalClient(cfg)
      .calendars()
      .then(setCals)
      .catch((e) => toast(errorText(e), "error"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg?.connected]);

  if (!cfg?.connected)
    return (
      <div className="cal-google">
        <p>Tampilkan kalender Google di Ruangku dan kirim blok jadwal Anda ke Google Calendar (dua arah: geser jam atau hapus di Google ikut kembali ke Ruangku).</p>
        <ol className="cal-steps">
          <li>
            Buka{" "}
            <button className="link" onClick={() => api.openUrl("https://console.cloud.google.com/apis/library/calendar-json.googleapis.com")}>
              Google Cloud Console <ExternalLink size={12} />
            </button>
            , buat proyek, lalu aktifkan <b>Google Calendar API</b>.
          </li>
          <li>
            Di <i>APIs &amp; Services → OAuth consent screen</i> isi nama aplikasi, tambahkan email Anda sebagai <i>Test user</i>.
          </li>
          <li>
            Di <i>Credentials → Create credentials → OAuth client ID</i>, pilih jenis <b>Desktop app</b>. Salin Client ID dan Client secret ke bawah.
          </li>
        </ol>
        <Field label="Client ID">
          <input value={clientId} onChange={(e) => setClientId(e.target.value)} placeholder="1234…apps.googleusercontent.com" />
        </Field>
        <Field label="Client secret" hint={store ? `Disimpan di ${store}, tidak ikut sinkronisasi.` : undefined}>
          <input type="password" value={secret} onChange={(e) => setSecret(e.target.value)} placeholder="GOCSPX-…" />
        </Field>
        {cfg?.lastError && <p className="cal-err">{cfg.lastError}</p>}
        <div className="btn-row">
          <button
            className="btn btn-primary"
            disabled={!clientId.trim() || !secret.trim() || busy || !isDesktop}
            onClick={async () => {
              setBusy(true);
              try {
                const c = await connect(clientId, secret);
                toast(`Terhubung sebagai ${c.email ?? "akun Google"}`);
              } catch (e) {
                toast(errorText(e), "error");
              } finally {
                setBusy(false);
              }
            }}
          >
            <Link2 size={15} /> {busy ? "Menunggu login di browser…" : "Hubungkan Google Calendar"}
          </button>
          {!isDesktop && <span className="muted small">Hanya di aplikasi desktop.</span>}
        </div>
      </div>
    );

  const shownIds = new Set(subs.items.filter((s) => s.source === "google" && s.enabled).map((s) => s.googleId));
  const toggleCal = async (c: { id: string; summary: string }, on: boolean) => {
    const existing = subs.items.find((s) => s.source === "google" && s.googleId === c.id);
    if (existing) await subs.save({ ...existing, enabled: on }, existing.id);
    else if (on) await subs.save({ name: c.summary, source: "google", googleId: c.id, color: "ungu", enabled: true }, `calsub-g-${c.id.replace(/[^a-zA-Z0-9]/g, "").slice(0, 24)}`);
    runGoogleSync().catch(() => {});
  };
  const writable = (cals ?? []).filter((c) => c.accessRole === "owner" || c.accessRole === "writer");

  return (
    <div className="cal-google">
      <p className="cal-connected">
        Terhubung sebagai <b>{cfg.email ?? "akun Google"}</b>
        {cfg.lastSync ? ` · sinkron ${relativeAgo(cfg.lastSync)}` : ""}
      </p>
      {cfg.lastError && <p className="cal-err">{cfg.lastError}</p>}
      <h3 className="cal-h3">Tampilkan di Ruangku</h3>
      {!cals && <p className="muted small">Memuat daftar kalender…</p>}
      <ul className="cal-sublist">
        {(cals ?? []).map((c) => {
          const sub = subs.items.find((s) => s.source === "google" && s.googleId === c.id);
          return (
            <li key={c.id}>
              <label className="cal-sub-toggle">
                <input type="checkbox" checked={shownIds.has(c.id)} onChange={(e) => toggleCal(c, e.target.checked)} />
                <i className={`cal-swatch cc-${sub?.color ?? "ungu"}`} />
                <span>
                  <b>{c.summary}</b>
                  <small>{c.primary ? "Kalender utama" : c.accessRole === "reader" ? "Hanya baca" : "Bisa diubah"}</small>
                </span>
              </label>
              {sub && <ColorPick value={sub.color} onChange={(col) => subs.save({ ...sub, color: col }, sub.id)} />}
            </li>
          );
        })}
      </ul>
      <h3 className="cal-h3">Kirim blok jadwal Ruangku ke</h3>
      <div className="cal-addrow">
        <select
          value={cfg.targetId ?? ""}
          onChange={async (e) => {
            const id = e.target.value || undefined;
            await saveGcal({ ...cfg, targetId: id, targetName: writable.find((c) => c.id === id)?.summary });
            if (id) runGoogleSync().catch((er) => toast(errorText(er), "error"));
          }}
        >
          <option value="">Jangan kirim (hanya baca)</option>
          {writable.map((c) => (
            <option key={c.id} value={c.id}>
              {c.summary}
            </option>
          ))}
        </select>
        <span className="muted small">Blok 14 hari terakhir hingga setahun ke depan. Tips: buat kalender khusus "Ruangku" di Google supaya terpisah.</span>
      </div>
      <div className="btn-row cal-gfoot">
        <button
          className="btn btn-sm"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              const r = await runGoogleSync();
              if (r) toast(`Sinkron selesai: ${r.pulled} acara dibaca, ${r.pushed} blok dikirim, ${r.updatedLocal} diperbarui dari Google`);
            } catch (e) {
              toast(errorText(e), "error");
            } finally {
              setBusy(false);
            }
          }}
        >
          <RefreshCw size={14} className={busy ? "spin" : ""} /> Sinkronkan sekarang
        </button>
        <button
          className="btn btn-sm"
          onClick={async () => {
            await disconnect();
            toast("Google Calendar diputuskan. Acara yang sudah terkirim tetap ada di Google.");
          }}
        >
          <LogOut size={14} /> Putuskan
        </button>
      </div>
    </div>
  );
}

function Export({ exportItems }: { exportItems: (days: number) => ExportItem[] }) {
  const toast = useToast();
  const [days, setDays] = useState(90);
  const items = exportItems(days);
  return (
    <div className="cal-export">
      <p>Simpan blok jadwal, tugas bertenggat, dan milestone dari lingkup proyek yang sedang dipilih sebagai berkas .ics untuk diimpor ke Google Calendar, Outlook, atau ponsel.</p>
      <div className="cal-addrow">
        <select value={days} onChange={(e) => setDays(Number(e.target.value))}>
          <option value={30}>30 hari ke depan</option>
          <option value={90}>90 hari ke depan</option>
          <option value={365}>Setahun ke depan</option>
        </select>
        <span className="muted small">{items.length} acara</span>
        <span className="spacer" />
        <button
          className="btn btn-sm btn-primary"
          disabled={!items.length}
          onClick={async () => {
            const p = await saveTextFile("Simpan kalender", `ruangku-${new Date().toISOString().slice(0, 10)}.ics`, toIcs(items), { name: "iCalendar", extensions: ["ics"] }, "text/calendar");
            if (p) toast(`Kalender disimpan: ${p}`);
          }}
        >
          <Download size={14} /> Simpan .ics
        </button>
      </div>
    </div>
  );
}
