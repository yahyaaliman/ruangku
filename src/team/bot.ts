import { memberCanAccess } from "./projectAccess";
import { syncTeam } from "./teamSync";
async function refreshProjectPermissions() {
  const members = await load<Member>("member");
  if (!members.some(m => m.workspaceId)) return;
  const team = await loadTeam();
  if (!team) throw new Error("Hubungkan server tim sebelum bot mengakses data ruang kerja.");
  await syncTeam(team); // Fail closed when the server is unavailable.
}
// Bot Ruangku: Telegram, email (Gmail), dan WhatsApp Cloud API.
// Berjalan di jendela utama pada satu perangkat "bot host". Tugas:
//  - kirim pesan penugasan dari antrean (outbox) ke kanal anggota,
//  - terima perintah/pesan dari anggota dan jalankan sesuai peran mereka.
import { api, errorText, httpJson, MailCfg, onEvent } from "../lib/api";
import type { Item, Note, TimeBlock } from "../lib/types";
import { addDays, dateKey } from "../lib/date";
import { fmtMin } from "../lib/timeblocks";
import { isTaskDone, Task } from "../lib/tasks";
import { projectPath } from "../lib/projects";
import { parseQuick } from "../lib/quickParse";
import { can, Channel, findMember, Member, normalizePhone } from "../lib/team";
import { createTask, findByCode, load, projectsAll, shortCode, strip, updateTask } from "../lib/taskOps";
import { codeFromSubject, HELP_TEXT, parseCommand } from "./commands";
import { mentionMessage, type Comment, type OutboxRec } from "../lib/comments";
import { inviteText, MEETING_KIND, meetingsListText, meetingWhen, summaryText, type Meeting } from "../lib/meetings";
import { COURSE_KIND, type Course } from "../lib/courses";
import { ACCOUNT_KIND, BUDGET_KIND, dueRecurring, financeSummaryText, LEDGER_KIND, parseMoneyText, RECURRING_KIND, type Account, type Budget, type Recurring } from "../lib/finance";
import type { LedgerEntry } from "../lib/ledger";
import { buildDigest, DEFAULT_DIGEST, digestDue, type DigestConfig } from "./digest";
import { eventsInRange } from "../lib/calendar";
import { builtinHolidays } from "../lib/holidays";
import { readCache, type CalSub } from "../calendar/sources";
import { loadGuard, prayerBands } from "../lib/prayerGuard";
import { IBADAH_CONFIG_ID, normalizeConfig } from "../lib/ibadah";
import { hijriLabel, timesForDate } from "../lib/prayer";
import { dataOf, type Reminder } from "../lib/types";
import { parseDateKey } from "../lib/date";
import { aiReady, loadAiConfig } from "../ai/config";
import { runAgent } from "../ai/agent";
import type { Msg } from "../ai/llm";
import { loadTeam, Pb, q } from "./pb";
import { newId } from "../lib/api";
import { useEffect, useState } from "react";
import { loadSecure, saveSecure } from "../lib/secrets";

export interface BotConfig {
  /** Perangkat ini menjalankan bot */
  enabled: boolean;
  telegram: { enabled: boolean; token: string; username?: string; apiBase: string };
  email: { enabled: boolean; user: string; password: string; fromName: string; security: "ssl" | "starttls" | "none"; smtpHost: string; smtpPort: number; imapHost: string; imapPort: number; pollInbox: boolean };
  wa: { enabled: boolean; mode: "langsung" | "server"; phoneId: string; token: string; graph: string; template: string; templateLang: string; pollInbox: boolean };
  /** Rangkuman pagi otomatis */
  digest: DigestConfig;
}

export const DEFAULT_BOT: BotConfig = {
  enabled: false,
  telegram: { enabled: false, token: "", apiBase: "https://api.telegram.org" },
  email: { enabled: false, user: "", password: "", fromName: "Ruangku", security: "ssl", smtpHost: "smtp.gmail.com", smtpPort: 465, imapHost: "imap.gmail.com", imapPort: 993, pollInbox: true },
  wa: { enabled: false, mode: "langsung", phoneId: "", token: "", graph: "v23.0", template: "", templateLang: "id", pollInbox: true },
  digest: DEFAULT_DIGEST,
};

