// Rahasia (API key, token bot, sandi aplikasi Gmail, token server tim) tidak disimpan
// di pengaturan biasa. Di Windows masuk ke Credential Manager; di setting hanya tertulis penanda.
import { api } from "./api";

export const MASK = "•tersimpan-aman•";

function getPath(o: any, path: string): unknown {
  return path.split(".").reduce((x, k) => (x == null ? undefined : x[k]), o);
}
function setPath(o: any, path: string, v: unknown) {
  const ks = path.split(".");
  let x = o;
  for (const k of ks.slice(0, -1)) {
    if (x[k] == null || typeof x[k] !== "object") x[k] = {};
    x = x[k];
  }
  x[ks[ks.length - 1]] = v;
}

/** Pisahkan field rahasia: hasilnya salinan bertanda + daftar nilai rahasia per path. */
export function splitSecrets<T extends object>(obj: T, paths: string[]): { masked: T; secrets: Record<string, string> } {
  const masked = JSON.parse(JSON.stringify(obj)) as T;
  const secrets: Record<string, string> = {};
  for (const p of paths) {
    const v = getPath(obj, p);
    if (typeof v !== "string") continue;
    if (v !== MASK) secrets[p] = v;
    setPath(masked, p, v ? MASK : "");
  }
  return { masked, secrets };
}

/** Isi kembali field bertanda dari penyimpanan rahasia. Mengembalikan juga field lama (teks biasa) yang perlu dipindah. */
export async function mergeSecrets<T extends object>(obj: T, paths: string[], get: (p: string) => Promise<string | null>): Promise<{ value: T; legacy: Record<string, string> }> {
  const value = JSON.parse(JSON.stringify(obj)) as T;
  const legacy: Record<string, string> = {};
  for (const p of paths) {
    const v = getPath(value, p);
    if (v === MASK) setPath(value, p, (await get(p)) ?? "");
    else if (typeof v === "string" && v) legacy[p] = v;
  }
  return { value, legacy };
}

const secretKey = (setting: string, path: string) => `${setting}.${path}`;

/** Simpan objek pengaturan; field rahasia ke Credential Manager / penyimpanan aman. */
export async function saveSecure<T extends object>(setting: string, obj: T, paths: string[]) {
  const { masked, secrets } = splitSecrets(obj, paths);
  for (const [p, v] of Object.entries(secrets)) await api.secretSet(secretKey(setting, p), v);
  await api.setSetting(setting, JSON.stringify(masked));
}

/** Baca objek pengaturan beserta rahasianya. Pengaturan lama (teks biasa) dipindahkan otomatis. */
const migrating = new Set<string>();

export async function loadSecure<T extends object>(setting: string, parsed: T, paths: string[]): Promise<T> {
  const { value, legacy } = await mergeSecrets(parsed, paths, (p) => api.secretGet(secretKey(setting, p)));
  // Beberapa komponen bisa memuat pengaturan yang sama bersamaan; cukup satu yang memindahkan.
  if (Object.keys(legacy).length && !migrating.has(setting)) {
    migrating.add(setting);
    try {
      await saveSecure(setting, value, paths);
      api.log("INFO", `Rahasia di "${setting}" dipindahkan ke penyimpanan aman`);
    } catch {
      /* tetap pakai nilai lama */
    } finally {
      migrating.delete(setting);
    }
  }
  return value;
}
