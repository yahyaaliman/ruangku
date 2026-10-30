import { useEffect } from "react";
import { api, errorText, isDesktop, onEvent } from "../lib/api";
import { useJsonSetting } from "../lib/useSetting";
import { ACCOUNT_KEY, CLIENT_KEY, DriveClient, loginAccount, portableSetting, REFRESH_KEY, syncAccount, type GoogleAccount } from "./drive";

const EMPTY: GoogleAccount = { clientId: "", connected: false };
const secrets = { get: api.secretGet, set: api.secretSet };
let operation: Promise<unknown> | null = null;
export function useAccount() { return useJsonSetting<GoogleAccount>(ACCOUNT_KEY, EMPTY)[0]; }
async function load(): Promise<GoogleAccount> { const raw = await api.getSetting(ACCOUNT_KEY); return raw ? JSON.parse(raw) : EMPTY; }
const save = (c: GoogleAccount) => api.setSetting(ACCOUNT_KEY, JSON.stringify(c));
function exclusively<T>(run: () => Promise<T>): Promise<T> {
  if (operation) return Promise.reject(new Error("Proses akun sedang berjalan. Tunggu sampai selesai."));
  const pending = run().finally(() => { operation = null; });
  operation = pending; return pending;
}
export function connectAccount(clientId: string, clientSecret: string) {
  return exclusively(async () => {
    if (!isDesktop) throw new Error("Login Google tersedia di aplikasi desktop Ruangku.");
    const current = await load();
    const savedSecret = current.clientId === clientId.trim() ? await api.secretGet(CLIENT_KEY) : null;
    const next = await loginAccount(clientId, clientSecret || savedSecret || "", current, { http: api.http, secrets, loopback: url => api.oauthLoopback(url, 300) });
    await save(next);
  });
}
export function disconnectAccount() {
  return exclusively(async () => {
    const current = await load();
    // Stop uploads before clearing credentials; keep the subject binding to avoid
    // accidentally copying this account's local records into another account.
    await save({ ...current, connected: false, lastError: undefined });
    await api.secretSet(REFRESH_KEY, "");
    await api.secretSet(CLIENT_KEY, "");
  });
}
export function runAccountSync() {
  if (operation) return operation;
  return exclusively(async () => {
    const cfg = await load();
    if (!cfg.connected || !isDesktop) return;
    try {
      // Seed legacy preferences before pull, with timestamp 1, so an existing
      // remote preference wins over an unversioned setting on a new device.
      await api.accountExport();
      const device = await api.syncStatus();
      const client = new DriveClient(cfg, api.http, secrets, { encode: api.snapshotEncode, decode: api.snapshotDecode });
      await syncAccount(client, device.deviceId, { merge: api.importRecords, export: api.accountExport });
      await save({ ...cfg, lastSync: Date.now(), lastError: undefined });
    } catch (e) {
      await save({ ...cfg, lastError: errorText(e) });
      throw e;
    }
  });
}
/** Main window only. Offline edits retry on reconnect or every three minutes. */
export function useAccountSyncLoop() {
  useEffect(() => {
    if (!isDesktop) return;
    const tick = () => { void runAccountSync().catch(() => {}); };
    let pending = window.setTimeout(tick, 5000);
    const queue = () => { window.clearTimeout(pending); pending = window.setTimeout(tick, 10000); };
    const interval = window.setInterval(tick, 180000);
    const stopRecords = onEvent<string>("records-changed", kind => { if (kind !== "*") queue(); });
    const stopSettings = onEvent<string>("setting-changed", key => { if (portableSetting(key)) queue(); });
    window.addEventListener("online", tick);
    return () => { window.clearTimeout(pending); window.clearInterval(interval); stopRecords(); stopSettings(); window.removeEventListener("online", tick); };
  }, []);
}

export function migrateAccountSnapshots() {
  return exclusively(async () => {
    const cfg = await load();
    if (!cfg.connected) return 0;
    const client = new DriveClient(cfg, api.http, secrets, { encode: api.snapshotEncode, decode: api.snapshotDecode });
    return client.migrate();
  });
}