const KEY = "bot_config";
const SECRET_PATHS = ["telegram.token", "email.password", "wa.token"];
export async function loadBot(): Promise<BotConfig> {
  try {
    const v = await api.getSetting(KEY);
    const p = v ? JSON.parse(v) : {};
    return await loadSecure(KEY, { ...DEFAULT_BOT, ...p, telegram: { ...DEFAULT_BOT.telegram, ...p.telegram }, email: { ...DEFAULT_BOT.email, ...p.email }, wa: { ...DEFAULT_BOT.wa, ...p.wa }, digest: { ...DEFAULT_DIGEST, ...p.digest } }, SECRET_PATHS);
  } catch {
    return DEFAULT_BOT;
  }
}
export const saveBot = (c: BotConfig) => saveSecure(KEY, c, SECRET_PATHS);
export function useBotConfig() {
  const [cfg, setCfg] = useState<BotConfig>(DEFAULT_BOT);
  useEffect(() => {
    const l = () => loadBot().then(setCfg);
    l();
    return onEvent<string>("setting-changed", (k) => k === KEY && l());
  }, []);
  const save = async (patch: Partial<BotConfig>) => {
    const n = { ...cfg, ...patch };
    setCfg(n);
    await saveBot(n);
  };
  return { cfg, save };
}

// ---------- Log aktivitas bot (lokal) ----------
export interface BotLog {
  at: number;
  dir: "in" | "out" | "err";
  channel: Channel | "sistem";
  who: string;
  text: string;
}
const LOG_KEY = "ruangku-bot-log";
export function botLog(e: Omit<BotLog, "at">) {
  try {
    const list: BotLog[] = JSON.parse(localStorage.getItem(LOG_KEY) ?? "[]");
    list.unshift({ ...e, at: Date.now(), text: e.text.slice(0, 400) });
    localStorage.setItem(LOG_KEY, JSON.stringify(list.slice(0, 150)));
    window.dispatchEvent(new Event("ruangku-bot-log"));
  } catch {
    /* abaikan */
  }
}
export function readBotLog(): BotLog[] {
  try {
    return JSON.parse(localStorage.getItem(LOG_KEY) ?? "[]");
  } catch {
    return [];
  }
}

// ---------- Kirim ke kanal ----------

const plain = (s: string) => s.replace(/\*(.+?)\*/g, "$1");

export async function sendTelegram(cfg: BotConfig, chatId: number, text: string) {
  await httpJson("POST", `${cfg.telegram.apiBase}/bot${cfg.telegram.token}/sendMessage`, { chat_id: chatId, text: plain(text), disable_web_page_preview: true });
}

export async function sendEmail(cfg: BotConfig, to: string, subject: string, body: string) {
  await api.mailSend(mailCfg(cfg), to, subject, plain(body));
}
export const mailCfg = (cfg: BotConfig): MailCfg => ({ user: cfg.email.user, password: cfg.email.password.replace(/\s+/g, ""), fromName: cfg.email.fromName, security: cfg.email.security, smtpHost: cfg.email.smtpHost, smtpPort: cfg.email.smtpPort, imapHost: cfg.email.imapHost, imapPort: cfg.email.imapPort });

/** WhatsApp: teks biasa, atau template (wajib untuk pesan pertama di luar jendela 24 jam). */
export async function sendWa(cfg: BotConfig, to: string, body: string, template?: { params: string[] }) {
  const message =
    template && cfg.wa.template
      ? { messaging_product: "whatsapp", to: normalizePhone(to), type: "template", template: { name: cfg.wa.template, language: { code: cfg.wa.templateLang || "id" }, components: [{ type: "body", parameters: template.params.map((t) => ({ type: "text", text: t.slice(0, 900) })) }] } }
      : { messaging_product: "whatsapp", recipient_type: "individual", to: normalizePhone(to), type: "text", text: { preview_url: false, body } };
  if (cfg.wa.mode === "server") {
    const team = await loadTeam();
    if (!team) throw new Error("Mode server butuh koneksi server tim.");
    const ws = (await load<{ remoteId: string }>("workspace"))[0];
    if (!ws) throw new Error("Belum ada ruang kerja tim.");
    await new Pb(team.serverUrl, team.token).req("POST", "/api/ruangku/wa/send", { workspace: ws.remoteId, message });
    return;
  }
  await httpJson("POST", `https://graph.facebook.com/${cfg.wa.graph || "v23.0"}/${cfg.wa.phoneId}/messages`, message, { authorization: `Bearer ${cfg.wa.token}` });
}

// ---------- Pesan penugasan ----------

