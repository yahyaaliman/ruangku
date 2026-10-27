// Google Calendar: login OAuth (loopback + PKCE), baca kalender pilihan, dan
// sinkron dua arah blok jadwal Ruangku <-> satu kalender tujuan.
//
// Setiap blok dikirim dengan id acara yang tetap ("rk" + hex id blok), sehingga
// beberapa perangkat tidak membuat acara ganda. Perubahan di Google (geser jam,
// ganti judul, hapus) dibawa kembali ke blok bila lebih baru.
import type { HttpReq, HttpRes } from "../lib/api";
import type { BlockColor, Item, TimeBlock } from "../lib/types";
import { addDays, dateKey, parseDateKey } from "../lib/date";
import type { IcsEvent } from "../lib/ics";

export interface GcalConfig {
  clientId: string;
  email?: string;
  connected: boolean;
  /** Kalender Google tujuan blok Ruangku; kosong = tidak mengirim */
  targetId?: string;
  targetName?: string;
  lastSync?: number;
  lastError?: string;
  /** Bisa diganti untuk pengujian (server tiruan) */
  authBase?: string;
  tokenUrl?: string;
  apiBase?: string;
}

export const GCAL_KEY = "gcal_config";
export const GCAL_STATE_KEY = "gcal_state";
export const SECRET_REFRESH = "gcal_refresh_token";
export const SECRET_CLIENT = "gcal_client_secret";

export const DEFAULTS = {
  authBase: "https://accounts.google.com/o/oauth2/v2/auth",
  tokenUrl: "https://oauth2.googleapis.com/token",
  apiBase: "https://www.googleapis.com/calendar/v3",
};
export const SCOPES = ["openid", "email", "https://www.googleapis.com/auth/calendar.calendarlist.readonly", "https://www.googleapis.com/auth/calendar.events"];

export type Http = (req: HttpReq) => Promise<HttpRes>;
export interface Secrets {
  get: (k: string) => Promise<string | null>;
  set: (k: string, v: string) => Promise<unknown>;
}

// ---------- util ----------

const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

export function randomString(n = 64): string {
  const a = new Uint8Array(n);
  crypto.getRandomValues(a);
  return b64url(a).slice(0, n);
}

export async function pkceChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return b64url(new Uint8Array(digest));
}

const form = (o: Record<string, string>) =>
  Object.entries(o)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");

/** Id acara Google dari id blok: hanya [0-9a-f], diawali "rk". */
export const eventIdOf = (blockId: string) => "rk" + Array.from(new TextEncoder().encode(blockId), (b) => b.toString(16).padStart(2, "0")).join("");
export function blockIdOf(eventId: string): string | null {
  if (!/^rk([0-9a-f]{2})+$/.test(eventId)) return null;
  const hex = eventId.slice(2).match(/../g)!;
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(new Uint8Array(hex.map((h) => parseInt(h, 16))));
  } catch {
    return null;
  }
}

const pad = (n: number) => String(n).padStart(2, "0");
/** "2026-10-26" + 570 menit → "2026-10-26T09:30:00+07:00" (zona lokal). */
export function isoLocal(date: string, minutes: number): string {
  const d = parseDateKey(date);
  d.setMinutes(minutes);
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? "+" : "-";
  return `${dateKey(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}:00${sign}${pad(Math.floor(Math.abs(off) / 60))}:${pad(Math.abs(off) % 60)}`;
}

const localTz = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return undefined;
  }
};

// Warna acara Google (colorId) terdekat untuk tiap warna blok.
const COLOR_ID: Record<BlockColor, string> = { nila: "9", laut: "7", daun: "10", kunyit: "5", kopi: "6", bata: "11", jambu: "4", ungu: "3", abu: "8" };

interface GEvent {
  id: string;
  status?: string;
  summary?: string;
  description?: string;
  location?: string;
  updated?: string;
  start?: { date?: string; dateTime?: string };
  end?: { date?: string; dateTime?: string };
  extendedProperties?: { private?: Record<string, string> };
}

export interface Slot {
  date: string;
  start: number;
  end: number;
  title: string;
}

export const slotHash = (s: Slot) => `${s.date}|${s.start}|${s.end}|${s.title}`;

