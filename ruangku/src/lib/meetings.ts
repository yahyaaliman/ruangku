// Rapat: data, rapat berulang, sinkron dua arah dengan blok jadwal, notulen, dan pesan undangan.
// Waktu rapat selalu juga berupa blok jadwal (kind "rapat") supaya tampil di Kalender, Jadwal
// harian, widget, notifikasi, rangkuman pagi, dan Google Calendar tanpa kode khusus.
import type { BlockColor, Item, TimeBlock } from "./types";
import { addDays, dateKey, parseDateKey } from "./date";
import { fmtMin } from "./timeblocks";

export interface AgendaItem {
  id: string;
  text: string;
  done: boolean;
  /** Perkiraan menit */
  minutes?: number;
}
export interface ActionItem {
  id: string;
  text: string;
  /** Id anggota */
  assignee?: string;
  due?: string;
  /** Tugas yang dibuat dari action item ini */
  taskId?: string;
}
export type MeetingStatus = "terjadwal" | "selesai" | "batal";

export interface Meeting {
  title: string;
  date: string;
  start: number;
  end: number;
  projectId?: string;
  location?: string;
  link?: string;
  /** Peserta (id anggota tim) */
  attendees: string[];
  /** Tamu luar (teks bebas) */
  guests?: string;
  description?: string;
  agenda: AgendaItem[];
  /** Halaman notulen di Catatan */
  noteId?: string;
  decisions?: string;
  actions: ActionItem[];
  status: MeetingStatus;
  /** Bagian dari rapat berulang */
  seriesId?: string;
  /** Kemunculan yang diubah manual (tidak ikut diperbarui dari seri) */
  detached?: boolean;
  color?: BlockColor;
  notify?: number | "off";
  createdAt: number;
}

export type RepeatFreq = "daily" | "weekdays" | "weekly" | "biweekly" | "monthly";
export const FREQ_LABEL: Record<RepeatFreq, string> = { daily: "Setiap hari", weekdays: "Setiap hari kerja", weekly: "Setiap minggu", biweekly: "Dua minggu sekali", monthly: "Setiap bulan" };

export interface MeetingSeries {
  title: string;
  start: number;
  end: number;
  projectId?: string;
  location?: string;
  link?: string;
  attendees: string[];
  guests?: string;
  agenda: AgendaItem[];
  color?: BlockColor;
  freq: RepeatFreq;
  /** Tanggal kemunculan pertama */
  from: string;
  /** Tanggal terakhir (inklusif), kosong = terus */
  until?: string;
  /** Hari dalam minggu (0 = Minggu) untuk mingguan/dua mingguan */
  weekdays?: number[];
  skipHolidays?: boolean;
  active: boolean;
}

export const MEETING_KIND = "meeting";
export const SERIES_KIND = "meetingseries";
export const occurrenceId = (seriesId: string, date: string) => `mt-${seriesId}-${date}`;
export const meetingBlockId = (meetingId: string) => `blk-${meetingId}`;
/** Berapa hari ke depan kemunculan rapat berulang dibuat. */
export const SERIES_HORIZON = 56;

