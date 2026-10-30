// Backend tiruan untuk pratinjau di browser (`npm run dev` tanpa Tauri).
// Data disimpan di localStorage; file manager memakai pohon folder contoh.
import type { FsEntry, RawRecord } from "./types";
import { demoConfigRecords, demoRecords } from "./demo";

const KEY = "ruangku-preview-records";
const VERSION_KEY = "ruangku-preview-version";
const VERSION = "7";

function load(): RawRecord[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw && localStorage.getItem(VERSION_KEY) === VERSION) return JSON.parse(raw);
  } catch {
    /* pratinjau tanpa storage */
  }
  const seeded = seed();
  persist(seeded);
  try {
    localStorage.setItem(VERSION_KEY, VERSION);
    localStorage.setItem("ruangku-setting-demo_state", "loaded");
  } catch {
    /* abaikan */
  }
  return seeded;
}

let mem: RawRecord[] | null = null;
function db(): RawRecord[] {
  if (!mem) mem = load();
  return mem;
}
function persist(r: RawRecord[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(r));
  } catch {
    /* abaikan */
  }
}
function emit(name: string, detail: unknown) {
  window.dispatchEvent(new CustomEvent(`ruangku:${name}`, { detail }));
}

function seed(): RawRecord[] {
  return [...demoRecords({ preview: true }), ...demoConfigRecords()];
}

// ---- file system contoh ----
type Node = { name: string; dir: boolean; size?: number; children?: Node[]; modified: number };
const T = Date.now() - 86400000;
const f = (name: string, size: number, days = 1): Node => ({ name, dir: false, size, modified: T - days * 86400000 });
const d = (name: string, children: Node[]): Node => ({ name, dir: true, children, modified: T });
const tree: Node = d("C:", [
  d("Users", [
    d("Saya", [
      d("Desktop", [f("Catatan cepat.txt", 1200), f("Screenshot 2026-10-24.png", 384000)]),
      d("Documents", [
        d("Kantor", [f("Laporan Q3 2026.docx", 245000, 3), f("Anggaran 2027.xlsx", 88000, 2), f("Presentasi OKR.pptx", 2400000, 5)]),
        d("Riset Thesis", [f("Proposal v3.docx", 412000, 1), f("Data survei.xlsx", 96000, 2), d("Paper", [f("devlin2019-bert.pdf", 780000, 30), f("wilie2020-indonlu.pdf", 640000, 28)])]),
        d("Jitu", [f("Spesifikasi v1.pdf", 330000, 6), f("Desain onboarding.fig", 5200000, 3)]),
        d("Recruitment", [f("CV Andi S.pdf", 210000, 4), f("CV Maya P.pdf", 188000, 3), f("Rubrik wawancara.xlsx", 41000, 9)]),
        d("Pribadi", [f("KTP scan.pdf", 512000, 40), f("Rencana liburan.docx", 31000, 12)]),
        f("CV terbaru.pdf", 180000, 20),
      ]),
      d("Downloads", [f("installer-app.exe", 54000000, 2), f("faktur-oktober.pdf", 92000, 1), f("foto-acara.zip", 128000000, 6)]),
      d("Pictures", [f("keluarga.jpg", 3200000, 30)]),
      d("Videos", []),
      d("Music", []),
    ]),
  ]),
]);

function findNode(path: string): Node | null {
  const parts = path.replace(/\\+$/, "").split("\\").filter(Boolean);
  if (parts[0] !== "C:") return null;
  let cur: Node = tree;
  for (const p of parts.slice(1)) {
    const next = cur.children?.find((c) => c.name.toLowerCase() === p.toLowerCase());
    if (!next) return null;
    cur = next;
  }
  return cur;
}
const join = (a: string, b: string) => (a.endsWith("\\") ? a + b : `${a}\\${b}`);
const parentOf = (p: string) => p.slice(0, p.lastIndexOf("\\")) || "C:\\";
const nameOf = (p: string) => p.slice(p.lastIndexOf("\\") + 1);
function toEntry(n: Node, path: string): FsEntry {
  const dot = n.name.lastIndexOf(".");
  return { name: n.name, path, isDir: n.dir, size: n.size ?? 0, modified: n.modified, ext: !n.dir && dot > 0 ? n.name.slice(dot + 1).toLowerCase() : "", hidden: false };
}
function clone(n: Node): Node {
  return { ...n, children: n.children?.map(clone) };
}
function uniqueName(dir: Node, name: string) {
  if (!dir.children!.some((c) => c.name === name)) return name;
  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : "";
  for (let i = 1; ; i++) if (!dir.children!.some((c) => c.name === `${stem} (${i})${ext}`)) return `${stem} (${i})${ext}`;
}

