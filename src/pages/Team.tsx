// Tim & bot: anggota dan peran per email, server tim (PocketBase), dan kanal bot.
import { useEffect, useMemo, useState } from "react";
import { Bot, Check, Cloud, Copy, Link2, LogOut, Mail, MessageCircle, Pencil, Plus, RefreshCw, Send, Server, ShieldCheck, Sunrise, Trash2, UserPlus, Users } from "lucide-react";
import type { Item } from "../lib/types";
import { api, errorText, httpJson, isDesktop, onEvent } from "../lib/api";
import { strip, useRecords } from "../lib/useRecords";
import { CHANNEL_LABEL, Channel, can, canManageMember, Member, ROLES, Role, normalizePhone } from "../lib/team";
import { relativeAgo } from "../lib/date";
import { Confirm, Field, Modal, useToast } from "../components/ui";
import { Avatar } from "../team/Avatars";
import { loadTeam, Pb, saveTeam, useTeam } from "../team/pb";
import { syncTeam } from "../team/teamSync";
import { botLog, BotLog, digestFor, mailCfg, newLinkCode, readBotLog, runDigest, sendTelegram, sendWa, useBotConfig } from "../team/bot";
import type { BlockColor } from "../lib/types";

type Tab = "anggota" | "server" | "bot";
interface Workspace {
  name: string;
  serverUrl: string;
  remoteId: string;
  role: Role;
}

export default function Team() {
  const [tab, setTab] = useState<Tab>(() => (localStorage.getItem("ruangku-team-tab") as Tab) || "anggota");
  const pick = (t: Tab) => (setTab(t), localStorage.setItem("ruangku-team-tab", t));
  return (
    <div className="page tm-page">
      <header className="page-head">
        <div>
          <h1>Tim & bot</h1>
          <p className="page-sub">Atur siapa saja yang terlibat, apa yang boleh mereka lakukan, dan lewat kanal mana mereka menerima penugasan.</p>
        </div>
        <div className="seg" role="tablist">
          <button role="tab" aria-selected={tab === "anggota"} className={tab === "anggota" ? "active" : ""} onClick={() => pick("anggota")}><Users size={14} /> Anggota & peran</button>
          <button role="tab" aria-selected={tab === "server"} className={tab === "server" ? "active" : ""} onClick={() => pick("server")}><Server size={14} /> Server tim</button>
          <button role="tab" aria-selected={tab === "bot"} className={tab === "bot" ? "active" : ""} onClick={() => pick("bot")}><Bot size={14} /> Bot & kanal</button>
        </div>
      </header>
      {tab === "anggota" && <MembersTab />}
      {tab === "server" && <ServerTab />}
      {tab === "bot" && <BotTab />}
    </div>
  );
}

// ---------- Anggota ----------

const COLORS: BlockColor[] = ["nila", "jambu", "laut", "daun", "kopi", "ungu", "kunyit", "bata"];