/** Acara Google berjam → slot blok (tanggal & menit lokal). Null bila sepanjang hari. */
export function slotOf(ev: GEvent): Slot | null {
  if (!ev.start?.dateTime || !ev.end?.dateTime) return null;
  const s = new Date(ev.start.dateTime);
  const e = new Date(ev.end.dateTime);
  const date = dateKey(s);
  const start = s.getHours() * 60 + s.getMinutes();
  const end = dateKey(e) === date ? e.getHours() * 60 + e.getMinutes() : 1440;
  return { date, start, end: Math.max(start + 15, end), title: ev.summary ?? "" };
}

export function toIcsEvent(ev: GEvent): IcsEvent | null {
  if (!ev.start) return null;
  if (ev.start.date) {
    const last = ev.end?.date ? dateKey(addDays(parseDateKey(ev.end.date), -1)) : ev.start.date;
    return { uid: ev.id, title: ev.summary ?? "(tanpa judul)", date: ev.start.date, endDate: last > ev.start.date ? last : undefined, allDay: true, location: ev.location, description: ev.description?.slice(0, 2000) };
  }
  const sl = slotOf(ev);
  if (!sl) return null;
  return { uid: ev.id, title: sl.title || "(tanpa judul)", date: sl.date, start: sl.start, end: sl.end, allDay: false, location: ev.location, description: ev.description?.slice(0, 2000) };
}

function blockBody(b: Item<TimeBlock>) {
  const end = b.end >= 1440 ? isoLocal(dateKey(addDays(parseDateKey(b.date), 1)), 0) : isoLocal(b.date, b.end);
  const tz = localTz();
  const slot: Slot = { date: b.date, start: b.start, end: b.end, title: b.title };
  return {
    summary: b.title,
    description: [b.link ? `Gabung: ${b.link}` : "", b.note, b.kind === "rapat" ? "Rapat dari Ruangku." : b.kind === "kuliah" ? "Kelas dari Ruangku." : "", "Dibuat di Ruangku. Perubahan jam/judul di sini ikut kembali ke Ruangku."].filter(Boolean).join("\n\n"),
    ...(b.location || b.link ? { location: b.location ?? b.link } : {}),
    start: { dateTime: isoLocal(b.date, b.start), ...(tz ? { timeZone: tz } : {}) },
    end: { dateTime: end, ...(tz ? { timeZone: tz } : {}) },
    colorId: COLOR_ID[b.color ?? "nila"],
    status: "confirmed",
    extendedProperties: { private: { ruangku: "1", rkHash: slotHash(slot) } },
  };
}

// ---------- klien ----------

export class GcalClient {
  private access: { token: string; exp: number } | null = null;
  constructor(
    private cfg: GcalConfig,
    private http: Http,
    private secrets: Secrets,
  ) {}

  private get api() {
    return this.cfg.apiBase ?? DEFAULTS.apiBase;
  }

  async token(force = false): Promise<string> {
    if (!force && this.access && this.access.exp > Date.now() + 60000) return this.access.token;
    const refresh = await this.secrets.get(SECRET_REFRESH);
    if (!refresh) throw new Error("Google Calendar belum terhubung.");
    const res = await this.http({
      method: "POST",
      url: this.cfg.tokenUrl ?? DEFAULTS.tokenUrl,
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: form({ client_id: this.cfg.clientId, client_secret: (await this.secrets.get(SECRET_CLIENT)) ?? "", refresh_token: refresh, grant_type: "refresh_token" }),
    });
    const j = JSON.parse(res.body || "{}");
    if (res.status !== 200 || !j.access_token) throw new Error(j.error === "invalid_grant" ? "Izin Google dicabut atau kedaluwarsa. Hubungkan ulang." : `Gagal memperbarui token Google (${j.error ?? res.status}).`);
    this.access = { token: j.access_token, exp: Date.now() + (j.expires_in ?? 3600) * 1000 };
    return j.access_token;
  }