export function assignMessage(t: Item<Task>, projectName: string, by?: string) {
  const code = shortCode(t.id);
  const due = t.due ? `${t.due}${t.dueTime !== undefined ? ` ${fmtMin(t.dueTime)}` : ""}` : "tanpa tenggat";
  return {
    code,
    subject: `[Ruangku #${code}] Tugas baru: ${t.title}`,
    text: [`📌 *Tugas baru untuk Anda*${by ? ` dari ${by}` : ""}`, `*${t.title}*`, `Proyek: ${projectName || "Inbox"}`, `Tenggat: ${due}`, t.description ? `Catatan: ${t.description.slice(0, 300)}` : "", `Kode: ${code}`, "", `Balas *selesai ${code}* bila sudah beres, *tunda ${code} besok* untuk mengubah tenggat, atau *tugas* untuk melihat semua tugas Anda.`]
      .filter((x) => x !== "")
      .join("\n"),
    params: [t.title, due, code],
  };
}

type OutboxItem = OutboxRec;

/** Pesan rapat untuk peserta: undangan, hasil (notulen), atau pembatalan. */
export function meetingMessage(mt: Item<Meeting>, kind: "undangan" | "hasil" | "batal", members: Item<Member>[], by?: string, notulen?: string) {
  const who = members.map((x) => ({ id: x.id, name: x.name }));
  const text = kind === "hasil" ? summaryText(mt, who, notulen) : kind === "batal" ? `❌ *Rapat dibatalkan: ${mt.title}*\n🕘 ${meetingWhen(mt)}${by ? `\nOleh ${by}` : ""}` : inviteText(mt, who, by);
  const subject = kind === "hasil" ? `Hasil rapat: ${mt.title}` : kind === "batal" ? `Dibatalkan: ${mt.title}` : `Undangan rapat: ${mt.title} (${meetingWhen(mt)})`;
  return { subject, text, params: [mt.title, meetingWhen(mt), mt.location ?? mt.link ?? "-"] };
}

export async function processOutbox(cfg: BotConfig) {
  const box = (await load<OutboxItem>("outbox")).filter((o) => o.status === "pending").sort((a, b) => a.at - b.at).slice(0, 10);
  if (!box.length) return;
  await refreshProjectPermissions();
  const [members, tasks, projects, comments, notes, meetings] = await Promise.all([load<Member>("member"), load<Task>("task"), projectsAll(), load<Comment>("comment"), load<Note>("note"), load<Meeting>(MEETING_KIND)]);
  for (const o of box) {
    const m = members.find((x) => x.id === o.memberId);
    const t = o.taskId ? tasks.find((x) => x.id === o.taskId) : undefined;
    const c = o.commentId ? comments.find((x) => x.id === o.commentId) : undefined;
    const n = o.noteId ? notes.find((x) => x.id === o.noteId) : undefined;
    const mt = o.meetingId ? meetings.find((x) => x.id === o.meetingId) : undefined;
    const done = (status: OutboxItem["status"], extra: Partial<OutboxItem> = {}) => api.save(o.id, "outbox", { ...strip(o), status, ...extra });
    const valid = o.type === "mention" ? !!c && (!!t || !!n) : o.type === "meeting" ? !!mt : !!t;
    const targetProject = t?.projectId || n?.projectId || mt?.projectId || o.projectId;
    if (!m || !valid || m.isMe || !memberCanAccess(m, targetProject, projects)) {
      await done("skipped");
      continue;
    }
    const by = members.find((x) => x.id === o.by)?.name ?? members.find((x) => x.isMe)?.name;
    const msg =
      o.type === "meeting"
        ? meetingMessage(mt!, o.meetingMsg ?? "undangan", members, by, mt!.noteId ? notes.find((x) => x.id === mt!.noteId)?.body : undefined)
        : o.type === "mention"
          ? { ...mentionMessage(c!, t?.title ?? n?.title ?? "", by, t ? shortCode(t.id) : undefined), params: [by ?? "", t?.title ?? n?.title ?? "", c!.body.slice(0, 200)] }
          : assignMessage(t!, projectPath(projects, t!.projectId), by);
    const what = o.type === "meeting" ? `Rapat (${o.meetingMsg ?? "undangan"}): ${mt!.title}` : o.type === "mention" ? `Sebutan di "${t?.title ?? n?.title}"` : `Penugasan: ${t!.title}`;
    const via: Channel[] = m.notifyVia?.length ? m.notifyVia : (["telegram", "wa", "email"] as Channel[]).filter((x) => (x === "telegram" ? m.telegramChatId : x === "wa" ? m.wa : m.email));
    const sent: string[] = [];
    const errs: string[] = [];
    for (const ch of via) {
      try {
        if (ch === "telegram") {
          if (!cfg.telegram.enabled || !cfg.telegram.token) throw new Error("bot Telegram belum aktif");
          if (!m.telegramChatId) throw new Error("Telegram anggota belum ditautkan");
          await sendTelegram(cfg, m.telegramChatId, msg.text);
        } else if (ch === "wa") {
          if (!cfg.wa.enabled) throw new Error("WhatsApp belum aktif");
          if (!m.wa) throw new Error("nomor WA kosong");
          await sendWa(cfg, m.wa, msg.text, cfg.wa.template && o.type === "assign" ? { params: msg.params } : undefined);
        } else {
          if (!cfg.email.enabled || !cfg.email.user) throw new Error("email belum aktif");
          await sendEmail(cfg, m.email, msg.subject, msg.text);
        }
        sent.push(ch);
        botLog({ dir: "out", channel: ch, who: m.name, text: what });
      } catch (e) {
        errs.push(`${ch}: ${errorText(e)}`);
      }
    }
    if (sent.length) await done("sent", { sentVia: sent, lastError: errs.join("; ") || undefined });
    else {
      const tries = o.tries + 1;
      await done(tries >= 5 || !via.length ? "failed" : "pending", { tries, lastError: via.length ? errs.join("; ") : "Anggota tidak punya kanal notifikasi" });
      botLog({ dir: "err", channel: "sistem", who: m.name, text: `Gagal kirim (${what}): ${errs.join("; ") || "tanpa kanal"}` });
    }
  }
}