function MemberForm({ initial, workspaces, myRole, onSave, onClose }: { initial?: Item<Member>; workspaces: Item<Workspace>[]; myRole: Role; onSave: (m: Member, wsRemote?: string) => Promise<void>; onClose: () => void }) {
  const [name, setName] = useState(initial?.name ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [role, setRole] = useState<Role>(initial?.role ?? "kontributor");
  const [wa, setWa] = useState(initial?.wa ?? "");
  const [tg, setTg] = useState(initial?.telegram ?? "");
  const [via, setVia] = useState<Channel[]>(initial?.notifyVia ?? ["email"]);
  const [ws, setWs] = useState(initial?.workspaceId ?? "");
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const valid = name.trim() && /^\S+@\S+\.\S+$/.test(email.trim());
  return (
    <Modal
      title={initial ? "Ubah anggota" : "Tambah anggota"}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>Batal</button>
          <button
            className="btn btn-primary"
            disabled={!valid || busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onSave({ ...(initial ? strip(initial) : { color: COLORS[Math.floor(Math.random() * COLORS.length)] }), name: name.trim(), email: email.trim().toLowerCase(), role, wa: wa.trim() || undefined, telegram: tg.replace(/^@/, "").trim() || undefined, notifyVia: via, workspaceId: ws || undefined } as Member, workspaces.find((w) => w.id === ws)?.remoteId);
                onClose();
              } catch (e) {
                toast(errorText(e), "error");
              } finally {
                setBusy(false);
              }
            }}
          >
            Simpan anggota
          </button>
        </>
      }
    >
      <div className="form">
        <div className="form-row">
          <Field label="Nama"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Rina Wulandari" /></Field>
          <Field label="Email" hint="Dipakai untuk login server tim & notifikasi email."><input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="rina@kantor.id" disabled={!!initial?.workspaceId} /></Field>
        </div>
        <Field label="Peran">
          <div className="tm-roles">
            {ROLES.map((r) => (
              <button key={r.id} type="button" className={`tm-role ${role === r.id ? "on" : ""}`} disabled={!canManageMember(myRole, initial?.role ?? "pembaca", r.id) && r.id !== role} onClick={() => setRole(r.id)}>
                <b>{r.label}</b>
                <small>{r.desc}</small>
              </button>
            ))}
          </div>
        </Field>
        <div className="form-row">
          <Field label="Nomor WhatsApp" hint={wa ? `Dikirim ke +${normalizePhone(wa)}` : "Contoh: 0812-3456-7890"}><input value={wa} onChange={(e) => setWa(e.target.value)} /></Field>
          <Field label="Username Telegram" hint="Tanpa @. Tautkan lewat tombol Telegram di daftar anggota."><input value={tg} onChange={(e) => setTg(e.target.value)} /></Field>
        </div>
        <Field label="Kirim penugasan lewat">
          <div className="chips">
            {(["wa", "telegram", "email"] as Channel[]).map((c) => (
              <button key={c} type="button" className={`chip ${via.includes(c) ? "active" : ""}`} onClick={() => setVia(via.includes(c) ? via.filter((x) => x !== c) : [...via, c])}>{CHANNEL_LABEL[c]}</button>
            ))}
          </div>
        </Field>
        {!initial && workspaces.length > 0 && (
          <Field label="Ruang kerja tim" hint="Anggota tim bisa masuk ke aplikasinya sendiri dengan email ini dan melihat proyek yang dibagikan sesuai perannya.">
            <select value={ws} onChange={(e) => setWs(e.target.value)}>
              <option value="">Hanya lokal (penugasan & bot saja)</option>
              {workspaces.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </Field>
        )}
      </div>
    </Modal>
  );
}