  async req<T = any>(method: string, path: string, body?: unknown, retry = true): Promise<{ status: number; data: T }> {
    const res = await this.http({
      method,
      url: path.startsWith("http") ? path : this.api + path,
      headers: { authorization: `Bearer ${await this.token()}`, "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      timeoutMs: 30000,
    });
    if (res.status === 401 && retry) {
      await this.token(true);
      return this.req(method, path, body, false);
    }
    let data: any = null;
    try {
      data = res.body ? JSON.parse(res.body) : null;
    } catch {
      data = res.body;
    }
    return { status: res.status, data };
  }

  async calendars(): Promise<{ id: string; summary: string; primary?: boolean; accessRole: string; backgroundColor?: string }[]> {
    const r = await this.req("GET", "/users/me/calendarList?maxResults=250");
    if (r.status !== 200) throw new Error(`Daftar kalender gagal dimuat (HTTP ${r.status}).`);
    return r.data.items ?? [];
  }

  async events(calId: string, from: string, to: string, showDeleted = false): Promise<GEvent[]> {
    const out: GEvent[] = [];
    let page: string | undefined;
    for (let i = 0; i < 20; i++) {
      const q = new URLSearchParams({ singleEvents: "true", maxResults: "2500", timeMin: `${from}T00:00:00Z`, timeMax: `${to}T23:59:59Z`, showDeleted: String(showDeleted) });
      if (page) q.set("pageToken", page);
      const r = await this.req("GET", `/calendars/${encodeURIComponent(calId)}/events?${q}`);
      if (r.status !== 200) throw new Error(`Acara kalender gagal dimuat (HTTP ${r.status}).`);
      out.push(...(r.data.items ?? []));
      page = r.data.nextPageToken;
      if (!page) break;
    }
    return out;
  }

  /** Buat atau perbarui acara dengan id tetap. */
  async put(calId: string, eventId: string, body: object): Promise<void> {
    const path = `/calendars/${encodeURIComponent(calId)}/events/${eventId}`;
    const u = await this.req("PUT", path, body);
    if (u.status === 200) return;
    if (u.status === 404) {
      const c = await this.req("POST", `/calendars/${encodeURIComponent(calId)}/events`, { id: eventId, ...body });
      if (c.status === 200 || c.status === 201) return;
      throw new Error(`Gagal membuat acara (HTTP ${c.status}).`);
    }
    throw new Error(`Gagal memperbarui acara (HTTP ${u.status}).`);
  }

  async remove(calId: string, eventId: string): Promise<void> {
    const r = await this.req("DELETE", `/calendars/${encodeURIComponent(calId)}/events/${eventId}`);
    if (![200, 204, 404, 410].includes(r.status)) throw new Error(`Gagal menghapus acara (HTTP ${r.status}).`);
  }
}

// ---------- login ----------

export interface LoginDeps {
  http: Http;
  secrets: Secrets;
  loopback: (url: string) => Promise<{ code?: string | null; state?: string | null; error?: string | null; redirectUri: string }>;
}

export async function connectGoogle(cfg: GcalConfig, clientSecret: string, deps: LoginDeps): Promise<GcalConfig> {
  const verifier = randomString(64);
  const state = randomString(16);
  const params = new URLSearchParams({
    client_id: cfg.clientId,
    response_type: "code",
    scope: SCOPES.join(" "),
    code_challenge: await pkceChallenge(verifier),
    code_challenge_method: "S256",
    access_type: "offline",
    prompt: "consent",
    state,
  });
  const r = await deps.loopback(`${cfg.authBase ?? DEFAULTS.authBase}?${params}`);
  if (r.error) throw new Error(r.error === "access_denied" ? "Login dibatalkan." : `Google menolak login: ${r.error}`);
  if (!r.code || r.state !== state) throw new Error("Respons login tidak valid. Coba lagi.");
  const res = await deps.http({
    method: "POST",
    url: cfg.tokenUrl ?? DEFAULTS.tokenUrl,
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: form({ code: r.code, client_id: cfg.clientId, client_secret: clientSecret, redirect_uri: r.redirectUri, grant_type: "authorization_code", code_verifier: verifier }),
  });
  const j = JSON.parse(res.body || "{}");
  if (res.status !== 200 || !j.refresh_token) throw new Error(`Token Google tidak diterima (${j.error_description ?? j.error ?? res.status}).`);
  await deps.secrets.set(SECRET_REFRESH, j.refresh_token);
  await deps.secrets.set(SECRET_CLIENT, clientSecret);
  let email: string | undefined;
  try {
    email = JSON.parse(atob(String(j.id_token).split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))).email;
  } catch {
    /* tanpa email */
  }
  return { ...cfg, connected: true, email, lastError: undefined };
}

// ---------- sinkron ----------