// ---------- Pesan masuk ----------

export interface Incoming {
  channel: Channel;
  telegramChatId?: number;
  telegramUser?: string;
  phone?: string;
  email?: string;
  name?: string;
  text: string;
  ctxCode?: string;
}

const aiMemory = new Map<string, Msg[]>();

/** Proses satu pesan masuk dan kembalikan balasan (null = tidak perlu balas). */
export async function handleIncoming(inc: Incoming): Promise<string | null> {
  await refreshProjectPermissions();
  const members = await load<Member>("member");
  const cmd = parseCommand(inc.text, inc.ctxCode);
  const who = inc.name || inc.email || inc.phone || inc.telegramUser || String(inc.telegramChatId ?? "?");
  botLog({ dir: "in", channel: inc.channel, who, text: inc.text });

  if (cmd.cmd === "link" && inc.telegramChatId !== undefined) {
    const m = members.find((x) => x.linkCode && x.linkCode.toLowerCase() === cmd.code.toLowerCase());
    if (!m) return "Kode tautan tidak dikenal. Minta admin membuat tautan baru di menu Tim & bot.";
    await api.save(m.id, "member", { ...strip(m), telegramChatId: inc.telegramChatId, telegram: inc.telegramUser ?? m.telegram, linkCode: undefined });
    return `Halo ${m.name}! Telegram Anda sudah terhubung dengan Ruangku sebagai ${m.role}.\n\n${HELP_TEXT}`;
  }
  const member = findMember(members, { telegramChatId: inc.telegramChatId, telegramUser: inc.telegramUser, phone: inc.phone, email: inc.email });
  if (!member) {
    return inc.channel === "telegram"
      ? `Maaf, akun Telegram ini belum terdaftar di Ruangku. Kirim ID ini ke admin: ${inc.telegramChatId}, atau buka tautan undangan dari admin.`
      : "Maaf, nomor/email Anda belum terdaftar di Ruangku. Minta admin menambahkan Anda di menu Tim & bot.";
  }
  const role = member.role;
  const today = dateKey();
  const [allTasks, allProjects] = await Promise.all([load<Task>("task"), projectsAll()]);
  const projects = allProjects.filter(p => memberCanAccess(member, p.id, allProjects));
  const tasks = allTasks.filter(t => memberCanAccess(member, t.projectId, allProjects));
  const mine = tasks.filter((t) => !isTaskDone(t, projects) && !t.parentId && ((t.assignees ?? []).includes(member.id) || (member.isMe && !t.assignees?.length && t.due && t.due <= today)));
  const line = (t: Item<Task>) => `[${shortCode(t.id)}] ${t.title}${t.due ? ` · ${t.due === today ? "hari ini" : t.due < today ? `telat (${t.due})` : t.due}` : ""}${t.projectId !== "inbox" ? ` · ${projectPath(projects, t.projectId).split(" › ").pop()}` : ""}`;

  switch (cmd.cmd) {
    case "bantuan":
    case "link":
      return HELP_TEXT;
    case "tugas":
      return mine.length ? `📋 Tugas Anda (${mine.length}):\n${mine.sort((a, b) => (a.due ?? "9").localeCompare(b.due ?? "9")).slice(0, 15).map(line).join("\n")}\n\nBalas *selesai KODE* untuk menyelesaikan.` : "Tidak ada tugas terbuka untuk Anda. 🎉";
    case "hari_ini":
      return digestFor(member, today);
    case "tambah": {
      if (!can(role, "create")) return `Peran Anda (${role}) tidak boleh menambah tugas.`;
      const p = parseQuick(cmd.text, new Date(), projects.map((x) => x.name));
      const proj = p.project ? projects.find((x) => x.name.toLowerCase().startsWith(p.project!.toLowerCase())) : undefined;
      if (member.workspaceId && !proj) return "Pilih proyek yang diizinkan dengan #nama-proyek.";
      if (!p.title) return "Judul tugas kosong. Contoh: tambah Kirim laporan besok jam 10";
      const t = await createTask({ title: p.title, projectId: proj?.id, due: p.due, dueTime: p.dueTime, tags: p.tags, priority: p.priority, estimate: p.estimate, recurrence: p.recurrence, assignees: [member.id], createdBy: member.id } as Partial<Task> & { title: string }, member.id);
      return `✅ Tugas dibuat [${shortCode(t.id)}] ${t.title}${t.due ? `, tenggat ${t.due}` : ""}${proj ? ` di ${proj.name}` : ""}.`;
    }
    case "selesai":
    case "tunda": {
      const t = findByCode(tasks, cmd.code);
      if (!t) return `Tugas dengan kode ${cmd.code} tidak ditemukan. Ketik *tugas* untuk melihat kode.`;
      const ok = can(role, "update", { own: t.createdBy === member.id, assigned: (t.assignees ?? []).includes(member.id) });
      if (!ok) return `Maaf, peran Anda (${role}) tidak boleh mengubah tugas "${t.title}".`;
      if (cmd.cmd === "selesai") {
        await updateTask(t.id, { status: "selesai" }, member.id);
        notifyOwner(`${member.name} menyelesaikan "${t.title}"`);
        return `👍 "${t.title}" ditandai selesai. Terima kasih!`;
      }
      const due = parseQuick(`x ${cmd.when}`, new Date(), []).due;
      if (!due) return `Tanggal "${cmd.when}" tidak dikenali. Contoh: tunda ${cmd.code} besok / jumat / 5 nov.`;
      await updateTask(t.id, { due }, member.id);
      notifyOwner(`${member.name} menunda "${t.title}" ke ${due}`);
      return `⏩ Tenggat "${t.title}" diubah ke ${due}.`;
    }
    case "rapat":
      return meetingsListText((await load<Meeting>(MEETING_KIND)).filter(m => memberCanAccess(member, m.projectId, allProjects)), member.id, !!member.isMe, today);
    case "kuliah": {
      if (!member.isMe) return "Jadwal kuliah hanya tersedia untuk pemilik Ruangku.";
      const [blocks, courses] = await Promise.all([load<TimeBlock>("timeblock"), load<Course>(COURSE_KIND)]);
      const tomorrow = dateKey(addDays(parseDateKey(today), 1));
      const cls = blocks.filter((b) => b.kind === "kuliah" && (b.date === today || b.date === tomorrow) && b.attendance !== "batal").sort((a, b) => a.date.localeCompare(b.date) || a.start - b.start);
      const projIds = new Set(courses.map((c) => c.projectId).filter(Boolean) as string[]);
      const due = tasks.filter((t) => !isTaskDone(t, projects) && !t.parentId && (projIds.has(t.projectId) || t.tags.includes("kuliah")) && t.due && t.due <= dateKey(addDays(parseDateKey(today), 7))).sort((a, b) => (a.due ?? "").localeCompare(b.due ?? ""));
      return [
        "🎓 *Kuliah*",
        ...(cls.length ? cls.map((b) => `• ${b.date === today ? "Hari ini" : "Besok"} ${fmtMin(b.start)}–${fmtMin(b.end)} ${b.title}${b.location ? ` · ${b.location}` : ""}`) : ["Tidak ada kelas hari ini dan besok."]),
        ...(due.length ? ["", "*Tugas kuliah 7 hari ke depan*", ...due.slice(0, 8).map(line)] : []),
      ].join("\n");
    }
    case "kas": {
      if (!member.isMe) return "Ringkasan keuangan hanya tersedia untuk pemilik Ruangku.";
      const [accounts, entries, recurring, budgets] = await Promise.all([load<Account>(ACCOUNT_KIND), load<LedgerEntry>(LEDGER_KIND), load<Recurring>(RECURRING_KIND), load<Budget>(BUDGET_KIND)]);
      return `${financeSummaryText({ accounts, entries, recurring, budgets, today })}\n\nCatat cepat: *keluar 25rb makan siang* atau *masuk 1,5jt honor*.`;
    }
    case "uang": {
      if (!member.isMe) return "Pencatatan keuangan lewat bot hanya untuk pemilik Ruangku.";
      const p = parseMoneyText(cmd.text, cmd.type);
      if (!p) return `Jumlahnya tidak terbaca. Contoh: ${cmd.type === "keluar" ? "keluar 25rb makan siang" : "masuk 1,5jt honor asisten"}`;
      let prefs: { defaultAccount?: string } = {};
      try {
        prefs = JSON.parse((await api.getSetting("finance_prefs")) ?? "{}");
      } catch {
        /* pakai bawaan */
      }
      const accounts = await load<Account>(ACCOUNT_KIND);
      const acc = accounts.find((a) => a.id === prefs.defaultAccount && !a.archived);
      const id = newId();
      await api.save(id, LEDGER_KIND, { date: today, type: cmd.type, amount: p.amount, category: p.category, description: p.description || undefined, accountId: acc?.id, method: acc?.type === "tunai" ? "tunai" : "transfer" } as LedgerEntry);
      return `${cmd.type === "keluar" ? "💸 Pengeluaran" : "💵 Pemasukan"} Rp${p.amount.toLocaleString("id-ID")} dicatat · ${p.category}${p.description ? ` · ${p.description}` : ""}${acc ? ` · ${acc.name}` : ""}.`;
    }
    case "catat": {
      if (member.workspaceId) return "Buat catatan pada proyek yang diizinkan melalui aplikasi Ruangku.";
      if (!can(role, "create")) return `Peran Anda (${role}) tidak boleh menambah catatan.`;
      const id = newId();
      await api.save(id, "note", { title: cmd.text.slice(0, 60), body: `${cmd.text}\n\n— dari ${member.name} lewat ${inc.channel}`, tags: ["bot"], date: today } as Note);
      return "📝 Catatan tersimpan.";
    }
    case "ai": {
      if (member.workspaceId) { aiMemory.delete(`${inc.channel}:${member.id}`); return "Untuk anggota ruang kerja, gunakan perintah tugas, hari ini, tambah, selesai, tunda, atau rapat. Asisten bebas tersedia melalui aplikasi."; }
      const ai = await loadAiConfig();
      if (!ai.botAi || !aiReady(ai)) return `Perintah tidak dikenal.\n\n${HELP_TEXT}`;
      const key = `${inc.channel}:${member.id}`;
      try {
        const r = await runAgent({ cfg: ai, history: aiMemory.get(key) ?? [], userText: inc.text, ctx: { role, actor: member, autoApply: true, viaBot: true }, channel: inc.channel === "wa" ? "whatsapp" : inc.channel });
        aiMemory.set(key, r.history.slice(-16));
        return r.reply || "Selesai.";
      } catch (e) {
        return `Asisten sedang tidak bisa dihubungi (${errorText(e)}). Coba perintah: tugas, hari ini, tambah, selesai.`;
      }
    }
  }
}

