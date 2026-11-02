// Uji asap Ruangku di Windows sungguhan (dijalankan di GitHub Actions setelah build).
//
// Skrip ini mengurus hal di luar aplikasi: memasang, menjalankan, menutup paksa, memasang ulang,
// dan mencopot. Pemeriksaan di dalam aplikasi dilakukan oleh uji mandiri Ruangku sendiri
// (src/lib/selftest.ts), yang aktif bila variabel lingkungan RUANGKU_SELFTEST berisi path berkas
// laporan. Tahapan:
//   full    : buka setiap halaman, simpan catatan, buka widget, sticky note, catat cepat, dan
//             layar istirahat sambil memastikan backend tetap menjawab (regresi "semua halaman
//             kosong" karena jendela dibuat di utas utama).
//   restore : setelah ditutup paksa, widget dan sticky note harus dipulihkan saat start.
//   verify  : setelah dipasang ulang saat berjalan, data harus tetap ada.
// Ditambah: salinan kedua harus langsung keluar, installer harus mencopot salinan .msi lama, dan
// log aplikasi tidak boleh berisi "BUG:", "[PANIC]", atau galat JavaScript dari jendela mana pun.
//
// Pemakaian: node scripts/smoke-windows.mjs <Ruangku_x.y.z_x64-setup.exe> [folder keluaran] [Ruangku_x.y.z_x64.msi]

import { spawn, execFileSync } from "node:child_process";
import { existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const setup = process.argv[2];
const outDir = process.argv[3] || "smoke-output";
const msi = process.argv[4];
const LOCAL = process.env.LOCALAPPDATA;
const DATA = join(process.env.APPDATA, "com.ruangku.app");
const EXE = join(LOCAL, "Ruangku", "ruangku.exe");
const MSI_EXE = join(process.env.ProgramFiles || "C:\\Program Files", "Ruangku", "ruangku.exe");
const LOG = join(DATA, "logs", "ruangku.log");

mkdirSync(outDir, { recursive: true });
const results = [];
const problems = [];
const t0 = Date.now();
const log = (m) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1).padStart(6)} s] ${m}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function record(name, ok, ms, detail) {
  results.push({ name, ok, ms, detail });
  if (!ok) problems.push(`${name}: ${detail}`);
  log(`${ok ? "OK   " : "GAGAL"} ${name}${detail ? ` (${detail})` : ""}`);
}

async function step(name, fn) {
  const s = Date.now();
  try {
    record(name, true, Date.now() - s, await fn());
  } catch (e) {
    record(name, false, Date.now() - s, e.message);
  }
}

function withTimeout(p, ms, label) {
  let t;
  return Promise.race([p.finally(() => clearTimeout(t)), new Promise((_, j) => (t = setTimeout(() => j(new Error(`${label}: tidak selesai dalam ${ms / 1000} detik`)), ms)))]);
}

async function waitFor(fn, ms, label, every = 500) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await fn()) return true;
    await sleep(every);
  }
  throw new Error(`${label}: tidak tercapai dalam ${ms / 1000} detik`);
}

function sh(cmd, args) {
  try {
    return execFileSync(cmd, args, { encoding: "utf8", timeout: 30000, stdio: ["ignore", "pipe", "pipe"] });
  } catch (e) {
    return `${e.stdout ?? ""}${e.stderr ?? ""}` || e.message;
  }
}

function running() {
  return sh("tasklist", ["/FI", "IMAGENAME eq ruangku.exe", "/NH"]).toLowerCase().includes("ruangku.exe");
}

/** Jendela utama Ruangku menjawab pesan Windows (bukan "Not responding"). */
function windowResponding() {
  return sh("powershell", ["-NoProfile", "-Command", "(Get-Process ruangku -ErrorAction SilentlyContinue | Where-Object MainWindowTitle -eq 'Ruangku' | Select-Object -First 1).Responding"]).trim() === "True";
}

function appLog() {
  return existsSync(LOG) ? readFileSync(LOG, "utf8") : "";
}

function diag(label, outFile) {
  console.log(`----- Diagnostik: ${label}`);
  console.log(sh("powershell", ["-NoProfile", "-Command", "Get-Process ruangku,msedgewebview2 -ErrorAction SilentlyContinue | Select-Object ProcessName,Id,SessionId,Responding,MainWindowTitle | Format-Table -AutoSize | Out-String -Width 200"]).trim());
  if (outFile && existsSync(outFile)) console.log(`Keluaran ruangku.exe:\n${readFileSync(outFile, "utf8").slice(-3000)}`);
  console.log(`Log Ruangku:\n${appLog().split(/\r?\n/).slice(-30).join("\n")}`);
  console.log("-----");
}

async function killApp() {
  sh("taskkill", ["/IM", "ruangku.exe", "/F", "/T"]);
  await waitFor(() => !running(), 30000, "Ruangku berhenti");
  await sleep(2000); // beri waktu proses WebView2 ikut berhenti
}

let launches = 0;

