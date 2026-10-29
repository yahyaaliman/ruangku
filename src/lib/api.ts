import type { FsEntry, Place, RawRecord, SyncReport, SyncStatus, WidgetConfig } from "./types";

export interface HttpReq {
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
}
export interface HttpRes {
  status: number;
  body: string;
}
export interface MailCfg {
  user: string;
  password: string;
  smtpHost?: string;
  smtpPort?: number;
  imapHost?: string;
  imapPort?: number;
  security?: "ssl" | "starttls" | "none";
  fromName?: string;
}
export interface MailIncoming {
  uid: number;
  from: string;
  subject: string;
  text: string;
}

/** HTTP JSON lewat backend (tanpa hambatan CORS). Melempar galat bila status bukan 2xx. */
export async function httpJson<T = any>(method: string, url: string, body?: unknown, headers: Record<string, string> = {}, timeoutMs?: number): Promise<T> {
  const res = await api.http({ method, url, headers: { "content-type": "application/json", ...headers }, body: body === undefined ? undefined : JSON.stringify(body), timeoutMs });
  let data: any = null;
  try {
    data = res.body ? JSON.parse(res.body) : null;
  } catch {
    data = res.body;
  }
  if (res.status < 200 || res.status >= 300) {
    const msg = (data && (data.error?.message || data.message || data.description || (typeof data.error === "string" ? data.error : ""))) || res.body.slice(0, 200);
    const e = new Error(`HTTP ${res.status}: ${msg}`) as Error & { status?: number; data?: unknown };
    e.status = res.status;
    e.data = data;
    throw e;
  }
  return data as T;
}

/** True saat berjalan di aplikasi desktop (Tauri), false di pratinjau browser. */
export const isDesktop = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

async function call<T>(cmd: string, args: Record<string, unknown> = {}): Promise<T> {
  if (isDesktop) {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<T>(cmd, args);
  }
  const { mockCall } = await import("./mock");
  return mockCall(cmd, args) as Promise<T>;
}

export type AppEvent = "records-changed" | "sync-done" | "setting-changed" | "widget-config" | "navigate" | "widget-open-settings" | "capture-open" | "break-state" | "bot-event" | "team-sync" | "team-remote-change" | "team-realtime" | "mcp-request";