function notifyOwner(text: string) {
  api.notifySend("Ruangku · bot", text).catch(() => {});
}

// ---------- Kanal masuk ----------

async function pollTelegram(cfg: BotConfig, alive: () => boolean) {
  let offset = Number((await api.getSetting("tg_offset")) ?? 0) || 0;
  while (alive()) {
    const c = await loadBot();
    if (!c.enabled || !c.telegram.enabled || !c.telegram.token) return;
    try {
      const r = await httpJson<{ ok: boolean; result: { update_id: number; message?: { chat: { id: number }; from?: { username?: string; first_name?: string }; text?: string } }[] }>(
        "GET",
        `${c.telegram.apiBase}/bot${c.telegram.token}/getUpdates?timeout=25&offset=${offset}&allowed_updates=%5B%22message%22%5D`,
        undefined,
        {},
        35_000,
      );
      for (const u of r.result ?? []) {
        offset = u.update_id + 1;
        await api.setSetting("tg_offset", String(offset));
        const m = u.message;
        if (!m?.text) continue;
        const reply = await handleIncoming({ channel: "telegram", telegramChatId: m.chat.id, telegramUser: m.from?.username, name: m.from?.first_name, text: m.text });
        if (reply) {
          await sendTelegram(c, m.chat.id, reply).catch((e) => botLog({ dir: "err", channel: "telegram", who: String(m.chat.id), text: errorText(e) }));
          botLog({ dir: "out", channel: "telegram", who: m.from?.first_name ?? String(m.chat.id), text: reply });
        }
      }
    } catch (e) {
      botLog({ dir: "err", channel: "telegram", who: "bot", text: errorText(e) });
      await api.sleep(15_000);
    }
  }
  void cfg;
}

