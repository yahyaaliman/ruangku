// Uji mandiri di dalam aplikasi. Hanya berjalan bila Ruangku dijalankan dengan variabel
// lingkungan RUANGKU_SELFTEST (dipakai scripts/smoke-windows.mjs di runner Windows CI).
// Setiap langkah memastikan aplikasi tetap menjawab, karena regresi yang paling berbahaya
// adalah backend macet setelah sebuah jendela dibuat sehingga semua halaman kosong.
import { api } from "./api";

export interface SelfTestStep {
  name: string;
  ok: boolean;
  ms: number;
  detail?: string;
}

export const SELFTEST_NOTE_ID = "uji-asap-catatan";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  let t: ReturnType<typeof setTimeout>;
  return Promise.race([
    p.finally(() => clearTimeout(t)),
    new Promise<never>((_, j) => (t = setTimeout(() => j(new Error(`${label}: tidak selesai dalam ${ms / 1000} detik`)), ms))),
  ]);
}

async function waitFor<T>(fn: () => T | Promise<T>, ms: number, label: string): Promise<T> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const v = await fn();
    if (v) return v;
    await sleep(250);
  }
  throw new Error(`${label}: tidak tercapai dalam ${ms / 1000} detik`);
}

/** Backend harus menjawab perintah ringan dalam 3 detik. */
async function responsive(label: string) {
  const s = Date.now();
  await withTimeout(api.countRecords(), 5000, `${label}: backend`);
  const ms = Date.now() - s;
  if (ms > 3000) throw new Error(`${label}: backend lambat menjawab (${ms} ms)`);
  return `backend menjawab dalam ${ms} ms`;
}

function pageShown(): string {
  const m = document.querySelector("main.main");
  const h = m?.querySelector("h1");
  if (!m || !h || m.querySelector(".page-loading") || document.querySelector(".stall-banner")) return "";
  return h.textContent?.trim() || "";
}

async function go(page: string) {
  window.dispatchEvent(new CustomEvent("ruangku-go", { detail: page }));
  await sleep(150);
  return waitFor(() => {
    const err = document.querySelector("main.main .err-box .err-msg");
    if (err) throw new Error(`halaman ${page} gagal tampil: ${err.textContent}`);
    return pageShown();
  }, 20000, `halaman ${page} tampil`);
}

async function windowShown(kind: string) {
  await waitFor(async () => (await api.windowsReady()).includes(kind), 30000, `jendela ${kind} tampil`);
}

export async function runSelfTest(phase: string, pages: string[]) {
  const steps: SelfTestStep[] = [];
  const errors: string[] = [];
  const onError = (e: ErrorEvent) => errors.push(`${e.message} @ ${e.filename}:${e.lineno}`);
  const onRejection = (e: PromiseRejectionEvent) => errors.push(`promise: ${e.reason instanceof Error ? e.reason.message : String(e.reason)}`);
  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onRejection);

  const step = async (name: string, fn: () => Promise<string | void>) => {
    const s = Date.now();
    try {
      const detail = await fn();
      steps.push({ name, ok: true, ms: Date.now() - s, detail: detail || undefined });
    } catch (e) {
      steps.push({ name, ok: false, ms: Date.now() - s, detail: e instanceof Error ? e.message : String(e) });
    }
  };

  await step("Jendela utama tampil dan backend menjawab", async () => {
    await waitFor(() => document.querySelector("aside.sidebar"), 30000, "sidebar tampil");
    return responsive("Start");
  });

  if (phase === "full") {
    for (const page of pages) await step(`Halaman ${page}`, async () => `judul "${await go(page)}"`);
    await step("Simpan dan baca catatan", async () => {
      await api.save(SELFTEST_NOTE_ID, "note", { title: "Catatan uji asap", body: "Dibuat oleh uji asap Windows." });
      const list = await api.list("note");
      if (!list.some((r) => r.id === SELFTEST_NOTE_ID)) throw new Error("catatan tidak ditemukan setelah disimpan");
    });
    await step("Widget: tampilkan", async () => {
      const cfg = await withTimeout(api.widgetSetVisible(true), 20000, "widget_set_visible");
      if (!cfg.visible) throw new Error("konfigurasi widget tidak tersimpan");
      await windowShown("widget");
      await go("tasks");
      return responsive("Widget");
    });
    await step("Sticky note: buka", async () => {
      await withTimeout(api.stickyOpen(SELFTEST_NOTE_ID), 20000, "sticky_open");
      await windowShown("sticky");
      await go("notes");
      return responsive("Sticky note");
    });
    await step("Catat cepat: buka dan tutup", async () => {
      await withTimeout(api.captureOpen(), 20000, "capture_open");
      await windowShown("catat-cepat");
      await api.captureHide();
      return responsive("Catat cepat");
    });
    await step("Layar istirahat: mulai dan lewati", async () => {
      await withTimeout(api.breakAction("start"), 20000, "break_action start");
      await windowShown("istirahat");
      await withTimeout(api.breakAction("skip"), 20000, "break_action skip");
      await go("today");
      return responsive("Layar istirahat");
    });
    await step("Buka jendela utama dari widget", async () => {
      await withTimeout(api.openMain("ledger"), 20000, "open_main");
      return responsive("open_main");
    });
  }

  if (phase === "restore") {
    await step("Widget dan sticky note dipulihkan saat start", async () => {
      await windowShown("widget");
      await windowShown("sticky");
      await go("notes");
      return responsive("Pemulihan");
    });
  }

  if (phase === "verify") {
    await step("Data tetap ada setelah pasang ulang", async () => {
      const list = await api.list("note");
      if (!list.some((r) => r.id === SELFTEST_NOTE_ID)) throw new Error("catatan uji hilang");
    });
    await step("Tutup widget dan sticky note", async () => {
      await withTimeout(api.widgetSetVisible(false), 20000, "widget_set_visible(false)");
      await api.stickyClose(SELFTEST_NOTE_ID);
      await go("today");
      return responsive("Tutup jendela");
    });
  }

  await step("Tidak ada galat JavaScript", async () => {
    if (errors.length) throw new Error(errors.slice(0, 5).join(" | "));
  });

  window.removeEventListener("error", onError);
  window.removeEventListener("unhandledrejection", onRejection);
  await api.selftestReport(JSON.stringify({ phase, steps }, null, 2));
}
