// Uji asap Ruangku di Windows sungguhan (dijalankan di GitHub Actions setelah build).
//
// Memasang installer NSIS secara diam-diam, menjalankan Ruangku dengan port debug WebView2
// (hanya 127.0.0.1), lalu lewat Chrome DevTools Protocol:
//   - membuka setiap halaman dan memastikan isinya tampil tanpa galat JavaScript;
//   - membuka widget, sticky note, layar istirahat, dan catat cepat, sambil memastikan aplikasi
//     tetap menjawab (regresi "semua halaman kosong" karena jendela dibuat di utas utama);
//   - menutup paksa lalu membuka lagi dengan widget & sticky note aktif;
//   - membuka salinan kedua (harus langsung keluar dan menyerahkan ke salinan pertama);
//   - memasang ulang di atas versi yang sedang berjalan, memastikan data tetap ada;
//   - mencopot, memastikan data pengguna tidak ikut terhapus.
// Gagal bila ada langkah yang macet, galat JavaScript, atau baris "BUG:"/"PANIC" di log aplikasi.
//
// Pemakaian: node scripts/smoke-windows.mjs <Ruangku_x.y.z_x64-setup.exe> [folder keluaran] [Ruangku_x.y.z_x64.msi]
// Bila .msi diberikan, uji dimulai dengan salinan .msi lama yang sedang berjalan, lalu installer
// baru (/S /REMOVEMSI) harus menutup dan mencopotnya.

import { spawn, execFileSync } from "node:child_process";
import { existsSync, mkdirSync, openSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const setup = process.argv[2];
const outDir = process.argv[3] || "smoke-output";
const msi = process.argv[4];
const MSI_EXE = join(process.env.ProgramFiles || "C:\\Program Files", "Ruangku", "ruangku.exe");
const PORT = 9229;
const LOCAL = process.env.LOCALAPPDATA;
const DATA = join(process.env.APPDATA, "com.ruangku.app");
const EXE = join(LOCAL, "Ruangku", "ruangku.exe");
const LOG = join(DATA, "logs", "ruangku.log");
const PAGES = ["today", "tasks", "calendar", "schedule", "projects", "meetings", "courses", "notes", "files", "ledger", "okr", "kpi", "review", "ibadah", "team", "assistant", "guide", "settings"];

mkdirSync(outDir, { recursive: true });
const results = [];
const problems = [];
const t0 = Date.now();
const log = (m) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1).padStart(6)} s] ${m}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function withTimeout(p, ms, label) {
  let t;
  return Promise.race([p.finally(() => clearTimeout(t)), new Promise((_, j) => (t = setTimeout(() => j(new Error(`${label}: tidak selesai dalam ${ms / 1000} detik`)), ms)))]);
}

async function step(name, fn) {
  const s = Date.now();
  try {
    const detail = await fn();
    results.push({ name, ok: true, ms: Date.now() - s, detail });
    log(`OK    ${name}${detail ? ` (${detail})` : ""}`);
  } catch (e) {
    results.push({ name, ok: false, ms: Date.now() - s, detail: e.message });
    problems.push(`${name}: ${e.message}`);
    log(`GAGAL ${name}: ${e.message}`);
  }
}

async function waitFor(fn, ms, label, every = 500) {
  const end = Date.now() + ms;
  let last;
  while (Date.now() < end) {
    try {
      const v = await fn();
      if (v) return v;
    } catch (e) {
      last = e;
    }
    await sleep(every);
  }
  throw new Error(`${label}: tidak tercapai dalam ${ms / 1000} detik${last ? ` (${last.message})` : ""}`);
}

