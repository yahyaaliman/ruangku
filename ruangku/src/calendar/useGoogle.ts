// Menjalankan sinkron Google Calendar di jendela utama dan menyediakan konfigurasinya ke UI.
import { useCallback, useEffect, useState } from "react";
import { api, errorText, onEvent } from "../lib/api";
import { dataOf, type Item, type TimeBlock } from "../lib/types";
import { strip } from "../lib/useRecords";
import { connectGoogle, DEFAULTS, GCAL_KEY, GCAL_STATE_KEY, GcalClient, syncGoogle, type GcalConfig, type SyncResult, type SyncState } from "./gcal";
import { writeCache, type CalSub } from "./sources";

const secrets = { get: (k: string) => api.secretGet(k), set: (k: string, v: string) => api.secretSet(k, v) };

export async function loadGcal(): Promise<GcalConfig | null> {
  try {
    const v = await api.getSetting(GCAL_KEY);
    return v ? (JSON.parse(v) as GcalConfig) : null;
  } catch {
    return null;
  }
}
export const saveGcal = (c: GcalConfig) => api.setSetting(GCAL_KEY, JSON.stringify(c));

export function useGcalConfig() {
  const [cfg, setCfg] = useState<GcalConfig | null>(null);
  useEffect(() => {
    loadGcal().then(setCfg);
    return onEvent<string>("setting-changed", (k) => k === GCAL_KEY && loadGcal().then(setCfg));
  }, []);
  return cfg;
}

export const gcalClient = (cfg: GcalConfig) => new GcalClient(cfg, (r) => api.http(r), secrets);

export async function connect(clientId: string, clientSecret: string, base?: Partial<GcalConfig>): Promise<GcalConfig> {
  const cur = (await loadGcal()) ?? { clientId, connected: false };
  const next = await connectGoogle({ ...cur, ...base, clientId: clientId.trim() }, clientSecret.trim(), { http: (r) => api.http(r), secrets, loopback: (url) => api.oauthLoopback(url, 300) });
  await saveGcal(next);
  return next;
}

export async function disconnect() {
  const cur = await loadGcal();
  await api.secretSet("gcal_refresh_token", "");
  await api.setSetting(GCAL_STATE_KEY, "");
  if (cur) await saveGcal({ ...cur, connected: false, email: undefined, lastError: undefined });
}

let running: Promise<SyncResult | null> | null = null;

/** Sinkron sekali (bergabung bila sedang berjalan). */
export function runGoogleSync(): Promise<SyncResult | null> {
  if (running) return running;
  running = (async () => {
    const cfg = await loadGcal();
    if (!cfg?.connected) return null;
    try {
      const raw = await api.getSetting(GCAL_STATE_KEY);
      const state: SyncState = raw ? JSON.parse(raw) : { pushed: {} };
      const blocks = (await api.list("timeblock")).map((r) => ({ ...dataOf<TimeBlock>(r.data), id: r.id, updatedAt: r.updatedAt })) as Item<TimeBlock>[];
      const subs = (await api.list("calsub")).map((r) => ({ ...dataOf<CalSub>(r.data), id: r.id }));
      const shown = subs.filter((s) => s.source === "google" && s.enabled && s.googleId).map((s) => ({ subId: s.id, calId: s.googleId! }));
      const res = await syncGoogle(cfg, state, {
        client: gcalClient(cfg),
        blocks,
        saveBlock: (b) => api.save(b.id, "timeblock", strip(b)),
        removeBlock: (id) => api.remove(id, "timeblock"),
        shown,
        writeCache: (subId, events) => writeCache(subId, { at: Date.now(), events }),
      });
      await api.setSetting(GCAL_STATE_KEY, JSON.stringify(state));
      await saveGcal({ ...cfg, lastSync: Date.now(), lastError: undefined });
      if (res.pushed || res.updatedLocal || res.removedLocal || res.removedRemote) api.log("INFO", `Google Calendar: ${res.pushed} dikirim, ${res.updatedLocal} diperbarui, ${res.removedLocal + res.removedRemote} dihapus`);
      return res;
    } catch (e) {
      api.log("ERROR", `Google Calendar: ${errorText(e)}`);
      await saveGcal({ ...cfg, lastError: errorText(e) });
      throw e;
    }
  })().finally(() => {
    running = null;
  });
  return running;
}

/** Pasang di jendela utama: sinkron tiap 10 menit dan 20 detik setelah blok berubah. */
export function useGoogleSyncLoop() {
  const tick = useCallback(() => runGoogleSync().catch(() => {}), []);
  useEffect(() => {
    let alive = true;
    let pending: number | undefined;
    const first = window.setTimeout(tick, 4000);
    (async () => {
      while (alive) {
        // sleep_ms dibatasi 2 menit per panggilan di backend.
        for (let i = 0; i < 5 && alive; i++) await api.sleep(120000);
        if (alive) await tick();
      }
    })();
    const stop = onEvent<string>("records-changed", (k) => {
      if (k !== "timeblock") return;
      window.clearTimeout(pending);
      pending = window.setTimeout(tick, 20000);
    });
    return () => {
      alive = false;
      stop();
      window.clearTimeout(first);
      window.clearTimeout(pending);
    };
  }, [tick]);
}

export { DEFAULTS };