export interface SyncState {
  /** blockId → hash slot terakhir yang sama di kedua sisi */
  pushed: Record<string, string>;
}

export interface SyncDeps {
  client: GcalClient;
  blocks: Item<TimeBlock>[];
  saveBlock: (b: Item<TimeBlock>) => Promise<unknown>;
  removeBlock: (id: string) => Promise<unknown>;
  /** Kalender Google yang ditampilkan (id sub → id kalender) */
  shown: { subId: string; calId: string }[];
  writeCache: (subId: string, events: IcsEvent[]) => Promise<void>;
  today?: string;
}

export interface SyncResult {
  pulled: number;
  pushed: number;
  updatedLocal: number;
  removedLocal: number;
  removedRemote: number;
}

export async function syncGoogle(cfg: GcalConfig, state: SyncState, d: SyncDeps): Promise<SyncResult> {
  const today = d.today ?? dateKey();
  const from = dateKey(addDays(parseDateKey(today), -60));
  const to = dateKey(addDays(parseDateKey(today), 400));
  const res: SyncResult = { pulled: 0, pushed: 0, updatedLocal: 0, removedLocal: 0, removedRemote: 0 };

  // 1) Kalender yang ditampilkan (acara Ruangku sendiri tidak ikut, karena bloknya sudah tampil).
  for (const s of d.shown) {
    const evs = await d.client.events(s.calId, from, to);
    const mapped = evs.filter((e) => e.status !== "cancelled" && !blockIdOf(e.id)).map(toIcsEvent).filter(Boolean) as IcsEvent[];
    res.pulled += mapped.length;
    await d.writeCache(s.subId, mapped);
  }

  // 2) Dua arah dengan kalender tujuan.
  const target = cfg.targetId;
  if (!target) return res;
  const pushFrom = dateKey(addDays(parseDateKey(today), -14));
  const pushTo = dateKey(addDays(parseDateKey(today), 365));
  const blocks = new Map(d.blocks.filter((b) => !b.tracked).map((b) => [b.id, b]));
  const remote = (await d.client.events(target, pushFrom, pushTo, true)).filter((e) => blockIdOf(e.id));
  const seen = new Set<string>();

  for (const ev of remote) {
    const id = blockIdOf(ev.id)!;
    seen.add(id);
    const b = blocks.get(id);
    const last = state.pushed[id];
    if (ev.status === "cancelled") {
      // Dihapus di Google: hapus blok bila blok belum diubah sejak terakhir sinkron.
      if (b && last && slotHash(b) === last) {
        await d.removeBlock(id);
        blocks.delete(id);
        res.removedLocal++;
      }
      if (!b || (last && slotHash(b) === last)) delete state.pushed[id];
      continue;
    }
    const slot = slotOf(ev);
    if (!b) {
      // Blok sudah dihapus di perangkat ini setelah dikirim → hapus juga di Google.
      if (last) {
        await d.client.remove(target, ev.id);
        delete state.pushed[id];
        res.removedRemote++;
      }
      continue;
    }
    if (!slot) continue;
    const gHash = slotHash(slot);
    const localChanged = slotHash(b) !== last;
    const remoteChanged = gHash !== last && gHash !== slotHash(b);
    if (remoteChanged && (!localChanged || Date.parse(ev.updated ?? "0") > b.updatedAt)) {
      // Diubah di Google dan lebih baru: bawa ke blok.
      const next = { ...b, ...slot, title: slot.title || b.title };
      await d.saveBlock(next);
      blocks.set(id, next);
      state.pushed[id] = slotHash(next);
      res.updatedLocal++;
    }
  }

  // Kirim blok baru / berubah.
  for (const b of blocks.values()) {
    if (b.date < pushFrom || b.date > pushTo) continue;
    const h = slotHash(b);
    if (state.pushed[b.id] === h && seen.has(b.id)) continue;
    await d.client.put(target, eventIdOf(b.id), blockBody(b));
    state.pushed[b.id] = h;
    res.pushed++;
  }
  // Blok yang dihapus di sini tapi acaranya di luar rentang baca.
  for (const id of Object.keys(state.pushed)) {
    if (!blocks.has(id) && !seen.has(id)) {
      await d.client.remove(target, eventIdOf(id));
      delete state.pushed[id];
      res.removedRemote++;
    }
  }
  return res;
}