// ---------- Tautan rapat daring ----------
const PLATFORMS: [RegExp, string][] = [
  [/(^|\.)zoom\.us$/i, "Zoom"],
  [/^meet\.google\.com$/i, "Google Meet"],
  [/(^|\.)teams\.(microsoft|live)\.com$/i, "Microsoft Teams"],
  [/(^|\.)webex\.com$/i, "Webex"],
  [/^meet\.jit\.si$/i, "Jitsi"],
  [/(^|\.)whereby\.com$/i, "Whereby"],
  [/(^|\.)discord\.(gg|com)$/i, "Discord"],
];
export function linkPlatform(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const host = new URL(/^https?:/i.test(url) ? url : `https://${url}`).hostname;
    return PLATFORMS.find(([re]) => re.test(host))?.[1] ?? "Tautan";
  } catch {
    return null;
  }
}
export const normalizeLink = (url: string | undefined) => {
  const u = url?.trim();
  if (!u) return undefined;
  return /^[a-z]+:/i.test(u) ? u : `https://${u}`;
};
/** Temukan tautan rapat di teks bebas (mis. undangan yang ditempel). */
export function findMeetingLink(text: string): string | undefined {
  const urls = text.match(/https?:\/\/[^\s<>"')]+/g) ?? [];
  return urls.find((u) => linkPlatform(u) && linkPlatform(u) !== "Tautan") ?? urls[0];
}

// ---------- Rapat berulang ----------
export function seriesDates(s: Pick<MeetingSeries, "freq" | "from" | "until" | "weekdays" | "skipHolidays">, from: string, to: string, holidays: Set<string> = new Set()): string[] {
  const out: string[] = [];
  const first = parseDateKey(s.from);
  const startKey = from > s.from ? from : s.from;
  const endKey = s.until && s.until < to ? s.until : to;
  const wd = s.weekdays?.length ? s.weekdays : [first.getDay()];
  const weekStart = (d: Date) => addDays(d, -((d.getDay() + 6) % 7));
  const w0 = weekStart(first).getTime();
  for (let d = parseDateKey(startKey); dateKey(d) <= endKey; d = addDays(d, 1)) {
    const k = dateKey(d);
    const dow = d.getDay();
    let ok = false;
    if (s.freq === "daily") ok = true;
    else if (s.freq === "weekdays") ok = dow >= 1 && dow <= 5;
    else if (s.freq === "weekly") ok = wd.includes(dow);
    else if (s.freq === "biweekly") ok = wd.includes(dow) && Math.round((weekStart(d).getTime() - w0) / (7 * 86400000)) % 2 === 0;
    else if (s.freq === "monthly") ok = d.getDate() === first.getDate();
    if (ok && s.skipHolidays && holidays.has(k)) ok = false;
    if (ok) out.push(k);
  }
  return out;
}

const pickSeries = (s: MeetingSeries) => ({ title: s.title, start: s.start, end: s.end, projectId: s.projectId, location: s.location, link: s.link, attendees: s.attendees, guests: s.guests, color: s.color });

export interface SeriesPlan {
  create: { id: string; data: Meeting }[];
  update: { id: string; patch: Partial<Meeting> }[];
  remove: string[];
}

/** Kemunculan yang perlu dibuat/diperbarui/dihapus agar rapat berulang terisi sampai `horizon` hari ke depan. */
export function planSeries(seriesId: string, s: MeetingSeries, meetings: Item<Meeting>[], today: string, now = Date.now(), holidays: Set<string> = new Set(), horizon = SERIES_HORIZON): SeriesPlan {
  const plan: SeriesPlan = { create: [], update: [], remove: [] };
  const mine = meetings.filter((m) => m.seriesId === seriesId);
  const byDate = new Map(mine.map((m) => [m.date, m]));
  const want = s.active ? seriesDates(s, today, dateKey(addDays(parseDateKey(today), horizon)), holidays) : [];
  const wantSet = new Set(want);
  for (const d of want) {
    const id = occurrenceId(seriesId, d);
    const ex = byDate.get(d) ?? mine.find((m) => m.id === id);
    if (!ex) {
      plan.create.push({ id, data: { ...pickSeries(s), date: d, agenda: s.agenda.map((a) => ({ ...a, done: false })), actions: [], status: "terjadwal", seriesId, createdAt: now } });
      continue;
    }
    if (ex.detached || ex.status !== "terjadwal") continue;
    const want2 = pickSeries(s);
    const patch: Partial<Meeting> = {};
    for (const k of Object.keys(want2) as (keyof typeof want2)[]) if (JSON.stringify(ex[k] ?? null) !== JSON.stringify(want2[k] ?? null)) (patch as Record<string, unknown>)[k] = want2[k];
    if (Object.keys(patch).length) plan.update.push({ id: ex.id, patch });
  }
  // Kemunculan mendatang yang tidak lagi sesuai jadwal (dan belum dipakai) dihapus.
  for (const m of mine) {
    if (m.date <= today || wantSet.has(m.date) || m.detached || m.status !== "terjadwal") continue;
    if (m.noteId || m.actions.length || m.decisions) continue;
    plan.remove.push(m.id);
  }
  return plan;
}

// ---------- Sinkron rapat ↔ blok jadwal ----------
export function blockFromMeeting(m: Item<Meeting>, prev?: Item<TimeBlock>): TimeBlock {
  return {
    ...(prev ? stripItem(prev) : {}),
    date: m.date,
    start: m.start,
    end: Math.max(m.end, m.start + 5),
    title: m.title || "Rapat",
    color: m.color ?? prev?.color ?? "ungu",
    projectId: m.projectId,
    kind: "rapat",
    meetingId: m.id,
    location: m.location,
    link: m.link,
    notify: m.notify ?? prev?.notify,
    noteId: m.noteId,
    done: m.status === "selesai" ? true : prev?.done,
  };
}

function stripItem<T>(x: Item<T>): T {
  const { id: _i, updatedAt: _u, ...rest } = x as Item<T> & Record<string, unknown>;
  void _i;
  void _u;
  return rest as unknown as T;
}

const SCHED_KEYS = ["date", "start", "end", "title", "location", "link", "projectId"] as const;
const differs = (b: Partial<TimeBlock>, m: Partial<Meeting>) => SCHED_KEYS.some((k) => (b[k] ?? null) !== ((k === "title" ? m.title || "Rapat" : m[k]) ?? null)) || (b.noteId ?? null) !== (m.noteId ?? null);

export interface MeetingSync {
  upsertBlocks: { id: string; data: TimeBlock }[];
  removeBlocks: string[];
  patchMeetings: { id: string; patch: Partial<Meeting> }[];
}

/**
 * Samakan rapat dan bloknya. Yang diubah paling akhir menang (geser blok di Kalender
 * mengubah rapatnya; ubah rapat memindahkan bloknya). Rapat batal tidak punya blok.
 */
export function reconcileMeetings(meetings: Item<Meeting>[], blocks: Item<TimeBlock>[], now = Date.now()): MeetingSync {
  const out: MeetingSync = { upsertBlocks: [], removeBlocks: [], patchMeetings: [] };
  const byMeeting = new Map<string, Item<TimeBlock>>();
  for (const b of blocks) if (b.meetingId) byMeeting.set(b.meetingId, b);
  const ids = new Set(meetings.map((m) => m.id));
  for (const m of meetings) {
    const b = byMeeting.get(m.id);
    if (m.status === "batal") {
      if (b) out.removeBlocks.push(b.id);
      continue;
    }
    if (!b) {
      out.upsertBlocks.push({ id: meetingBlockId(m.id), data: blockFromMeeting(m) });
      continue;
    }
    if (!differs(b, m)) {
      if (m.status === "selesai" && !b.done) out.upsertBlocks.push({ id: b.id, data: { ...stripItem(b), done: true } });
      continue;
    }
    if (b.updatedAt > m.updatedAt) {
      const patch: Partial<Meeting> = { date: b.date, start: b.start, end: b.end, title: b.title, location: b.location, link: b.link, projectId: b.projectId };
      if (m.seriesId && (b.date !== m.date || b.start !== m.start || b.end !== m.end)) patch.detached = true;
      out.patchMeetings.push({ id: m.id, patch });
    } else out.upsertBlocks.push({ id: b.id, data: blockFromMeeting(m, b) });
  }
  // Blok rapat yang rapatnya sudah dihapus (beri jeda agar sinkron sempat tiba).
  for (const b of blocks) if (b.meetingId && !ids.has(b.meetingId) && now - b.updatedAt > 120000) out.removeBlocks.push(b.id);
  return out;
}

// ---------- Teks ----------
const fDate = (d: string) => parseDateKey(d).toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
export const meetingWhen = (m: Pick<Meeting, "date" | "start" | "end">) => `${fDate(m.date)}, ${fmtMin(m.start)}–${fmtMin(m.end)}`;

interface Who {
  id: string;
  name: string;
}
const names = (ids: string[], members: Who[]) => ids.map((id) => members.find((x) => x.id === id)?.name).filter(Boolean) as string[];

/** Isi awal halaman notulen. */
export function notulenMarkdown(m: Meeting, members: Who[]): string {
  const hadir = names(m.attendees, members);
  const lines = [
    `**Waktu:** ${meetingWhen(m)}`,
    m.location || m.link ? `**Tempat:** ${[m.location, m.link ? `[${linkPlatform(m.link) ?? "Tautan"}](${m.link})` : ""].filter(Boolean).join(" · ")}` : "",
    hadir.length ? `**Peserta:** ${hadir.join(", ")}` : "**Peserta:** ",
    m.guests ? `**Tamu:** ${m.guests}` : "",
    "",
    "## Agenda",
    "",
    ...(m.agenda.length ? m.agenda.map((a, i) => `${i + 1}. ${a.text}${a.minutes ? ` (${a.minutes} mnt)` : ""}`) : ["1. "]),
    "",
    "## Pembahasan",
    "",
    "- ",
    "",
    "## Keputusan",
    "",
    "- ",
    "",
    "## Tindak lanjut",
    "",
    ...(m.actions.length ? m.actions.map((a) => `- [ ] ${a.text}${a.assignee ? ` — ${names([a.assignee], members)[0] ?? ""}` : ""}${a.due ? `, tenggat ${a.due}` : ""}`) : ["- [ ] "]),
  ];
  return lines.filter((l, i, arr) => !(l === "" && arr[i - 1] === "")).filter((l) => l !== null).join("\n").replace(/\n{3,}/g, "\n\n");
}

/** Pesan undangan rapat (format chat: *tebal*). */
export function inviteText(m: Meeting, members: Who[], by?: string): string {
  const lines = [
    `📅 *Undangan rapat: ${m.title}*${by ? ` dari ${by}` : ""}`,
    `🕘 ${meetingWhen(m)}`,
    m.location ? `📍 ${m.location}` : "",
    m.link ? `🔗 ${linkPlatform(m.link) ?? "Tautan"}: ${m.link}` : "",
    m.attendees.length ? `👥 ${names(m.attendees, members).join(", ")}` : "",
    m.agenda.length ? `\n*Agenda*\n${m.agenda.map((a, i) => `${i + 1}. ${a.text}`).join("\n")}` : "",
    m.description ? `\n${m.description}` : "",
  ];
  return lines.filter(Boolean).join("\n");
}

/** Ringkasan hasil rapat untuk dikirim ke peserta. */
export function summaryText(m: Meeting, members: Who[], notulen?: string): string {
  const decisions = m.decisions?.trim() || extractSection(notulen ?? "", "Keputusan");
  const lines = [
    `📝 *Hasil rapat: ${m.title}*`,
    `🕘 ${meetingWhen(m)}`,
    decisions ? `\n*Keputusan*\n${decisions}` : "",
    m.actions.length ? `\n*Tindak lanjut*\n${m.actions.map((a) => `• ${a.text}${a.assignee ? ` — ${names([a.assignee], members)[0] ?? "?"}` : ""}${a.due ? ` (tenggat ${parseDateKey(a.due).toLocaleDateString("id-ID", { day: "numeric", month: "short" })})` : ""}`).join("\n")}` : "",
  ];
  return lines.filter(Boolean).join("\n");
}

/** Ambil isi satu bagian "## Judul" dari Markdown notulen. */
export function extractSection(md: string, heading: string): string {
  const re = new RegExp(`^##\\s+${heading}\\s*$`, "im");
  const m = re.exec(md);
  if (!m) return "";
  const rest = md.slice(m.index + m[0].length);
  const next = rest.search(/^##\s+/m);
  return (next >= 0 ? rest.slice(0, next) : rest)
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && l !== "-" && l !== "- [ ]")
    .join("\n");
}

/** Action item dari bagian "Tindak lanjut" notulen: "- [ ] teks — Nama, tenggat 2026-11-02". */
export function actionsFromNotulen(md: string, members: Who[]): Omit<ActionItem, "id">[] {
  const sec = extractSection(md, "Tindak lanjut");
  const out: Omit<ActionItem, "id">[] = [];
  for (const line of sec.split("\n")) {
    const m = /^[-*]\s*(?:\[[ xX]\]\s*)?(.+)$/.exec(line);
    if (!m) continue;
    let text = m[1].trim();
    let due: string | undefined;
    const d = /,?\s*tenggat\s+(\d{4}-\d{2}-\d{2})\s*$/i.exec(text);
    if (d) (due = d[1]), (text = text.slice(0, d.index).trim());
    let assignee: string | undefined;
    const a = /\s+[—–-]\s+@?([^—–-]+)$/.exec(text);
    if (a) {
      const who = members.find((x) => x.name.toLowerCase() === a[1].trim().toLowerCase() || x.name.toLowerCase().split(" ")[0] === a[1].trim().toLowerCase());
      if (who) (assignee = who.id), (text = text.slice(0, a.index).trim());
    }
    if (text) out.push({ text, assignee, due });
  }
  return out;
}

/** Rapat berikutnya (belum selesai/batal) dari sekarang. */
export function nextMeetings(meetings: Item<Meeting>[], now = new Date(), limit = 5): Item<Meeting>[] {
  const today = dateKey(now);
  const min = now.getHours() * 60 + now.getMinutes();
  return meetings
    .filter((m) => m.status === "terjadwal" && (m.date > today || (m.date === today && m.end > min)))
    .sort((a, b) => a.date.localeCompare(b.date) || a.start - b.start)
    .slice(0, limit);
}

/** Daftar rapat seorang anggota beberapa hari ke depan (untuk bot & asisten). */
export function meetingsListText(meetings: Item<Meeting>[], memberId: string | undefined, isMe: boolean, today: string, days = 7): string {
  const last = dateKey(addDays(parseDateKey(today), days));
  const list = meetings
    .filter((m) => m.status === "terjadwal" && m.date >= today && m.date <= last && (isMe || (memberId ? m.attendees.includes(memberId) : false)))
    .sort((a, b) => a.date.localeCompare(b.date) || a.start - b.start);
  if (!list.length) return `Tidak ada rapat ${days} hari ke depan.`;
  return [
    `🤝 *Rapat ${days} hari ke depan* (${list.length})`,
    ...list.slice(0, 12).map((m) => `• ${m.date === today ? "Hari ini" : parseDateKey(m.date).toLocaleDateString("id-ID", { weekday: "short", day: "numeric", month: "short" })} ${fmtMin(m.start)}–${fmtMin(m.end)} *${m.title}*${m.location ? ` · ${m.location}` : ""}${m.link ? `\n  🔗 ${m.link}` : ""}`),
  ].join("\n");
}