// ---------------------------------------------------------------- DevTools Protocol
class Cdp {
  constructor(url) {
    this.url = url;
    this.id = 0;
    this.waiters = new Map();
    this.exceptions = [];
    this.consoleErrors = [];
  }
  open() {
    return withTimeout(
      new Promise((resolve, reject) => {
        this.ws = new WebSocket(this.url);
        this.ws.onopen = () => resolve(this);
        this.ws.onerror = () => reject(new Error(`gagal terhubung ke ${this.url}`));
        this.ws.onmessage = (m) => {
          const o = JSON.parse(typeof m.data === "string" ? m.data : m.data.toString());
          if (o.id && this.waiters.has(o.id)) {
            this.waiters.get(o.id)(o);
            this.waiters.delete(o.id);
          } else if (o.method === "Runtime.exceptionThrown") {
            const d = o.params.exceptionDetails;
            this.exceptions.push(`${d.text} ${d.exception?.description ?? ""} @${d.url ?? ""}:${d.lineNumber ?? ""}`.trim());
          } else if (o.method === "Runtime.consoleAPICalled" && o.params.type === "error") {
            this.consoleErrors.push(o.params.args.map((a) => a.value ?? a.description ?? "").join(" "));
          }
        };
      }),
      10000,
      "WebSocket DevTools",
    );
  }
  send(method, params = {}, ms = 20000) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return withTimeout(new Promise((r) => this.waiters.set(id, r)), ms, method);
  }
  async eval(expression, ms = 20000) {
    const r = await this.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }, ms);
    if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description ?? r.result.exceptionDetails.text);
    return r.result?.result?.value;
  }
  /** Panggil perintah backend Ruangku dari dalam halaman, dengan batas waktu. */
  invoke(cmd, args = {}, ms = 15000) {
    const expr = `window.__TAURI_INTERNALS__.invoke(${JSON.stringify(cmd)}, ${JSON.stringify(args)}).then((v) => JSON.stringify(v ?? null))`;
    return withTimeout(this.eval(expr, ms + 5000), ms, `perintah ${cmd}`).then((v) => JSON.parse(v));
  }
  async shot(name) {
    try {
      const r = await this.send("Page.captureScreenshot", { format: "png" }, 20000);
      if (r.result?.data) writeFileSync(join(outDir, `${name}.png`), Buffer.from(r.result.data, "base64"));
    } catch {
      /* gambar hanya pelengkap */
    }
  }
  close() {
    try {
      this.ws.close();
    } catch {
      /* sudah tertutup */
    }
  }
}

async function targets() {
  const r = await fetch(`http://127.0.0.1:${PORT}/json`);
  return (await r.json()).filter((t) => t.type === "page" && t.webSocketDebuggerUrl);
}

/** Jenis setiap jendela WebView yang terbuka: main, widget, sticky, break, capture. */
async function windowKinds() {
  const out = [];
  for (const t of await targets()) {
    const c = new Cdp(t.webSocketDebuggerUrl);
    try {
      await c.open();
      const v = await c.eval(
        `(window.__RUANGKU_WIDGET__ ? "widget" : window.__RUANGKU_STICKY__ ? "sticky" : window.__RUANGKU_BREAK__ ? "break" : window.__RUANGKU_CAPTURE__ ? "capture" : "main") + "|" + (document.getElementById("root")?.childElementCount ?? 0)`,
        5000,
      );
      const [kind, n] = v.split("|");
      out.push({ kind, rendered: Number(n) > 0 });
    } catch {
      /* target bisa hilang saat diperiksa */
    } finally {
      c.close();
    }
  }
  return out;
}

async function expectWindow(kind) {
  return waitFor(async () => (await windowKinds()).some((w) => w.kind === kind && w.rendered), 30000, `jendela ${kind} tampil dan terisi`);
}

// ---------------------------------------------------------------- Proses
function running() {
  try {
    return execFileSync("tasklist", ["/FI", "IMAGENAME eq ruangku.exe", "/NH"], { encoding: "utf8" }).toLowerCase().includes("ruangku.exe");
  } catch {
    return false;
  }
}

async function portClosed() {
  try {
    await fetch(`http://127.0.0.1:${PORT}/json/version`);
    return false;
  } catch {
    return true;
  }
}

async function killApp() {
  try {
    execFileSync("taskkill", ["/IM", "ruangku.exe", "/F", "/T"], { stdio: "ignore" });
  } catch {
    /* tidak berjalan */
  }
  await waitFor(() => !running(), 20000, "Ruangku berhenti");
  await waitFor(portClosed, 30000, "WebView2 ikut berhenti");
  await sleep(1500);
}

