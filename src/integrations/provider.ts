import { api, type HttpReq, type HttpRes } from "../lib/api";
import { pkceChallenge, randomString } from "../calendar/gcal";
import { addDays, dateKey } from "../lib/date";
import type { Doc, ExternalEntry } from "./reconcile";

export type Provider = "google-tasks" | "outlook";
export interface Connection { provider: Provider; clientId: string; connected: boolean; subject?: string; email?: string; container?: string; projectId?: string; lastSync?: number; lastError?: string }
const endpoints = {
  "google-tasks": { auth: "https://accounts.google.com/o/oauth2/v2/auth", token: "https://oauth2.googleapis.com/token", api: "https://tasks.googleapis.com/tasks/v1", scope: "openid email https://www.googleapis.com/auth/tasks", profile: "https://openidconnect.googleapis.com/v1/userinfo" },
  outlook: { auth: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize", token: "https://login.microsoftonline.com/common/oauth2/v2.0/token", api: "https://graph.microsoft.com/v1.0", scope: "openid offline_access User.Read Calendars.ReadWrite", profile: "https://graph.microsoft.com/v1.0/me" },
};
export const connectionKey = (p: Provider) => `external_${p}`;
const secretKey = (p: Provider, name: string) => `external_${p}_${name}`;
const id = encodeURIComponent;
const marker = /\n?\[Ruangku:([a-zA-Z0-9_:-]+)\]\s*$/;
const cleanNotes = (s = "") => s.replace(marker, "").trim();
export const taskDoc = (t: any): Doc | null => t.deleted ? null : ({ title: t.title || "", notes: cleanNotes(t.notes), due: t.due?.slice(0, 10) || null, completed: t.status === "completed" });
export function outlookDoc(e: any): Doc | null {
  if (e.isCancelled) return null;
  const parse = (v: string) => new Date(/[Zz]|[+-]\d\d:\d\d$/.test(v) ? v : `${v}Z`);
  const a = parse(e.start?.dateTime || ""), b = parse(e.end?.dateTime || "");
  if (!Number.isFinite(+a) || !Number.isFinite(+b) || +b <= +a || e.isAllDay) throw new Error("Acara sepanjang hari/lintas hari belum dapat diubah menjadi blok jadwal.");
  const midnightEnd = b.getHours() === 0 && b.getMinutes() === 0 && dateKey(b) === dateKey(addDays(a, 1));
  if (dateKey(a) !== dateKey(b) && !midnightEnd) throw new Error("Acara lintas hari belum dapat diubah menjadi blok jadwal.");
  return { title: e.subject || "", date: dateKey(a), start: a.getHours() * 60 + a.getMinutes(), end: midnightEnd ? 1440 : b.getHours() * 60 + b.getMinutes() };
}

export class ProviderClient {
  private token = "";
  private expiry = 0;
  constructor(public cfg: Connection, private http: (r: HttpReq) => Promise<HttpRes> = api.http) {}
  private get endpoints() { return endpoints[this.cfg.provider]; }
  private async tokenRequest(fields: Record<string, string>) {
    const res = await this.http({ method: "POST", url: this.endpoints.token, headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: this.cfg.clientId, ...(this.cfg.provider === "google-tasks" ? { client_secret: await api.secretGet(secretKey(this.cfg.provider, "client")) || "" } : {}), ...fields }).toString() });
    const t = JSON.parse(res.body || "{}");
    if (res.status !== 200 || !t.access_token) throw new Error("Login layanan gagal atau izin dicabut. Hubungkan ulang akun.");
    this.token = t.access_token; this.expiry = Date.now() + (Number(t.expires_in) || 3600) * 1000;
    return t;
  }
  async login(secret: string) {
    const verifier = randomString(64), state = randomString(32);
    const query = new URLSearchParams({ client_id: this.cfg.clientId, response_type: "code", scope: this.endpoints.scope, code_challenge_method: "S256", code_challenge: await pkceChallenge(verifier), state, ...(this.cfg.provider === "google-tasks" ? { access_type: "offline", prompt: "consent select_account" } : { prompt: "select_account" }) });
    const cb = await api.oauthLoopback(`${this.endpoints.auth}?${query}`, 300);
    if (!cb.code || cb.error || cb.state !== state) throw new Error("Login dibatalkan atau respons tidak valid.");
    // Google desktop client secret is app configuration, not a confidential server secret.
    const res = await this.http({ method: "POST", url: this.endpoints.token, headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: this.cfg.clientId, ...(this.cfg.provider === "google-tasks" ? { client_secret: secret } : {}), grant_type: "authorization_code", code: cb.code, redirect_uri: cb.redirectUri, code_verifier: verifier }).toString() });
    const t = JSON.parse(res.body || "{}");
    if (res.status !== 200 || !t.access_token || !t.refresh_token) throw new Error("Layanan tidak memberi izin sinkronisasi offline.");
    const profile = await this.http({ method: "GET", url: this.endpoints.profile, headers: { authorization: `Bearer ${t.access_token}` } });
    const u = JSON.parse(profile.body || "{}");
    const subject = this.cfg.provider === "google-tasks" ? u.sub : u.id;
    if (profile.status !== 200 || typeof subject !== "string" || (this.cfg.provider === "google-tasks" && !u.email_verified)) throw new Error("Identitas akun tidak dapat diverifikasi.");
    if (this.cfg.subject && this.cfg.subject !== subject) throw new Error(`Koneksi ini terikat ke ${this.cfg.email}. Gunakan akun yang sama agar data tidak tercampur.`);
    if (this.cfg.provider === "google-tasks" && !String(t.scope).includes("https://www.googleapis.com/auth/tasks")) throw new Error("Izin Google Tasks diperlukan.");
    await api.secretSet(secretKey(this.cfg.provider, "refresh"), t.refresh_token);
    await api.secretSet(secretKey(this.cfg.provider, "client"), secret);
    return { ...this.cfg, subject, email: u.email || u.mail || u.userPrincipalName, connected: true };
  }
  async disconnect() { await api.secretSet(secretKey(this.cfg.provider, "refresh"), ""); await api.secretSet(secretKey(this.cfg.provider, "client"), ""); }
  async request(method: string, path: string, body?: unknown, etag?: string, retry = true): Promise<any> {
    const url = path.startsWith("https://") ? path : this.endpoints.api + path;
    // Only follow pagination links on the same trusted API origin/path.
    if (!url.startsWith(this.endpoints.api + "/")) throw new Error("Alamat pagination layanan tidak valid.");
    if (!this.token || this.expiry < Date.now() + 60000) {
      const refresh = await api.secretGet(secretKey(this.cfg.provider, "refresh"));
      if (!refresh) throw new Error("Hubungkan akun terlebih dahulu.");
      const t = await this.tokenRequest({ grant_type: "refresh_token", refresh_token: refresh });
      if (t.refresh_token) await api.secretSet(secretKey(this.cfg.provider, "refresh"), t.refresh_token);
    }
    const res = await this.http({ method, url, body: body === undefined ? undefined : JSON.stringify(body), headers: { authorization: `Bearer ${this.token}`, "content-type": "application/json", ...(this.cfg.provider === "outlook" ? { Prefer: 'outlook.timezone="UTC", IdType="ImmutableId"' } : {}), ...(etag ? { "If-Match": etag } : {}) }, timeoutMs: 30000 });
    if (res.status === 401 && retry) { this.token = ""; return this.request(method, path, body, etag, false); }
    if (res.status < 200 || res.status >= 300) throw Object.assign(new Error(res.status === 412 ? "Item berubah saat sinkronisasi. Coba sinkronkan lagi." : `Layanan gagal (HTTP ${res.status}). Coba lagi; perubahan lokal tetap tersimpan.`), { status: res.status });
    return res.body ? JSON.parse(res.body) : null;
  }
  async pages(path: string, key: "items" | "value") {
    const result: any[] = []; const seen = new Set<string>();
    while (path) {
      if (seen.has(path) || seen.size >= 1000) throw new Error("Pagination layanan tidak valid atau terlalu banyak data.");
      seen.add(path); const page = await this.request("GET", path); result.push(...(page[key] || []));
      if (key === "value") path = page["@odata.nextLink"] || "";
      else if (page.nextPageToken) { const u = new URL(path.startsWith("https://") ? path : this.endpoints.api + path); u.searchParams.set("pageToken", page.nextPageToken); path = u.toString(); } else path = "";
    }
    return result;
  }
  async containers(): Promise<{ id: string; name: string }[]> {
    return this.cfg.provider === "google-tasks" ? (await this.pages("/users/@me/lists?maxResults=100", "items")).map(v => ({ id: v.id, name: v.title })) : (await this.pages("/me/calendars?$top=100", "value")).filter(v => v.canEdit).map(v => ({ id: v.id, name: v.name }));
  }
  private get root() { return this.cfg.provider === "google-tasks" ? `/lists/${id(this.cfg.container!)}/tasks` : `/me/calendars/${id(this.cfg.container!)}/events`; }
  private entry(value: any): ExternalEntry { return { id: value.id, etag: value.etag || value["@odata.etag"], doc: this.cfg.provider === "google-tasks" ? taskDoc(value) : outlookDoc(value), localId: this.cfg.provider === "google-tasks" ? marker.exec(value.notes || "")?.[1] : value.singleValueExtendedProperties?.find((p: any) => p.id === GRAPH_MARKER)?.value }; }
  async list(): Promise<ExternalEntry[]> {
    if (this.cfg.provider === "google-tasks") return (await this.pages(`${this.root}?maxResults=100&showCompleted=true&showHidden=true&showDeleted=true`, "items")).filter(t => !t.assignmentInfo).map(v => this.entry(v));
    const start = addDays(new Date(), -90).toISOString(), end = addDays(new Date(), 180).toISOString();
    const query = new URLSearchParams({ startDateTime: start, endDateTime: end, "$top": "100", "$expand": `singleValueExtendedProperties($filter=id eq '${GRAPH_MARKER}')` });
    const rows = await this.pages(`/me/calendars/${id(this.cfg.container!)}/calendarView?${query}`, "value");
    const entries: ExternalEntry[] = [];
    for (const r of rows) { try { entries.push(this.entry(r)); } catch { /* all-day/multi-day events remain unchanged in Outlook */ } }
    return entries;
  }
  async get(remoteId: string): Promise<ExternalEntry> {
    try { return this.entry(await this.request("GET", `${this.root}/${id(remoteId)}`)); }
    catch (e) { if ((e as any).status === 404 || (this.cfg.provider === "google-tasks" && (e as any).status === 410)) return { id: remoteId, doc: null }; throw e; }
  }
  async save(remoteId: string | undefined, localId: string, doc: Doc | null, etag?: string): Promise<ExternalEntry> {
    if (!doc) { if (remoteId) await this.request("DELETE", `${this.root}/${id(remoteId)}`, undefined, etag); return { id: remoteId || "", doc: null }; }
    let body: any;
    if (this.cfg.provider === "google-tasks") body = { title: doc.title, notes: `${doc.notes || ""}\n[Ruangku:${localId}]`, due: doc.due ? `${doc.due}T00:00:00.000Z` : null, status: doc.completed ? "completed" : "needsAction" };
    else {
      const start = new Date(`${doc.date}T00:00:00`); start.setMinutes(Number(doc.start));
      const end = new Date(`${doc.date}T00:00:00`); end.setMinutes(Number(doc.end));
      body = { subject: doc.title, start: { dateTime: start.toISOString(), timeZone: "UTC" }, end: { dateTime: end.toISOString(), timeZone: "UTC" }, ...(!remoteId ? { transactionId: localId, singleValueExtendedProperties: [{ id: GRAPH_MARKER, value: localId }] } : {}) };
    }
    return this.entry(await this.request(remoteId ? "PATCH" : "POST", remoteId ? `${this.root}/${id(remoteId)}` : this.root, body, etag));
  }
}
const GRAPH_MARKER = "String {450a743c-57c5-4c85-b690-fcc13cf5f682} Name RuangkuId";