async function pollEmail(c: BotConfig) {
  const list = await api.mailFetch(mailCfg(c), "[Ruangku");
  for (const m of list) {
    const reply = await handleIncoming({ channel: "email", email: m.from, text: m.text.split("\n").find((l) => l.trim()) ?? "", ctxCode: codeFromSubject(m.subject) });
    if (reply) {
      const subj = /^re:/i.test(m.subject) ? m.subject : `Re: ${m.subject}`;
      await sendEmail(c, m.from, subj, reply).catch((e) => botLog({ dir: "err", channel: "email", who: m.from, text: errorText(e) }));
      botLog({ dir: "out", channel: "email", who: m.from, text: reply });
    }
  }
}

async function pollWaInbox(c: BotConfig) {
  const team = await loadTeam();
  if (!team) return;
  const pb = new Pb(team.serverUrl, team.token);
  const items = await pb.all<{ id: string; sender: string; sender_name: string; text: string }>("inbox", { filter: `processed = false && channel = ${q("wa")}`, sort: "created" });
  for (const it of items) {
    await pb.update("inbox", it.id, { processed: true });
    const reply = await handleIncoming({ channel: "wa", phone: it.sender, name: it.sender_name, text: it.text });
    if (reply) {
      await sendWa(c, it.sender, reply).catch((e) => botLog({ dir: "err", channel: "wa", who: it.sender, text: errorText(e) }));
      botLog({ dir: "out", channel: "wa", who: it.sender_name || it.sender, text: reply });
    }
  }
}

