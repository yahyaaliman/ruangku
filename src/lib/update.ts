// Cek pembaruan dari halaman Releases GitHub (repo diatur pengguna, mis. "nama/ruangku").
import { api, httpJson, isDesktop } from "./api";

export interface Release {
  version: string;
  name: string;
  url: string;
  notes: string;
  publishedAt: string;
  installer?: string;
}

/** Bandingkan versi semver sederhana ("v0.3.1" vs "0.3.0"). */
export function compareVersions(a: string, b: string): number {
  const pa = a.replace(/^v/i, "").split(/[.-]/);
  const pb = b.replace(/^v/i, "").split(/[.-]/);
  for (let i = 0; i < 3; i++) {
    const x = Number(pa[i] ?? 0) || 0;
    const y = Number(pb[i] ?? 0) || 0;
    if (x !== y) return x > y ? 1 : -1;
  }
  // Versi pra-rilis (mis. 1.0.0-beta) lebih rendah dari rilis penuh.
  const preA = pa.length > 3;
  const preB = pb.length > 3;
  return preA === preB ? 0 : preA ? -1 : 1;
}

export const validRepo = (r: string) => /^[\w.-]+\/[\w.-]+$/.test(r.trim());

export async function latestRelease(repo: string): Promise<Release> {
  const j = await httpJson<any>("GET", `https://api.github.com/repos/${repo.trim()}/releases/latest`, undefined, { accept: "application/vnd.github+json", "user-agent": "Ruangku" }, 20000);
  const assets: { name: string; browser_download_url: string }[] = j.assets ?? [];
  const installer = assets.find((a) => /setup.*\.exe$|\.msi$/i.test(a.name)) ?? assets.find((a) => /\.exe$/i.test(a.name));
  return { version: String(j.tag_name ?? "").replace(/^v/i, ""), name: j.name ?? j.tag_name ?? "", url: j.html_url, notes: String(j.body ?? "").slice(0, 3000), publishedAt: j.published_at ?? "", installer: installer?.browser_download_url };
}

export const UPDATE_REPO_KEY = "update_repo";
export const UPDATE_CHECK_KEY = "update_last_check";

/** Cek sekali sehari (dipanggil saat aplikasi dibuka). Mengembalikan rilis bila lebih baru. */
export async function dailyUpdateCheck(current: string): Promise<Release | null> {
  if (isDesktop) {
    const lastSigned = Number(await api.getSetting("signed_update_last_check") || 0);
    if (Date.now() - lastSigned >= 20 * 3600 * 1000) {
      const signed = await api.updaterCheck();
      await api.setSetting("signed_update_last_check", String(Date.now()));
      if (signed.configured) return signed.version ? { version: signed.version, name: signed.version, notes: signed.notes || "", publishedAt: "", url: "https://github.com/yahyaaliman/ruangku/releases" } : null;
    }
  }
  const repo = (await api.getSetting(UPDATE_REPO_KEY)) ?? "";
  if (!validRepo(repo)) return null;
  const last = Number((await api.getSetting(UPDATE_CHECK_KEY)) ?? 0);
  if (Date.now() - last < 20 * 3600 * 1000) return null;
  await api.setSetting(UPDATE_CHECK_KEY, String(Date.now()));
  const r = await latestRelease(repo);
  return compareVersions(r.version, current) > 0 ? r : null;
}