function sh(cmd, args) {
  try {
    return execFileSync(cmd, args, { encoding: "utf8", timeout: 30000, stdio: ["ignore", "pipe", "pipe"] });
  } catch (e) {
    return `${e.stdout ?? ""}${e.stderr ?? ""}` || e.message;
  }
}

/** Keadaan proses, WebView2, jendela, dan log saat sebuah langkah gagal. */
function diag(label, outFile) {
  console.log(`----- Diagnostik: ${label}`);
  console.log(sh("tasklist", ["/FI", "IMAGENAME eq ruangku.exe"]).trim());
  console.log(sh("tasklist", ["/FI", "IMAGENAME eq msedgewebview2.exe"]).trim().split(/\r?\n/).slice(0, 6).join("\n"));
  for (const key of ["HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\EdgeUpdate\\Clients\\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}", "HKCU\\SOFTWARE\\Microsoft\\EdgeUpdate\\Clients\\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}"]) {
    console.log(`WebView2 ${key.split("\\")[0]}: ${sh("reg", ["query", key, "/v", "pv"]).trim().split(/\r?\n/).pop()}`);
  }
  console.log(sh("powershell", ["-NoProfile", "-Command", "Get-Process ruangku,msedgewebview2 -ErrorAction SilentlyContinue | Select-Object ProcessName,Id,SessionId,Responding,MainWindowTitle | Format-Table -AutoSize | Out-String -Width 200"]).trim());
  if (outFile && existsSync(outFile)) console.log(`stdout/stderr Ruangku:\n${readFileSync(outFile, "utf8").slice(-3000)}`);
  if (existsSync(LOG)) console.log(`Log Ruangku:\n${readFileSync(LOG, "utf8").split(/\r?\n/).slice(-30).join("\n")}`);
  console.log("-----");
}

let main = null;
let launches = 0;