/** Jalankan semua loop bot selama perangkat ini menjadi bot host. */
// ---------- Rangkuman pagi ----------

/** Susun rangkuman pagi untuk satu anggota pada tanggal tertentu. */
export async function digestFor(member: Item<Member>, date = dateKey()): Promise<string> {
  if (member.workspaceId) { await refreshProjectPermissions(); const fresh = (await load<Member>("member")).find(m => m.id === member.id); if (!fresh) throw new Error("Anggota tidak lagi memiliki akses."); member = fresh; }
  const [tasks, projects, blocks, reminders, ibRows, subs] = await Promise.all([load<Task>("task"), projectsAll(), load<TimeBlock>("timeblock"), load<Reminder>("reminder"), api.list("ibadahconfig"), load<CalSub>("calsub")]);
  const ibRaw = ibRows.find((r) => r.id === IBADAH_CONFIG_ID);
  const ib = normalizeConfig(ibRaw ? dataOf(ibRaw.data) : null);
  const external = [];
  for (const s of subs.filter((x) => x.enabled)) {
    const events = s.source === "builtin" ? builtinHolidays() : ((await readCache(s.id))?.events ?? []);
    external.push({ id: s.id, name: s.name, color: s.color, holiday: s.holiday, events });
  }
  const events = eventsInRange({ blocks: [], tasks: [], reminders: [], projects: projects.filter(p => memberCanAccess(member, p.id, projects)), external: member.workspaceId ? external.filter(e => e.holiday) : external }, date, date, { layers: new Set(["luar", "milestone"] as const), match: () => true });
  const bands = ib.setup ? prayerBands(timesForDate(date, { lat: ib.lat, lng: ib.lng, tz: ib.tz, elevation: ib.elevation }, ib.offsets), parseDateKey(date).getDay(), await loadGuard()) : [];
  const meetings = await load<Meeting>(MEETING_KIND);
  const meetingAttendees = Object.fromEntries(meetings.filter((m) => m.date === date).map((m) => [m.id, m.attendees]));
  const bills = member.isMe ? dueRecurring((await load<Recurring>(RECURRING_KIND)).filter((r) => !r.auto), date).map((d) => ({ title: d.rec.title, amount: d.rec.amount, type: d.rec.type, date: d.date })) : [];
  return buildDigest({ member, date, hijri: ib.setup ? hijriLabel(date, ib.hijriOffset) : undefined, tasks: tasks.filter(t => memberCanAccess(member, t.projectId, projects)), projects, blocks: blocks.filter(b => memberCanAccess(member, b.projectId || tasks.find(t => t.id === b.taskId)?.projectId, projects)), reminders: reminders.filter(r => memberCanAccess(member, r.projectId, projects)), events, bands, meetingAttendees, bills });
}