/** True di dalam jendela catat cepat. */
export const isCapture = typeof window !== "undefined" && (Boolean((window as any).__RUANGKU_CAPTURE__) || /^#\/?capture$/.test(window.location.hash));

/** Id catatan bila jendela ini sticky note di desktop. */
export const stickyId: string | null =
  typeof window === "undefined" ? null : ((window as any).__RUANGKU_STICKY__ as string | undefined) ?? (/^#\/?sticky=([\w-]+)$/.exec(window.location.hash)?.[1] ?? null);

/** True di dalam jendela istirahat. */
export const isBreak = typeof window !== "undefined" && (Boolean((window as any).__RUANGKU_BREAK__) || /^#\/?break$/.test(window.location.hash));

/** True di dalam jendela widget desktop. */
export const isWidget =
  typeof window !== "undefined" && (Boolean((window as any).__RUANGKU_WIDGET__) || /^#\/?widget$/.test(window.location.hash));

/** Dengarkan event dari backend. Mengembalikan fungsi untuk berhenti mendengar. */
export function onEvent<T = unknown>(name: AppEvent, cb: (payload: T) => void): () => void {
  let stop: (() => void) | undefined;
  let cancelled = false;
  if (isDesktop) {
    import("@tauri-apps/api/event").then(({ listen }) =>
      listen<T>(name, (e) => cb(e.payload)).then((un) => {
        if (cancelled) un();
        else stop = un;
      }),
    );
  } else {
    const handler = (e: Event) => cb((e as CustomEvent<T>).detail);
    window.addEventListener(`ruangku:${name}`, handler);
    stop = () => window.removeEventListener(`ruangku:${name}`, handler);
  }
  return () => {
    cancelled = true;
    stop?.();
  };
}

export const api = {
  list: (kind: string) => call<RawRecord[]>("records_list", { kind }),
  save: (id: string, kind: string, data: unknown) => call<RawRecord>("record_save", { id, kind, data }),
  remove: (id: string, kind: string) => call<void>("record_delete", { id, kind }),
  importRecords: (records: RawRecord[]) => call<number>("records_import", { records }),
  countRecords: () => call<number>("records_count"),
  accountExport: () => call<RawRecord[]>("account_export"),
  changedSince: (since: number) => call<RawRecord[]>("records_changed_since", { since }),
  forceRecords: (records: RawRecord[]) => call<number>("records_force", { records }),
  removeDemo: () => call<number>("records_remove_demo"),
  getSetting: (key: string) => call<string | null>("setting_get", { key }),
  setSetting: (key: string, value: string) => call<void>("setting_set", { key, value }),

  syncStatus: () => call<SyncStatus>("sync_status"),
  syncNow: () => call<SyncReport>("sync_now"),
  backupExport: (path: string) => call<number>("backup_export", { path }),
  backupImport: (path: string) => call<number>("backup_import", { path }),

  places: () => call<Place[]>("fm_places"),
  listDir: (path: string) => call<FsEntry[]>("fm_list", { path }),
  mkdir: (parent: string, name: string) => call<FsEntry>("fm_mkdir", { parent, name }),
  createFile: (parent: string, name: string) => call<FsEntry>("fm_create_file", { parent, name }),
  rename: (path: string, newName: string) => call<FsEntry>("fm_rename", { path, newName }),
  copy: (sources: string[], dest: string) => call<number>("fm_copy", { sources, dest }),
  move: (sources: string[], dest: string) => call<number>("fm_move", { sources, dest }),
  trash: (paths: string[]) => call<number>("fm_trash", { paths }),
  search: (root: string, query: string) => call<FsEntry[]>("fm_search", { root, query }),
  dirSize: (path: string) => call<[number, number]>("fm_dir_size", { path }),
  stat: (path: string) => call<FsEntry | null>("fm_stat", { path }),
  open: (path: string) => call<void>("fm_open", { path }),
  reveal: (path: string) => call<void>("fm_reveal", { path }),

  autostartGet: () => call<boolean>("autostart_get"),
  autostartSet: (enabled: boolean) => call<void>("autostart_set", { enabled }),
  notifyTest: () => call<void>("notify_test"),
  notifySend: (title: string, body: string) => call<void>("notify_send", { title, body }),
  captureHide: () => call<void>("capture_hide"),

  widgetConfig: () => call<WidgetConfig>("widget_config"),
  widgetSetVisible: (visible: boolean) => call<WidgetConfig>("widget_set_visible", { visible }),
  widgetSetLayer: (layer: WidgetConfig["layer"]) => call<WidgetConfig>("widget_set_layer", { layer }),
  widgetSetClickThrough: (enabled: boolean) => call<WidgetConfig>("widget_set_click_through", { enabled }),
  widgetSetEffect: (effect: WidgetConfig["effect"]) => call<WidgetConfig>("widget_set_effect", { effect }),
  widgetResetPosition: () => call<WidgetConfig>("widget_reset_position"),
  widgetSetSize: (width: number, height: number) => call<WidgetConfig>("widget_set_size", { width, height }),
  widgetSnap: (place: string) => call<WidgetConfig>("widget_snap", { place }),
  stickyOpen: (id: string) => call<void>("sticky_open", { id }),
  stickyClose: (id: string) => call<void>("sticky_close", { id }),
  stickySetLayer: (id: string, layer: "desktop" | "normal" | "top") => call<void>("sticky_set_layer", { id, layer }),
  stickyLayer: (id: string) => call<string>("sticky_layer", { id }),
  stickyList: () => call<string[]>("sticky_list"),
  openMain: (page?: string) => call<void>("open_main", { page }),
  http: (req: HttpReq) => call<HttpRes>("http_request", { req }),
  sleep: (ms: number) => call<void>("sleep_ms", { ms }),
  mailSend: (cfg: MailCfg, to: string, subject: string, body: string) => call<void>("mail_send", { cfg, to, subject, body }),
  mailFetch: (cfg: MailCfg, marker: string) => call<MailIncoming[]>("mail_fetch", { cfg, marker }),

  backupsList: () => call<BackupInfo[]>("backups_list"),
  backupsDir: () => call<string>("backups_dir"),
  backupNow: () => call<string>("backup_now"),
  backupRestore: (name: string) => call<number>("backup_restore", { name }),
  secretSet: (key: string, value: string) => call<string>("secret_set", { key, value }),
  secretGet: (key: string) => call<string | null>("secret_get", { key }),
  secretStore: () => call<string>("secret_store"),
  oauthLoopback: (url: string, timeoutSecs?: number) => call<OAuthResult>("oauth_loopback", { url, timeoutSecs }),
  openUrl: (url: string) => call<void>("open_url", { url }),
  writeText: (path: string, contents: string) => call<void>("write_text_file", { path, contents }),
  log: (level: "INFO" | "WARN" | "ERROR", message: string) => call<void>("log_write", { level, message }).catch(() => {}),
  logTail: (lines = 200) => call<string[]>("log_tail", { lines }),
  diagnostics: () => call<Diagnostics>("diagnostics"),
  mcpStart: (port: number, token: string) => call<McpStatus>("mcp_start", { port, token }),
  mcpStop: () => call<McpStatus>("mcp_stop"),
  mcpStatus: () => call<McpStatus>("mcp_status"),
  mcpRespond: (id: number, status: number, body: string) => call<void>("mcp_respond", { id, status, body }),
  appExePath: () => call<string>("app_exe_path"),
  setZoom: (scale: number) => call<void>("set_zoom", { scale }),
  teamRealtimeStart: (url: string, token: string) => call<void>("team_realtime_start", { url, token }),
  teamRealtimeStop: () => call<void>("team_realtime_stop"),
};

export interface McpStatus {
  running: boolean;
  port: number;
  url: string;
  error: string | null;
  requests: number;
}

export interface BackupInfo {
  name: string;
  size: number;
  modified: number;
  auto: boolean;
}
export interface OAuthResult {
  code?: string | null;
  state?: string | null;
  error?: string | null;
  redirectUri: string;
}
export interface Diagnostics {
  version: string;
  os: string;
  arch: string;
  dataDir: string;
  dbBytes: number;
  records: [string, number][];
  tombstones: number;
  settings: number;
  backups: number;
  lastBackup?: string | null;
  secretStore: string;
  integrity: string;
}

/** Kirim event ke jendela lain (main <-> widget). */
export async function emitTo(target: "main" | "widget", name: AppEvent, payload?: unknown) {
  if (isDesktop) {
    const { emitTo: et } = await import("@tauri-apps/api/event");
    await et(target, name, payload);
  } else {
    window.dispatchEvent(new CustomEvent(`ruangku:${name}`, { detail: payload }));
  }
}

/** Geser / ubah ukuran jendela widget tanpa bingkai. */
export async function windowDrag() {
  if (!isDesktop) return;
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  await getCurrentWindow().startDragging();
}

export type ResizeDir = "East" | "West" | "South" | "SouthEast" | "SouthWest" | "North" | "NorthEast" | "NorthWest";
export async function windowResize(dir: ResizeDir) {
  if (!isDesktop) return;
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  await getCurrentWindow().startResizeDragging(dir);
}

/** Dialog pilih folder/file. Di pratinjau browser memakai prompt sederhana. */
export async function pickFolder(title: string): Promise<string | null> {
  if (!isDesktop) return window.prompt(title, "C:\\Users\\Saya\\OneDrive");
  const { open } = await import("@tauri-apps/plugin-dialog");
  const r = await open({ directory: true, multiple: false, title });
  return typeof r === "string" ? r : null;
}

export async function pickSavePath(title: string, defaultPath: string, filter: { name: string; extensions: string[] } = { name: "Backup Ruangku", extensions: ["json"] }): Promise<string | null> {
  if (!isDesktop) return window.prompt(title, defaultPath);
  const { save } = await import("@tauri-apps/plugin-dialog");
  return save({ title, defaultPath, filters: [filter] });
}

/** Simpan teks ke file pilihan pengguna. Di pratinjau browser: unduh. */
export async function saveTextFile(title: string, defaultName: string, contents: string, filter: { name: string; extensions: string[] }, mime = "text/plain"): Promise<string | null> {
  if (!isDesktop) {
    const url = URL.createObjectURL(new Blob([contents], { type: mime }));
    const a = document.createElement("a");
    a.href = url;
    a.download = defaultName;
    a.click();
    URL.revokeObjectURL(url);
    return defaultName;
  }
  const path = await pickSavePath(title, defaultName, filter);
  if (!path) return null;
  await api.writeText(path, contents);
  return path;
}

/** Buka file teks pilihan pengguna dan baca isinya. */
export async function openTextFile(title: string, filter: { name: string; extensions: string[] }): Promise<{ name: string; text: string } | null> {
  if (!isDesktop) {
    return new Promise((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = filter.extensions.map((e) => `.${e}`).join(",");
      input.onchange = async () => {
        const f = input.files?.[0];
        resolve(f ? { name: f.name, text: await f.text() } : null);
      };
      input.click();
    });
  }
  const { open } = await import("@tauri-apps/plugin-dialog");
  const r = await open({ title, multiple: false, filters: [filter] });
  if (typeof r !== "string") return null;
  return { name: r.split(/[\\/]/).pop() ?? r, text: await call<string>("read_text_file", { path: r }) };
}

export async function pickOpenPath(title: string): Promise<string | null> {
  if (!isDesktop) return window.prompt(title, "backup.json");
  const { open } = await import("@tauri-apps/plugin-dialog");
  const r = await open({ title, multiple: false, filters: [{ name: "Backup Ruangku", extensions: ["json"] }] });
  return typeof r === "string" ? r : null;
}

export function newId(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 20);
}

export function errorText(e: unknown): string {
  if (typeof e === "string") return e;
  if (e instanceof Error) return e.message;
  return "Terjadi kesalahan yang tidak dikenal.";
}
