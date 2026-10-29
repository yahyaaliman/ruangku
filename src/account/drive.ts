import { pkceChallenge, randomString, type Http, type LoginDeps, type Secrets } from "../calendar/gcal";
import type { RawRecord } from "../lib/types";

export const ACCOUNT_KEY = "google_account";
export const REFRESH_KEY = "account_google_refresh";
export const CLIENT_KEY = "account_google_client";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
export const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.appdata";
export interface GoogleAccount {
  clientId: string;
  connected: boolean;
  subject?: string;
  email?: string;
  lastSync?: number;
  lastError?: string;
}
export interface Snapshot { format: 1; deviceId: string; records: RawRecord[] }

// Settings are strictly allowlisted: credentials, OAuth configuration, local paths,
// device IDs and automation/integration secrets must never travel with preferences.
export function portableSetting(key: string): boolean {
  return ["theme", "appearance", "sidebar_prefs", "pane_widths", "dashboard_layout", "dashboard_view", "calendar_size", "calendar_preferences", "modules_off"].includes(key) ||
    /^layout_(hari-ini|tasks|calendar|proyek|rapat|kuliah|keuangan|okr|kpi|ibadah|evaluasi)$/.test(key);
}
export function portableRecord(r: RawRecord): boolean {
  if (r.kind === "account_preference") {
    return r.id.startsWith("account-pref:") && portableSetting(r.id.slice(13)) &&
      !r.deleted && r.data?.key === r.id.slice(13) && typeof r.data?.value === "string";
  }
  // Private app data includes ordinary user records, but not team authentication
  // or external calendar subscription URLs (which can contain private tokens).
  return !["workspace", "calsub", "calcache"].includes(r.kind) && !r.kind.startsWith("account_") && !r.id.startsWith("account-pref:");
}
export function parseSnapshot(text: string): Snapshot {
  const s = JSON.parse(text);
  if (s?.format !== 1 || typeof s.deviceId !== "string" || !Array.isArray(s.records)) throw new Error("Format data Google Drive tidak didukung.");
  for (const r of s.records) {
    if (!r || typeof r.id !== "string" || !r.id || typeof r.kind !== "string" ||
      typeof r.updatedAt !== "number" || !Number.isFinite(r.updatedAt) || r.updatedAt < 0 || typeof r.deleted !== "boolean" ||
      (!r.deleted && (!r.data || typeof r.data !== "object" || Array.isArray(r.data)))) throw new Error("Data Google Drive tidak valid; sinkronisasi dihentikan.");
  }
  return { ...s, records: s.records.filter(portableRecord) };
}

export async function loginAccount(clientId: string, clientSecret: string, previous: GoogleAccount | null, deps: LoginDeps): Promise<GoogleAccount> {
  const state = randomString(32), verifier = randomString(64);
  const params = new URLSearchParams({ client_id: clientId.trim(), response_type: "code", scope: `openid email ${DRIVE_SCOPE}`, code_challenge: await pkceChallenge(verifier), code_challenge_method: "S256", access_type: "offline", prompt: "consent select_account", state });
  const cb = await deps.loopback(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
  if (cb.error || !cb.code || cb.state !== state) throw new Error(cb.error === "access_denied" ? "Login dibatalkan." : "Respons login Google tidak valid.");
  const token = await deps.http({ method: "POST", url: TOKEN_URL, headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ code: cb.code, client_id: clientId.trim(), client_secret: clientSecret.trim(), redirect_uri: cb.redirectUri, grant_type: "authorization_code", code_verifier: verifier }).toString() });
  const t = JSON.parse(token.body);
  if (token.status !== 200 || !t.access_token || !t.refresh_token) throw new Error("Google tidak memberi akses offline. Silakan masuk ulang.");
  if (!String(t.scope).split(" ").includes(DRIVE_SCOPE)) throw new Error("Izin penyimpanan data aplikasi di Google Drive diperlukan.");
  // Read identity from Google using the issued token; don't trust a decoded JWT.
  const profile = await deps.http({ method: "GET", url: "https://openidconnect.googleapis.com/v1/userinfo", headers: { authorization: `Bearer ${t.access_token}` } });
  const user = JSON.parse(profile.body);
  if (profile.status !== 200 || typeof user.sub !== "string" || typeof user.email !== "string" || !user.email_verified) throw new Error("Identitas akun Google tidak dapat diverifikasi.");
  if (previous?.subject && previous.subject !== user.sub) throw new Error(`Data lokal terhubung ke ${previous.email}. Masuk dengan akun yang sama agar data tidak tercampur.`);
  await deps.secrets.set(REFRESH_KEY, t.refresh_token);
  await deps.secrets.set(CLIENT_KEY, clientSecret.trim());
  return { clientId: clientId.trim(), connected: true, subject: user.sub, email: user.email, lastSync: previous?.lastSync };
}