async function launch(label) {
  if (main) main.close();
  main = null;
  const env = { ...process.env, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${PORT} --remote-allow-origins=*` };
  const outFile = join(outDir, `ruangku-keluaran-${++launches}.txt`);
  const fd = openSync(outFile, "a");
  const child = spawn(EXE, [], { env, detached: true, stdio: ["ignore", fd, fd] });
  child.on("exit", (code) => log(`ruangku.exe (${label}) keluar dengan kode ${code}`));
  child.unref();
  const t = await waitFor(async () => {
    for (const x of await targets()) {
      const c = new Cdp(x.webSocketDebuggerUrl);
      try {
        await c.open();
        if (await c.eval(`!!document.querySelector("aside.sidebar")`, 5000)) return c;
      } catch {
        /* belum siap */
      }
      c.close();
    }
    return null;
  }, 90000, `${label}: jendela utama tampil`).catch((e) => {
    diag(label, outFile);
    throw e;
  });
  main = t;
  await main.send("Runtime.enable");
  await main.send("Page.enable");
  return main;
}

async function responsive(label) {
  const s = Date.now();
  await main.invoke("records_count", {}, 5000);
  const ms = Date.now() - s;
  if (ms > 3000) throw new Error(`${label}: backend lambat menjawab (${ms} ms)`);
  return ms;
}

async function go(page) {
  await main.eval(`window.dispatchEvent(new CustomEvent("ruangku-go", { detail: ${JSON.stringify(page)} })); true`, 5000);
  return waitFor(
    () => main.eval(`(() => { const m = document.querySelector("main.main"); const h = m && m.querySelector("h1"); return h && !m.querySelector(".page-loading") && !document.querySelector(".stall-banner") ? h.textContent.trim() : ""; })()`, 5000),
    20000,
    `halaman ${page} tampil`,
  );
}

function install(label, extra = []) {
  return new Promise((resolve, reject) => {
    const p = spawn(setup, ["/S", ...extra], { stdio: "ignore" });
    const t = setTimeout(() => {
      p.kill();
      reject(new Error(`${label}: installer tidak selesai dalam 180 detik`));
    }, 180000);
    p.on("exit", (code) => {
      clearTimeout(t);
      if (code !== 0) return reject(new Error(`${label}: installer keluar dengan kode ${code}`));
      if (!existsSync(EXE)) return reject(new Error(`${label}: ${EXE} tidak ada setelah instalasi`));
      resolve(`kode 0`);
    });
  });
}

// ---------------------------------------------------------------- Skenario
if (!setup || !existsSync(setup)) {
  console.error("Pemakaian: node scripts/smoke-windows.mjs <installer.exe> [folder keluaran]");
  process.exit(2);
}

if (msi && existsSync(msi)) {
  await step("Siapkan salinan .msi lama yang sedang berjalan", async () => {
    const code = await withTimeout(new Promise((r) => spawn("msiexec", ["/i", msi, "/qn", "/norestart"], { stdio: "ignore" }).on("exit", r)), 300000, "msiexec /i");
    if (code !== 0 && code !== 3010) throw new Error(`msiexec /i keluar dengan kode ${code}`);
    if (!existsSync(MSI_EXE)) throw new Error(`${MSI_EXE} tidak ada`);
    spawn(MSI_EXE, [], { detached: true, stdio: "ignore" }).unref();
    await waitFor(running, 30000, "salinan .msi berjalan");
    await sleep(5000);
  });
  await step("Pasang installer: salinan .msi lama ditutup dan dicopot", async () => {
    const r = await install("Pasang", ["/REMOVEMSI"]);
    await waitFor(() => !existsSync(MSI_EXE), 120000, "salinan .msi terhapus");
    return r;
  });
} else {
  await step("Pasang installer (diam-diam)", () => install("Pasang"));
}
await killApp(); // installer tidak menjalankan aplikasi dalam mode diam, tetapi pastikan bersih.

await step("Start pertama: jendela utama tampil", async () => {
  await launch("Start pertama");
  return `${await responsive("Start pertama")} ms`;
});

if (main) {
  for (const page of PAGES) await step(`Halaman ${page}`, () => go(page));
  await main.shot("halaman-akhir");

  await step("Simpan dan baca catatan", async () => {
    await main.invoke("record_save", { id: "uji-asap-catatan", kind: "note", data: { title: "Catatan uji asap", body: "Dibuat oleh uji asap Windows." } });
    const list = await main.invoke("records_list", { kind: "note" });
    if (!list.some((r) => r.id === "uji-asap-catatan")) throw new Error("catatan tidak ditemukan setelah disimpan");
  });

  await step("Widget: tampilkan", async () => {
    const cfg = await main.invoke("widget_set_visible", { visible: true }, 20000);
    if (!cfg.visible) throw new Error("konfigurasi widget tidak tersimpan");
    await expectWindow("widget");
    await go("tasks");
    return `aplikasi tetap menjawab (${await responsive("Widget")} ms)`;
  });

  await step("Sticky note: buka", async () => {
    await main.invoke("sticky_open", { id: "uji-asap-catatan" }, 20000);
    await expectWindow("sticky");
    await go("notes");
    return `aplikasi tetap menjawab (${await responsive("Sticky")} ms)`;
  });

  await step("Catat cepat: buka dan tutup", async () => {
    await main.invoke("capture_open", {}, 20000);
    await expectWindow("capture");
    await main.invoke("capture_hide");
    return `aplikasi tetap menjawab (${await responsive("Catat cepat")} ms)`;
  });

  await step("Layar istirahat: mulai dan lewati", async () => {
    await main.invoke("break_action", { action: "start" }, 20000);
    await expectWindow("break");
    await main.invoke("break_action", { action: "skip" }, 20000);
    await go("today");
    return `aplikasi tetap menjawab (${await responsive("Istirahat")} ms)`;
  });

  await step("Buka jendela utama dari widget", async () => {
    await main.invoke("open_main", { page: "ledger" }, 20000);
    return `${await responsive("open_main")} ms`;
  });

  await step("Salinan kedua langsung keluar", async () => {
    const p = spawn(EXE, [], { stdio: "ignore" });
    const code = await withTimeout(new Promise((r) => p.on("exit", r)), 20000, "salinan kedua");
    await responsive("Setelah salinan kedua");
    return `kode keluar ${code}`;
  });

  const exceptionsRun1 = [...main.exceptions];
  await main.shot("sebelum-tutup-paksa");
  await step("Tidak ada galat JavaScript (start pertama)", async () => {
    if (exceptionsRun1.length) throw new Error(exceptionsRun1.slice(0, 5).join(" | "));
  });
}

await step("Tutup paksa lalu buka lagi (widget & sticky note dipulihkan)", async () => {
  await killApp();
  await launch("Start ulang");
  await responsive("Start ulang");
  await expectWindow("widget");
  await expectWindow("sticky");
  await go("notes");
  return `${await responsive("Start ulang")} ms`;
});

await step("Pasang ulang saat Ruangku berjalan", async () => {
  const r = await install("Pasang ulang");
  await waitFor(() => !running(), 30000, "installer menutup Ruangku yang berjalan");
  await waitFor(portClosed, 30000, "WebView2 ikut berhenti");
  return r;
});

await step("Start setelah pasang ulang: data tetap ada", async () => {
  await launch("Setelah pasang ulang");
  const list = await main.invoke("records_list", { kind: "note" });
  if (!list.some((r) => r.id === "uji-asap-catatan")) throw new Error("catatan hilang setelah pasang ulang");
  await main.invoke("widget_set_visible", { visible: false }, 20000);
  await main.invoke("sticky_close", { id: "uji-asap-catatan" });
  await go("today");
  await main.shot("setelah-pasang-ulang");
  if (main.exceptions.length) throw new Error(`galat JavaScript: ${main.exceptions.slice(0, 5).join(" | ")}`);
  return `${await responsive("Setelah pasang ulang")} ms`;
});

await killApp();

await step("Copot (diam-diam), data pengguna tetap ada", async () => {
  const un = join(LOCAL, "Ruangku", "uninstall.exe");
  if (!existsSync(un)) throw new Error("uninstall.exe tidak ditemukan");
  await withTimeout(new Promise((r) => spawn(un, ["/S"], { stdio: "ignore" }).on("exit", r)), 120000, "uninstaller");
  await waitFor(() => !existsSync(EXE), 60000, "ruangku.exe terhapus");
  if (!existsSync(join(DATA, "ruangku.db"))) throw new Error("database pengguna ikut terhapus");
});

let logText = "";
await step("Log aplikasi bersih (tanpa BUG/PANIC)", async () => {
  logText = existsSync(LOG) ? readFileSync(LOG, "utf8") : "";
  const bad = logText.split(/\r?\n/).filter((l) => /BUG:|\[PANIC\]/.test(l));
  if (bad.length) throw new Error(bad.slice(0, 5).join(" | "));
  return `${logText.split(/\r?\n/).filter(Boolean).length} baris`;
});

if (main) main.close();

// ---------------------------------------------------------------- Laporan
const lines = [
  "## Uji asap Windows",
  "",
  "| Langkah | Hasil | Waktu |",
  "| --- | --- | --- |",
  ...results.map((r) => `| ${r.name} | ${r.ok ? "lulus" : `**gagal**: ${r.detail}`}${r.ok && r.detail ? ` (${r.detail})` : ""} | ${(r.ms / 1000).toFixed(1)} s |`),
  "",
  problems.length ? `**${problems.length} langkah gagal.**` : `Semua ${results.length} langkah lulus.`,
  "",
  "<details><summary>Log Ruangku</summary>",
  "",
  "```",
  logText.trim().split(/\r?\n/).slice(-60).join("\n"),
  "```",
  "</details>",
];
writeFileSync(join(outDir, "laporan.md"), lines.join("\n"), "utf8");
if (process.env.GITHUB_STEP_SUMMARY) writeFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join("\n") + "\n", { flag: "a" });
console.log("\n" + lines.slice(0, results.length + 6).join("\n"));
console.log(`\nLog Ruangku:\n${logText.trim().split(/\r?\n/).slice(-40).join("\n")}`);
for (const p of problems) console.log(`::error title=Uji asap Windows::${p.replace(/\r?\n/g, " ")}`);
process.exit(problems.length ? 1 : 0);