const HOME = "C:\\Users\\Saya";

let mcpMock = { running: false, port: 0, url: "", error: null as string | null, requests: 0 };

export async function mockCall(cmd: string, a: Record<string, any>): Promise<unknown> {
  await new Promise((r) => setTimeout(r, 30));
  const rows = db();
  switch (cmd) {
    case "records_list":
      return rows.filter((r) => r.kind === a.kind && !r.deleted).sort((x, y) => y.updatedAt - x.updatedAt);
    case "record_save": {
      const i = rows.findIndex((r) => r.id === a.id);
      const rec: RawRecord = { id: a.id, kind: a.kind, data: a.data, updatedAt: Math.max(Date.now(), i >= 0 ? rows[i].updatedAt + 1 : 0), deleted: false };
      if (i >= 0) rows[i] = rec;
      else rows.push(rec);
      persist(rows);
      emit("records-changed", a.kind);
      return rec;
    }
    case "record_delete": {
      const r = rows.find((x) => x.id === a.id);
      if (r) Object.assign(r, { deleted: true, data: null, updatedAt: Date.now() });
      persist(rows);
      emit("records-changed", a.kind);
      return null;
    }
    case "records_import": {
      let n = 0;
      for (const r of a.records as RawRecord[]) {
        const i = rows.findIndex((x) => x.id === r.id);
        if (i < 0) (rows.push(r), n++);
        else if (r.updatedAt > rows[i].updatedAt) ((rows[i] = r), n++);
      }
      persist(rows);
      emit("records-changed", "*");
      return n;
    }
    case "records_changed_since":
      return rows.filter((r) => r.updatedAt > a.since).sort((x, y) => x.updatedAt - y.updatedAt);
    case "records_forget": {
      persist(rows.filter(r => !a.ids.includes(r.id)));
      emit("records-changed", "*");
      return null;
    }
    case "records_force": {
      for (const r of a.records as RawRecord[]) {
        const i = rows.findIndex((x) => x.id === r.id);
        if (i < 0) rows.push(r);
        else rows[i] = r;
      }
      persist(rows);
      emit("records-changed", "*");
      return a.records.length;
    }
    case "records_count":
      return rows.filter((r) => !r.deleted).length;
    case "records_remove_demo": {
      let n = 0;
      for (const r of rows) if (!r.deleted && r.data?.demo) (Object.assign(r, { deleted: true, data: null, updatedAt: Date.now() }), n++);
      persist(rows);
      emit("records-changed", "*");
      return n;
    }
    case "setting_get":
      return localStorage.getItem(`ruangku-setting-${a.key}`);
    case "setting_set":
      localStorage.setItem(`ruangku-setting-${a.key}`, a.value);
      emit("setting-changed", a.key);
      return null;
    case "sync_status": {
      const folder = localStorage.getItem("ruangku-setting-sync_folder");
      const last = localStorage.getItem("ruangku-setting-last_sync");
      return { folder: folder || null, deviceId: "pratinjau01", deviceName: "Pratinjau browser", lastSync: last ? +last : null, lastError: null };
    }
    case "sync_now": {
      if (!localStorage.getItem("ruangku-setting-sync_folder")) throw "Folder sinkronisasi belum dipilih. Atur di Pengaturan.";
      const rep = { devicesRead: 1, recordsPulled: 0, recordsPushed: rows.length, finishedAt: Date.now(), warnings: [] };
      localStorage.setItem("ruangku-setting-last_sync", String(rep.finishedAt));
      emit("sync-done", rep);
      return rep;
    }
    case "backup_export":
      return rows.length;
    case "backup_import":
      return 0;
    case "fm_places":
      return [
        { label: "Beranda", path: HOME, kind: "folder" },
        { label: "Desktop", path: `${HOME}\\Desktop`, kind: "folder" },
        { label: "Dokumen", path: `${HOME}\\Documents`, kind: "folder" },
        { label: "Unduhan", path: `${HOME}\\Downloads`, kind: "folder" },
        { label: "Gambar", path: `${HOME}\\Pictures`, kind: "folder" },
        { label: "Drive C:", path: "C:\\", kind: "drive" },
      ];
    case "fm_list": {
      const n = findNode(a.path);
      if (!n || !n.dir) throw `Tidak bisa membuka ${a.path}`;
      return n.children!
        .map((c) => toEntry(c, join(a.path, c.name)))
        .sort((x, y) => Number(y.isDir) - Number(x.isDir) || x.name.localeCompare(y.name));
    }
    case "fm_mkdir":
    case "fm_create_file": {
      const p = findNode(a.parent)!;
      if (p.children!.some((c) => c.name === a.name)) throw `"${a.name}" sudah ada di folder ini.`;
      const node: Node = cmd === "fm_mkdir" ? d(a.name, []) : f(a.name, 0, 0);
      node.modified = Date.now();
      p.children!.push(node);
      return toEntry(node, join(a.parent, a.name));
    }
    case "fm_rename": {
      const n = findNode(a.path)!;
      const p = findNode(parentOf(a.path))!;
      if (p.children!.some((c) => c !== n && c.name === a.newName)) throw `"${a.newName}" sudah ada di folder ini.`;
      n.name = a.newName;
      return toEntry(n, join(parentOf(a.path), a.newName));
    }
    case "fm_copy":
    case "fm_move": {
      const dest = findNode(a.dest)!;
      for (const s of a.sources as string[]) {
        const n = findNode(s)!;
        if (cmd === "fm_move") {
          const p = findNode(parentOf(s))!;
          if (p === dest) continue;
          p.children = p.children!.filter((c) => c !== n);
          n.name = uniqueName(dest, n.name);
          dest.children!.push(n);
        } else {
          const c = clone(n);
          c.name = uniqueName(dest, n.name);
          dest.children!.push(c);
        }
      }
      return a.sources.length;
    }
    case "fm_trash":
      for (const s of a.paths as string[]) {
        const p = findNode(parentOf(s))!;
        p.children = p.children!.filter((c) => c.name !== nameOf(s));
      }
      return a.paths.length;
    case "fm_search": {
      const out: FsEntry[] = [];
      const q = String(a.query).toLowerCase();
      const walk = (n: Node, path: string) => {
        n.children?.forEach((c) => {
          const cp = join(path, c.name);
          if (c.name.toLowerCase().includes(q)) out.push(toEntry(c, cp));
          walk(c, cp);
        });
      };
      const root = findNode(a.root);
      if (root) walk(root, a.root.replace(/\\+$/, ""));
      return out;
    }
    case "fm_dir_size": {
      let bytes = 0,
        files = 0;
      const walk = (n: Node) => n.children?.forEach((c) => (c.dir ? walk(c) : ((bytes += c.size ?? 0), files++)));
      const n = findNode(a.path);
      if (n) walk(n);
      return [bytes, files];
    }
    case "fm_stat": {
      const n = findNode(a.path);
      return n ? toEntry(n, a.path) : null;
    }
    case "fm_open":
    case "fm_reveal":
      return null;
    case "autostart_get":
      return localStorage.getItem("ruangku-setting-autostart") === "1";
    case "autostart_set":
      localStorage.setItem("ruangku-setting-autostart", a.enabled ? "1" : "0");
      return null;
    case "http_request": {
      const r = a.req;
      const res = await fetch(r.url, { method: r.method, headers: r.headers, body: r.body });
      return { status: res.status, body: await res.text() };
    }
    case "sleep_ms":
      await new Promise((ok) => setTimeout(ok, a.ms));
      return null;
    case "mail_send":
      return null;
    case "mail_fetch":
      return [];
    case "notify_test":
    case "notify_send":
    case "capture_hide":
    case "open_main":
      return null;
    case "sticky_open": {
      const list: string[] = JSON.parse(localStorage.getItem("ruangku-setting-sticky_list") || "[]");
      if (!list.includes(a.id)) localStorage.setItem("ruangku-setting-sticky_list", JSON.stringify([...list, a.id]));
      return null;
    }
    case "sticky_close": {
      const list: string[] = JSON.parse(localStorage.getItem("ruangku-setting-sticky_list") || "[]");
      localStorage.setItem("ruangku-setting-sticky_list", JSON.stringify(list.filter((x) => x !== a.id)));
      return null;
    }
    case "sticky_list":
      return JSON.parse(localStorage.getItem("ruangku-setting-sticky_list") || "[]");
    case "sticky_set_layer":
      return null;
    case "sticky_layer":
      return "normal";
    case "widget_set_size":
    case "widget_snap":
    case "widget_config":
    case "widget_set_visible":
    case "widget_set_layer":
    case "widget_set_click_through":
    case "widget_set_effect":
    case "widget_reset_position": {
      const cur = JSON.parse(localStorage.getItem("ruangku-setting-widget_window") || "null") ?? { visible: false, layer: "desktop", clickThrough: false, effect: "none", x: null, y: null, width: 340, height: 600 };
      if (cmd === "widget_set_visible") cur.visible = a.visible;
      if (cmd === "widget_set_layer") cur.layer = a.layer;
      if (cmd === "widget_set_click_through") cur.clickThrough = a.enabled;
      if (cmd === "widget_set_effect") cur.effect = a.effect;
      if (cmd === "widget_set_size") Object.assign(cur, { width: a.width, height: a.height });
      localStorage.setItem("ruangku-setting-widget_window", JSON.stringify(cur));
      if (cmd !== "widget_config") emit("widget-config", cur);
      return cur;
    }
    case "backups_list":
      return JSON.parse(localStorage.getItem("ruangku-preview-backups") || "[]");
    case "backups_dir":
      return "C:\\Users\\Saya\\AppData\\Roaming\\com.ruangku.app\\backups";
    case "backup_now": {
      const list = JSON.parse(localStorage.getItem("ruangku-preview-backups") || "[]");
      const name = `manual-${new Date().toISOString().slice(0, 19).replace(/[-:T]/g, "").replace(/^(\d{8})/, "$1-")}.json`;
      list.unshift({ name, size: JSON.stringify(rows).length, modified: Date.now(), auto: false });
      localStorage.setItem("ruangku-preview-backups", JSON.stringify(list));
      return name;
    }
    case "backup_restore":
      return 0;
    case "secret_set":
      localStorage.setItem(`ruangku-secret-${a.key}`, a.value);
      return "db";
    case "secret_get":
      return localStorage.getItem(`ruangku-secret-${a.key}`) || null;
    case "secret_store":
      return "penyimpanan browser (pratinjau)";
    case "oauth_loopback":
      throw "Login Google hanya bisa di aplikasi desktop.";
    case "open_url":
      window.open(a.url, "_blank");
      return null;
    case "write_text_file":
    case "log_write":
    case "team_realtime_start":
    case "team_realtime_stop":
      return null;
    case "read_text_file":
      throw "Tidak tersedia di pratinjau.";
    case "mcp_start":
      mcpMock = { running: true, port: Number(a.port) || 47821, url: `http://127.0.0.1:${Number(a.port) || 47821}/mcp`, error: null, requests: 0 };
      return mcpMock;
    case "mcp_stop":
      mcpMock = { running: false, port: 0, url: "", error: null, requests: 0 };
      return mcpMock;
    case "mcp_status":
      return mcpMock;
    case "mcp_respond":
      return null;
    case "set_zoom":
      return null;
    case "app_exe_path":
      return "C:\\Program Files\\Ruangku\\ruangku.exe";
    case "log_tail":
      return ["2026-10-26 08:00:01 [INFO] Ruangku 0.4.0 dimulai", "2026-10-26 08:00:02 [INFO] Backup otomatis dibuat: otomatis-20261026-080002.json"];
    case "diagnostics": {
      const kinds = new Map<string, number>();
      for (const r of rows) if (!r.deleted) kinds.set(r.kind, (kinds.get(r.kind) ?? 0) + 1);
      return { version: "0.4.0", os: "pratinjau", arch: "web", dataDir: "(localStorage)", dbBytes: JSON.stringify(rows).length, records: [...kinds].sort((x, y) => y[1] - x[1]), tombstones: rows.filter((r) => r.deleted).length, settings: 0, backups: 0, lastBackup: null, secretStore: "penyimpanan browser", integrity: "ok" };
    }
  }
  throw `Perintah tidak dikenal: ${cmd}`;
}