export class DriveClient {
  private access = "";
  constructor(private cfg: GoogleAccount, private http: Http, private secrets: Secrets) {}
  private async refresh() {
    const refresh = await this.secrets.get(REFRESH_KEY);
    if (!refresh) throw new Error("Masuk kembali dengan Google untuk melanjutkan sinkronisasi.");
    const res = await this.http({ method: "POST", url: TOKEN_URL, headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: this.cfg.clientId, client_secret: (await this.secrets.get(CLIENT_KEY)) ?? "", refresh_token: refresh, grant_type: "refresh_token" }).toString() });
    const t = JSON.parse(res.body);
    if (res.status !== 200 || !t.access_token) throw new Error("Izin Google kedaluwarsa atau dicabut. Silakan masuk kembali.");
    this.access = t.access_token;
  }
  private async request(method: string, url: string, body?: string, type = "application/json", retry = true): Promise<string> {
    if (!this.access) await this.refresh();
    const res = await this.http({ method, url, body, headers: { authorization: `Bearer ${this.access}`, "content-type": type }, timeoutMs: 60000 });
    if (res.status === 401 && retry) { await this.refresh(); return this.request(method, url, body, type, false); }
    if (res.status < 200 || res.status >= 300) throw new Error(`Sinkronisasi Google Drive gagal (HTTP ${res.status}). Data lokal tetap tersimpan.`);
    return res.body;
  }
  async files(): Promise<{ id: string; name: string }[]> {
    const files: { id: string; name: string }[] = [];
    let page = "";
    do {
      const q = new URLSearchParams({ spaces: "appDataFolder", q: "trashed = false and name contains 'ruangku-device-'", fields: "nextPageToken,files(id,name)", pageSize: "1000", ...(page ? { pageToken: page } : {}) });
      const r = JSON.parse(await this.request("GET", `https://www.googleapis.com/drive/v3/files?${q}`));
      files.push(...(r.files ?? [])); page = r.nextPageToken ?? "";
    } while (page);
    return files.filter(f => /^ruangku-device-[\w-]+\.json$/.test(f.name));
  }
  async read(id: string) { return parseSnapshot(await this.request("GET", `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?alt=media`)); }
  async write(id: string | undefined, snap: Snapshot) {
    const body = JSON.stringify(snap);
    if (id) { await this.request("PATCH", `https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(id)}?uploadType=media`, body); return; }
    const boundary = `ruangku_${randomString(24)}`;
    const metadata = JSON.stringify({ name: `ruangku-device-${snap.deviceId}.json`, parents: ["appDataFolder"], mimeType: "application/json" });
    await this.request("POST", "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart", `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${body}\r\n--${boundary}--`, `multipart/related; boundary=${boundary}`);
  }
}

/** Each device owns one snapshot. Pull every file (including our own for recovery)
 * before writing; concurrent devices never overwrite each other's files. */
export async function syncAccount(client: Pick<DriveClient, "files" | "read" | "write">, deviceId: string, deps: {
  merge: (records: RawRecord[]) => Promise<unknown>;
  export: () => Promise<RawRecord[]>;
}) {
  const files = await client.files();
  // Validate all downloaded files before mutating any local records.
  const incoming: RawRecord[] = [];
  for (const file of files) incoming.push(...(await client.read(file.id)).records);
  await deps.merge(incoming);
  const records = (await deps.export()).filter(portableRecord);
  const own = files.find(f => f.name === `ruangku-device-${deviceId}.json`);
  await client.write(own?.id, { format: 1, deviceId, records });
  return { pulled: incoming.length, pushed: records.length };
}