function MembersTab() {
  const members = useRecords<Member>("member");
  const workspaces = useRecords<Workspace>("workspace");
  const { team } = useTeam();
  const { cfg: bot } = useBotConfig();
  const toast = useToast();
  const [form, setForm] = useState<Item<Member> | "new" | null>(null);
  const [del, setDel] = useState<Item<Member> | null>(null);
  const me = members.items.find((m) => m.isMe && !m.workspaceId) ?? members.items.find((m) => m.isMe);
  const myRole: Role = me?.role ?? "pemilik";
  const groups = useMemo(() => {
    const g: { id: string; label: string; items: Item<Member>[]; ws?: Item<Workspace> }[] = [{ id: "", label: "Anggota lokal", items: members.items.filter((m) => !m.workspaceId) }];
    for (const w of workspaces.items) g.push({ id: w.id, label: `Ruang kerja: ${w.name}`, items: members.items.filter((m) => m.workspaceId === w.id), ws: w });
    return g;
  }, [members.items, workspaces.items]);
  const roleIn = (ws?: Item<Workspace>): Role => (ws ? ws.role : myRole);

  const save = async (m: Member, wsRemote?: string, id?: string) => {
    if (m.workspaceId && team) {
      const pb = new Pb(team.serverUrl, team.token);
      const prev = id ? members.items.find((x) => x.id === id) : undefined;
      const body = { name: m.name, role: m.role, wa: m.wa ?? "", telegram: m.telegram ?? "", notifyVia: m.notifyVia ?? [] };
      if (prev?.remoteId) await pb.update("members", prev.remoteId, body);
      else await pb.create("members", { ...body, email: m.email, workspace: wsRemote });
      await syncTeam({ ...team });
      toast("Anggota tim disimpan di server");
      return;
    }
    await members.save(m, id);
  };

  return (
    <>
      <section className="tm-matrix">
        <h2><ShieldCheck size={16} /> Hak akses per peran</h2>
        <table>
          <thead>
            <tr><th>Peran</th><th>Lihat</th><th>Tambah</th><th>Ubah</th><th>Hapus</th><th>Kelola anggota</th></tr>
          </thead>
          <tbody>
            {ROLES.map((r) => (
              <tr key={r.id}>
                <th scope="row">{r.label}</th>
                <td>{can(r.id, "read") ? "✓" : "–"}</td>
                <td>{can(r.id, "create") ? "✓" : "–"}</td>
                <td>{can(r.id, "update") ? "✓" : can(r.id, "update", { assigned: true }) ? "miliknya / ditugaskan" : "–"}</td>
                <td>{can(r.id, "delete") ? "✓" : can(r.id, "delete", { own: true }) ? "buatannya" : "–"}</td>
                <td>{can(r.id, "manage") ? (r.id === "admin" ? "kecuali pemilik" : "✓") : "–"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="muted small">Peran berlaku di aplikasi, di bot WhatsApp/Telegram/email, dan ditegakkan server tim untuk proyek yang dibagikan.</p>
      </section>

      <div className="tm-toolbar">
        <button className="btn btn-primary" onClick={() => setForm("new")} disabled={!can(myRole, "manage")}><UserPlus size={15} /> Tambah anggota</button>
      </div>

      {groups.map((g) => (
        <section key={g.id || "lokal"} className="tm-group">
          <h3>{g.label} <span className="count">{g.items.length}</span></h3>
          {g.items.length === 0 && <p className="muted small">Belum ada anggota.</p>}
          <ul className="tm-list">
            {g.items.map((m) => {
              const editable = can(roleIn(g.ws), "manage") && canManageMember(roleIn(g.ws), m.role) && !(m.isMe && m.role === "pemilik" && !g.ws);
              const link = bot.telegram.username && m.linkCode ? `https://t.me/${bot.telegram.username}?start=${m.linkCode}` : null;
              return (
                <li key={m.id} className="tm-row">
                  <Avatar m={m} size={34} />
                  <div className="tm-main">
                    <b>{m.name}{m.isMe ? " (saya)" : ""}</b>
                    <span className="muted small">{m.email}</span>
                  </div>
                  <span className={`tm-badge r-${m.role}`}>{ROLES.find((r) => r.id === m.role)?.label}</span>
                  <span className="tm-ch">
                    {m.wa && <span className={`tm-chip ${m.notifyVia?.includes("wa") ? "on" : ""}`} title={`WhatsApp +${normalizePhone(m.wa)}`}><MessageCircle size={12} /> WA</span>}
                    <span className={`tm-chip ${m.telegramChatId ? (m.notifyVia?.includes("telegram") ? "on" : "") : "off"}`} title={m.telegramChatId ? "Telegram tertaut" : "Telegram belum ditautkan"}><Send size={12} /> TG{m.telegramChatId ? " ✓" : ""}</span>
                    <span className={`tm-chip ${m.notifyVia?.includes("email") ? "on" : ""}`} title={m.email}><Mail size={12} /> Email</span>
                  </span>
                  <span className="tm-actions">
                    {!m.isMe && (
                      <button
                        className="icon-btn sm"
                        title="Buat tautan Telegram"
                        onClick={async () => {
                          const code = m.linkCode ?? newLinkCode();
                          if (!m.linkCode) await members.save({ ...strip(m), linkCode: code }, m.id);
                          const url = bot.telegram.username ? `https://t.me/${bot.telegram.username}?start=${code}` : `/start ${code}`;
                          await navigator.clipboard?.writeText(url).catch(() => {});
                          toast(bot.telegram.username ? "Tautan Telegram disalin. Kirim ke anggota ini." : `Minta anggota mengirim "/start ${code}" ke bot Telegram Anda.`);
                        }}
                      >
                        <Link2 size={14} />
                      </button>
                    )}
                    {link && <button className="icon-btn sm" title={link} onClick={() => navigator.clipboard?.writeText(link)}><Copy size={13} /></button>}
                    {editable && <button className="icon-btn sm" onClick={() => setForm(m)} aria-label={`Ubah ${m.name}`}><Pencil size={14} /></button>}
                    {editable && !m.isMe && <button className="icon-btn sm" onClick={() => setDel(m)} aria-label={`Hapus ${m.name}`}><Trash2 size={14} /></button>}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      {form && <MemberForm initial={form === "new" ? undefined : form} workspaces={workspaces.items} myRole={myRole} onClose={() => setForm(null)} onSave={(m, ws) => save(m, ws, form === "new" ? undefined : form.id)} />}
      {del && (
        <Confirm
          title="Hapus anggota?"
          text={`${del.name} tidak akan menerima penugasan lagi${del.workspaceId ? " dan kehilangan akses ke ruang kerja tim" : ""}. Tugas yang sudah ditugaskan tetap ada.`}
          confirmLabel="Hapus anggota"
          onConfirm={async () => {
            const rid = del.remoteId;
            if (del.workspaceId && rid && team) {
              try {
                await new Pb(team.serverUrl, team.token).remove("members", rid);
                await syncTeam(team);
              } catch (e) {
                toast(errorText(e), "error");
              }
            } else await members.remove(del.id);
          }}
          onClose={() => setDel(null)}
        />
      )}
    </>
  );
}

// ---------- Server tim ----------

export interface TeamStatus {
  at: number;
  ok: boolean;
  text: string;
}

function ServerTab() {
  const { team } = useTeam();
  const workspaces = useRecords<Workspace>("workspace");
  const toast = useToast();
  const [url, setUrl] = useState("http://localhost:8090");
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [wsName, setWsName] = useState("");
  const [status, setStatus] = useState<TeamStatus | null>(null);
  const [live, setLive] = useState<{ connected: boolean; error?: string | null } | null>(null);
  useEffect(() => {
    const load = () => api.getSetting("team_status").then((v) => setStatus(v ? JSON.parse(v) : null));
    load();
    const t = window.setInterval(load, 10000);
    const stop = onEvent<{ connected: boolean; error?: string | null }>("team-realtime", setLive);
    return () => (window.clearInterval(t), stop());
  }, []);

  const connect = async (register: boolean) => {
    setBusy(true);
    try {
      const pb = new Pb(url);
      if (!(await pb.health())) throw new Error("Server tidak menjawab. Periksa alamat dan pastikan PocketBase berjalan.");
      const r = register ? await pb.register(email.trim(), pass, name.trim() || email.split("@")[0]) : await pb.login(email.trim(), pass);
      await saveTeam({ serverUrl: url.trim().replace(/\/+$/, ""), token: r.token, tokenAt: Date.now(), userId: r.record.id, email: r.record.email, name: r.record.name || name });
      const t = await loadTeam();
      if (t) await syncTeam(t);
      setPass("");
      toast(register ? "Akun dibuat dan terhubung ke server tim" : "Terhubung ke server tim");
    } catch (e) {
      toast(errorText(e).replace(/^HTTP 400: /, ""), "error");
    } finally {
      setBusy(false);
    }
  };

  if (!team)
    return (
      <div className="tm-server">
        <section className="tm-card">
          <h2><Cloud size={16} /> Hubungkan server tim</h2>
          <p className="muted">Kolaborasi memakai server <b>PocketBase</b> milik Anda sendiri (gratis, satu file). Jalankan di PC kantor, VPS, atau layanan PocketHost, lalu salin folder <code>server/pb_migrations</code> dan <code>server/pb_hooks</code> dari paket Ruangku. Langkah lengkapnya ada di Panduan → Kolaborasi tim.</p>
          <div className="form">
            <Field label="Alamat server"><input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://ruangku.domainanda.com" /></Field>
            <div className="form-row">
              <Field label="Email"><input value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" /></Field>
              <Field label="Kata sandi" hint="Minimal 8 karakter."><input type="password" value={pass} onChange={(e) => setPass(e.target.value)} autoComplete="current-password" /></Field>
            </div>
            <Field label="Nama (untuk daftar baru)"><input value={name} onChange={(e) => setName(e.target.value)} /></Field>
            <div className="btn-row">
              <button className="btn btn-primary" disabled={busy || !email || pass.length < 8} onClick={() => connect(false)}>Masuk</button>
              <button className="btn" disabled={busy || !email || pass.length < 8} onClick={() => connect(true)}>Daftar akun baru</button>
            </div>
          </div>
        </section>
      </div>
    );

  return (
    <div className="tm-server">
      <section className="tm-card">
        <h2><Cloud size={16} /> Terhubung ke {team.serverUrl}</h2>
        <p>Masuk sebagai <b>{team.name || team.email}</b> ({team.email}).</p>
        {status && <p className={`tm-status ${status.ok ? "ok" : "err"}`}>{status.ok ? "✓" : "⚠"} {status.text} · {relativeAgo(status.at)}</p>}
        {live && <p className={`tm-status ${live.connected ? "ok" : "err"}`}>{live.connected ? "● Realtime aktif: perubahan anggota lain masuk dalam hitungan detik" : `○ Realtime terputus (${live.error ?? "menyambung ulang"}); sinkron tetap berjalan tiap 30 detik`}</p>}
        <div className="btn-row">
          <button
            className="btn"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const r = await syncTeam(team);
                toast(`Tersinkron: ${r.pushed} terkirim, ${r.pulled} diterima${r.rejected.length ? `, ${r.rejected.length} ditolak` : ""}`);
              } catch (e) {
                toast(errorText(e), "error");
              } finally {
                setBusy(false);
              }
            }}
          >
            <RefreshCw size={15} className={busy ? "spin" : ""} /> Sinkronkan sekarang
          </button>
          <button className="btn" onClick={() => saveTeam(null)}><LogOut size={15} /> Keluar</button>
        </div>
      </section>

      <section className="tm-card">
        <h2><Users size={16} /> Ruang kerja</h2>
        <p className="muted small">Bagikan proyek dengan membuka Proyek → ubah proyek → <b>Dibagikan ke tim</b>. Subproyek ikut dibagikan. Data pribadi seperti ibadah, pengaturan, dan proyek lain tidak pernah dikirim.</p>
        <ul className="tm-ws">
          {workspaces.items.map((w) => (
            <li key={w.id}><b>{w.name}</b> <span className={`tm-badge r-${w.role}`}>{ROLES.find((r) => r.id === w.role)?.label}</span></li>
          ))}
          {workspaces.items.length === 0 && <li className="muted small">Belum ada ruang kerja.</li>}
        </ul>
        <form
          className="tm-inline"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!wsName.trim()) return;
            try {
              await new Pb(team.serverUrl, team.token).create("workspaces", { name: wsName.trim(), owner: team.userId });
              setWsName("");
              await syncTeam(team);
              toast("Ruang kerja dibuat. Anda pemiliknya.");
            } catch (e2) {
              toast(errorText(e2), "error");
            }
          }}
        >
          <input value={wsName} onChange={(e) => setWsName(e.target.value)} placeholder="Nama ruang kerja baru, mis. Tim Jitu" />
          <button className="btn btn-primary" type="submit"><Plus size={15} /> Buat</button>
        </form>
      </section>
    </div>
  );
}

// ---------- Bot & kanal ----------

function BotTab() {
  const { cfg, save } = useBotConfig();
  const members = useRecords<Member>("member");
  const [preview, setPreview] = useState("");
  const { team } = useTeam();
  const toast = useToast();
  const [log, setLog] = useState<BotLog[]>(readBotLog);
  const [testTo, setTestTo] = useState("");
  useEffect(() => {
    const f = () => setLog(readBotLog());
    window.addEventListener("ruangku-bot-log", f);
    return () => window.removeEventListener("ruangku-bot-log", f);
  }, []);
  const tryIt = async (label: string, fn: () => Promise<unknown>) => {
    try {
      await fn();
      toast(`${label} berhasil`);
      botLog({ dir: "out", channel: "sistem", who: "uji", text: `${label} berhasil` });
    } catch (e) {
      toast(`${label} gagal: ${errorText(e)}`, "error");
    }
  };

  return (
    <div className="tm-bot">
      <section className="tm-card">
        <label className="switch">
          <input type="checkbox" checked={cfg.enabled} onChange={(e) => save({ enabled: e.target.checked })} />
          <span><b>Perangkat ini menjalankan bot</b> — mengirim penugasan dan membalas pesan anggota. Aktifkan di satu komputer saja yang paling sering menyala.</span>
        </label>
        {!isDesktop && <p className="muted small">Di pratinjau browser bot tidak berjalan; gunakan aplikasi desktop.</p>}
      </section>

      <section className="tm-card">
        <h2><Send size={16} /> Telegram</h2>
        <p className="muted small">Buat bot lewat <b>@BotFather</b> di Telegram (perintah /newbot), lalu tempel tokennya. Anggota menautkan akun dengan tautan dari daftar anggota.</p>
        <div className="form-row">
          <Field label="Token bot"><input type="password" value={cfg.telegram.token} onChange={(e) => save({ telegram: { ...cfg.telegram, token: e.target.value.trim() } })} placeholder="123456:ABC-…" autoComplete="off" /></Field>
          <Field label="Username bot" hint="Terisi otomatis saat dicek."><input value={cfg.telegram.username ?? ""} readOnly /></Field>
        </div>
        <div className="btn-row">
          <label className="switch"><input type="checkbox" checked={cfg.telegram.enabled} onChange={(e) => save({ telegram: { ...cfg.telegram, enabled: e.target.checked } })} /><span>Aktif</span></label>
          <button className="btn btn-sm" disabled={!cfg.telegram.token} onClick={() => tryIt("Cek bot Telegram", async () => { const r = await httpJson<{ result: { username: string } }>("GET", `${cfg.telegram.apiBase}/bot${cfg.telegram.token}/getMe`); await save({ telegram: { ...cfg.telegram, username: r.result.username } }); })}><Check size={13} /> Cek bot</button>
          <button className="btn btn-sm" disabled={!cfg.telegram.token || !testTo} onClick={() => tryIt("Kirim Telegram uji", () => sendTelegram(cfg, Number(testTo), "Halo dari Ruangku 👋"))}>Kirim uji ke chat ID</button>
        </div>
      </section>

      <section className="tm-card">
        <h2><Mail size={16} /> Email (Gmail)</h2>
        <p className="muted small">Aktifkan verifikasi 2 langkah di akun Google, lalu buat <b>App Password</b> (Akun Google → Keamanan → Sandi aplikasi). Jangan pakai kata sandi biasa. Balasan email berisi "selesai" atau "tunda besok" diproses otomatis.</p>
        <div className="form-row">
          <Field label="Alamat Gmail"><input value={cfg.email.user} onChange={(e) => save({ email: { ...cfg.email, user: e.target.value.trim() } })} placeholder="anda@gmail.com" /></Field>
          <Field label="App Password"><input type="password" value={cfg.email.password} onChange={(e) => save({ email: { ...cfg.email, password: e.target.value } })} placeholder="16 huruf" autoComplete="off" /></Field>
        </div>
        <div className="btn-row">
          <label className="switch"><input type="checkbox" checked={cfg.email.enabled} onChange={(e) => save({ email: { ...cfg.email, enabled: e.target.checked } })} /><span>Aktif</span></label>
          <label className="switch"><input type="checkbox" checked={cfg.email.pollInbox} onChange={(e) => save({ email: { ...cfg.email, pollInbox: e.target.checked } })} /><span>Baca balasan (IMAP)</span></label>
          <button className="btn btn-sm" disabled={!cfg.email.user || !cfg.email.password} onClick={() => tryIt("Kirim email uji", () => api.mailSend(mailCfg(cfg), testTo.includes("@") ? testTo : cfg.email.user, "[Ruangku] Email uji", "Email dari bot Ruangku berhasil dikirim."))}>Kirim email uji</button>
        </div>
      </section>

      <section className="tm-card">
        <h2><MessageCircle size={16} /> WhatsApp Cloud API (resmi)</h2>
        <p className="muted small">Butuh akun Meta Business dan nomor khusus bot (bukan nomor WhatsApp pribadi yang sedang dipakai). Pesan pertama ke anggota yang belum membalas dalam 24 jam wajib memakai <b>template</b> yang disetujui Meta. Pesan masuk lewat webhook di server tim.</p>
        <div className="form-row">
          <Field label="Cara kirim">
            <select value={cfg.wa.mode} onChange={(e) => save({ wa: { ...cfg.wa, mode: e.target.value as "langsung" | "server" } })}>
              <option value="langsung">Langsung dari aplikasi (token di komputer ini)</option>
              <option value="server">Lewat server tim (token di server)</option>
            </select>
          </Field>
          <Field label="Versi Graph API"><input value={cfg.wa.graph} onChange={(e) => save({ wa: { ...cfg.wa, graph: e.target.value.trim() } })} /></Field>
        </div>
        {cfg.wa.mode === "langsung" && (
          <div className="form-row">
            <Field label="Phone Number ID"><input value={cfg.wa.phoneId} onChange={(e) => save({ wa: { ...cfg.wa, phoneId: e.target.value.trim() } })} /></Field>
            <Field label="Access token"><input type="password" value={cfg.wa.token} onChange={(e) => save({ wa: { ...cfg.wa, token: e.target.value.trim() } })} autoComplete="off" /></Field>
          </div>
        )}
        <div className="form-row">
          <Field label="Template penugasan" hint="Template dengan 3 variabel: {{1}} judul, {{2}} tenggat, {{3}} kode. Kosongkan untuk teks biasa."><input value={cfg.wa.template} onChange={(e) => save({ wa: { ...cfg.wa, template: e.target.value.trim() } })} placeholder="tugas_baru" /></Field>
          <Field label="Bahasa template"><input value={cfg.wa.templateLang} onChange={(e) => save({ wa: { ...cfg.wa, templateLang: e.target.value.trim() } })} /></Field>
        </div>
        {team && <p className="small tm-hook">URL webhook untuk Meta: <code>{team.serverUrl}/api/ruangku/wa/webhook</code></p>}
        <div className="btn-row">
          <label className="switch"><input type="checkbox" checked={cfg.wa.enabled} onChange={(e) => save({ wa: { ...cfg.wa, enabled: e.target.checked } })} /><span>Aktif</span></label>
          <label className="switch"><input type="checkbox" checked={cfg.wa.pollInbox} disabled={!team} onChange={(e) => save({ wa: { ...cfg.wa, pollInbox: e.target.checked } })} /><span>Proses pesan masuk {team ? "" : "(butuh server tim)"}</span></label>
          <button className="btn btn-sm" disabled={!testTo || testTo.includes("@")} onClick={() => tryIt("Kirim WhatsApp uji", () => sendWa(cfg, testTo, "Halo dari Ruangku 👋"))}>Kirim WA uji</button>
        </div>
      </section>

      <section className="tm-card">
        <h2><Sunrise size={16} /> Rangkuman pagi</h2>
        <p className="muted small">Setiap pagi Ruangku mengirim agenda, tugas jatuh tempo/terlambat, waktu sholat, dan hari libur ke penerima lewat kanal notifikasinya (Telegram, WhatsApp, atau email). Untuk Anda sendiri tanpa kanal, rangkuman muncul sebagai notifikasi desktop.</p>
        <div className="btn-row">
          <label className="switch"><input type="checkbox" checked={cfg.digest.enabled} onChange={(e) => save({ digest: { ...cfg.digest, enabled: e.target.checked } })} /><span>Aktif</span></label>
          <label className="inline-field">Jam kirim <input type="time" value={cfg.digest.time} onChange={(e) => save({ digest: { ...cfg.digest, time: e.target.value || "06:30" } })} style={{ width: 110 }} /></label>
        </div>
        <div className="tm-digest-to">
          <span className="field-label">Penerima</span>
          <div className="chips">
            {members.items.map((m) => {
              const on = cfg.digest.members.length ? cfg.digest.members.includes(m.id) : !!m.isMe;
              return (
                <button
                  key={m.id}
                  className={`chip ${on ? "active" : ""}`}
                  onClick={() => {
                    const cur = cfg.digest.members.length ? cfg.digest.members : members.items.filter((x) => x.isMe).map((x) => x.id);
                    save({ digest: { ...cfg.digest, members: on ? cur.filter((x) => x !== m.id) : [...cur, m.id] } });
                  }}
                >
                  {m.name}
                </button>
              );
            })}
          </div>
        </div>
        <div className="btn-row">
          <button className="btn btn-sm" onClick={() => tryIt("Kirim rangkuman sekarang", async () => { const r = await runDigest(cfg, true); toast(r.join(" · ") || "Tidak ada penerima"); })}>Kirim contoh sekarang</button>
          <button className="btn btn-sm" onClick={async () => { const me = members.items.find((m) => m.isMe); if (me) setPreview(await digestFor(me)); }}>Pratinjau</button>
        </div>
        {preview && <pre className="tm-digest-preview">{preview}</pre>}
      </section>

      <section className="tm-card">
        <Field label="Tujuan uji coba" hint="Nomor WA, chat ID Telegram, atau email untuk tombol uji di atas."><input value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="0812… / 123456789 / nama@email.com" /></Field>
      </section>

      <section className="tm-card">
        <h2>Aktivitas bot</h2>
        {log.length === 0 ? (
          <p className="muted small">Belum ada aktivitas.</p>
        ) : (
          <ul className="tm-log">
            {log.slice(0, 40).map((l, i) => (
              <li key={i} className={l.dir}>
                <span className="tm-log-at">{new Date(l.at).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}</span>
                <span className="tm-log-ch">{l.dir === "in" ? "⬇" : l.dir === "out" ? "⬆" : "⚠"} {l.channel}</span>
                <b>{l.who}</b>
                <span className="tm-log-text">{l.text}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