/** Jalankan Ruangku dengan uji mandiri tahap `phase` dan catat hasilnya. */
async function runPhase(phase, ms) {
  const report = join(outDir, `laporan-${phase}.json`);
  rmSync(report, { force: true });
  const outFile = join(outDir, `ruangku-keluaran-${++launches}.txt`);
  const fd = openSync(outFile, "a");
  const env = { ...process.env, RUANGKU_SELFTEST: report, RUANGKU_SELFTEST_PHASE: phase };
  const child = spawn(EXE, [], { env, detached: true, stdio: ["ignore", fd, fd] });
  child.on("exit", (code) => log(`ruangku.exe (${phase}) keluar dengan kode ${code}`));
  child.unref();
  try {
    await waitFor(() => existsSync(report), ms, `laporan uji mandiri tahap ${phase}`);
    await sleep(300);
    const r = JSON.parse(readFileSync(report, "utf8"));
    for (const s of r.steps) record(`[${phase}] ${s.name}`, s.ok, s.ms, s.detail);
    if (r.steps.some((s) => !s.ok)) diag(phase, outFile);
  } catch (e) {
    record(`[${phase}] uji mandiri`, false, ms, e.message);
    diag(phase, outFile);
  }
}

function install(label, extra = []) {
  return withTimeout(
    new Promise((resolve, reject) => {
      const p = spawn(setup, ["/S", ...extra], { stdio: "ignore" });
      p.on("exit", (code) => {
        if (code !== 0) return reject(new Error(`${label}: installer keluar dengan kode ${code}`));
        if (!existsSync(EXE)) return reject(new Error(`${label}: ${EXE} tidak ada setelah instalasi`));
        resolve("kode 0");
      });
    }),
    180000,
    `${label}: installer`,
  );
}

// ---------------------------------------------------------------- Skenario
if (!setup || !existsSync(setup)) {
  console.error("Pemakaian: node scripts/smoke-windows.mjs <installer.exe> [folder keluaran] [installer.msi]");
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
await killApp();

await runPhase("full", 300000);

await step("Salinan kedua langsung keluar, jendela pertama tetap menjawab", async () => {
  const p = spawn(EXE, [], { stdio: "ignore" });
  const code = await withTimeout(new Promise((r) => p.on("exit", r)), 20000, "salinan kedua");
  await sleep(1000);
  if (!windowResponding()) throw new Error("jendela utama tidak menjawab setelah salinan kedua dibuka");
  return `kode keluar ${code}`;
});

await step("Tutup paksa", killApp);
await runPhase("restore", 180000);

await step("Pasang ulang saat Ruangku berjalan", async () => {
  if (!running()) throw new Error("Ruangku tidak berjalan sebelum pasang ulang");
  const r = await install("Pasang ulang");
  await waitFor(() => !running(), 30000, "installer menutup Ruangku yang berjalan");
  await sleep(2000);
  return r;
});
await runPhase("verify", 180000);
await killApp();

await step("Copot (diam-diam), data pengguna tetap ada", async () => {
  const un = join(LOCAL, "Ruangku", "uninstall.exe");
  if (!existsSync(un)) throw new Error("uninstall.exe tidak ditemukan");
  await withTimeout(new Promise((r) => spawn(un, ["/S"], { stdio: "ignore" }).on("exit", r)), 120000, "uninstaller");
  await waitFor(() => !existsSync(EXE), 60000, "ruangku.exe terhapus");
  if (!existsSync(join(DATA, "ruangku.db"))) throw new Error("database pengguna ikut terhapus");
});

const logText = appLog();
await step("Log aplikasi bersih (tanpa BUG, PANIC, atau galat JavaScript)", async () => {
  const bad = logText.split(/\r?\n/).filter((l) => /BUG:|\[PANIC\]|\[ERROR\] \[(utama|widget|sticky|catat-cepat|istirahat)\]/.test(l));
  if (bad.length) throw new Error(bad.slice(0, 5).join(" | "));
  return `${logText.split(/\r?\n/).filter(Boolean).length} baris`;
});

// ---------------------------------------------------------------- Laporan
const lines = [
  "## Uji asap Windows",
  "",
  "| Langkah | Hasil | Waktu |",
  "| --- | --- | --- |",
  ...results.map((r) => `| ${r.name} | ${r.ok ? `lulus${r.detail ? ` (${r.detail})` : ""}` : `**gagal**: ${r.detail}`} | ${(r.ms / 1000).toFixed(1)} s |`),
  "",
  problems.length ? `**${problems.length} langkah gagal.**` : `Semua ${results.length} langkah lulus.`,
];
const logLines = ["", "<details><summary>Log Ruangku</summary>", "", "```", logText.trim().split(/\r?\n/).slice(-60).join("\n"), "```", "</details>"];
writeFileSync(join(outDir, "laporan.md"), [...lines, ...logLines].join("\n"), "utf8");
if (process.env.GITHUB_STEP_SUMMARY) writeFileSync(process.env.GITHUB_STEP_SUMMARY, [...lines, ...logLines].join("\n") + "\n", { flag: "a" });
console.log("\n" + lines.join("\n"));
console.log(`\nLog Ruangku:\n${logText.trim().split(/\r?\n/).slice(-40).join("\n")}`);
for (const p of problems) console.log(`::error title=Uji asap Windows::${p.replace(/\r?\n/g, " ")}`);
process.exit(problems.length ? 1 : 0);