/** Kirim rangkuman pagi ke penerima (sekali sehari). `force` = kirim sekarang (uji coba). */
export async function runDigest(cfg: BotConfig, force = false): Promise<string[]> {
  const last = await api.getSetting("digest_sent");
  if (!force && !digestDue(cfg.digest, new Date(), last)) return [];
  const today = dateKey();
  if (!force) await api.setSetting("digest_sent", today);
  const members = await load<Member>("member");
  const me = members.find((m) => m.isMe);
  const targets = (cfg.digest.members.length ? cfg.digest.members.map((id) => members.find((m) => m.id === id)) : [me]).filter(Boolean) as Item<Member>[];
  const report: string[] = [];
  for (const m of targets) {
    const text = await digestFor(m, today);
    const via: Channel[] = m.notifyVia?.length ? m.notifyVia : (["telegram", "wa", "email"] as Channel[]).filter((x) => (x === "telegram" ? m.telegramChatId : x === "wa" ? m.wa : m.email && !m.isMe));
    let sent = false;
    for (const ch of via) {
      try {
        if (!cfg.enabled) throw new Error("bot belum aktif di perangkat ini");
        if (ch === "telegram" && cfg.telegram.enabled && m.telegramChatId) await sendTelegram(cfg, m.telegramChatId, text);
        else if (ch === "wa" && cfg.wa.enabled && m.wa) await sendWa(cfg, m.wa, text);
        else if (ch === "email" && cfg.email.enabled && m.email) await sendEmail(cfg, m.email, `Rangkuman pagi Ruangku — ${parseDateKey(today).toLocaleDateString("id-ID", { day: "numeric", month: "long" })}`, text.replace(/\*/g, ""));
        else continue;
        sent = true;
        botLog({ dir: "out", channel: ch, who: m.name, text: "Rangkuman pagi" });
        break;
      } catch (e) {
        botLog({ dir: "err", channel: ch, who: m.name, text: `Rangkuman pagi gagal: ${errorText(e)}` });
      }
    }
    if (!sent && m.isMe) {
      const lines = text.replace(/\*/g, "").split("\n").filter((l) => l.startsWith("•"));
      await api.notifySend("Rangkuman pagi", lines.length ? lines.slice(0, 5).join("\n") : "Tidak ada agenda maupun tugas jatuh tempo hari ini.").catch(() => {});
      sent = true;
    }
    report.push(`${m.name}: ${sent ? "terkirim" : "tidak ada kanal aktif"}`);
  }
  return report;
}

export function startBotHost(): () => void {
  let alive = true;
  const isAlive = () => alive;
  let tgRunning = false;
  (async () => {
    let tick = 0;
    while (alive) {
      const c = await loadBot();
      if (c.enabled) {
        if (c.telegram.enabled && c.telegram.token && !tgRunning) {
          tgRunning = true;
          pollTelegram(c, isAlive).finally(() => (tgRunning = false));
        }
        await processOutbox(c).catch((e) => botLog({ dir: "err", channel: "sistem", who: "antrean", text: errorText(e) }));
        if (c.email.enabled && c.email.pollInbox && c.email.user && tick % 6 === 0) await pollEmail(c).catch((e) => botLog({ dir: "err", channel: "email", who: "IMAP", text: errorText(e) }));
        if (c.wa.enabled && c.wa.pollInbox && tick % 2 === 0) await pollWaInbox(c).catch((e) => botLog({ dir: "err", channel: "wa", who: "inbox", text: errorText(e) }));
      }
      if (tick % 3 === 0) await runDigest(c).catch((e) => botLog({ dir: "err", channel: "sistem", who: "rangkuman", text: errorText(e) }));
      tick++;
      // sleep lewat backend supaya tidak dilambatkan saat jendela tersembunyi
      await api.sleep(10_000);
    }
  })();
  return () => {
    alive = false;
  };
}

/** Kode tautan Telegram untuk satu anggota. */
export const newLinkCode = () => Math.random().toString(36).slice(2, 8);
