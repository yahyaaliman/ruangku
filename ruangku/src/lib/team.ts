// Anggota tim, peran (role), dan hak akses CRUD per email.
// Peran yang sama ditegakkan di server PocketBase (pocketbase/pb_hooks) untuk
// proyek tim, dan di bot (WA/Telegram/Gmail) untuk perintah dari luar aplikasi.
import type { BlockColor, Item } from "./types";

export type Role = "pemilik" | "admin" | "editor" | "kontributor" | "pembaca";

export const ROLES: { id: Role; label: string; level: number; desc: string }[] = [
  { id: "pemilik", label: "Pemilik", level: 5, desc: "Semua akses, termasuk mengelola ruang kerja dan anggota." },
  { id: "admin", label: "Admin", level: 4, desc: "Tambah, ubah, hapus semua data; kelola anggota (kecuali pemilik)." },
  { id: "editor", label: "Editor", level: 3, desc: "Tambah, ubah, dan hapus semua data proyek." },
  { id: "kontributor", label: "Kontributor", level: 2, desc: "Tambah data; ubah tugas yang ditugaskan kepadanya atau yang ia buat; hapus buatannya sendiri." },
  { id: "pembaca", label: "Pembaca", level: 1, desc: "Hanya melihat dan menerima notifikasi." },
];
export const roleLevel = (r: Role | undefined) => ROLES.find((x) => x.id === r)?.level ?? 0;
export const roleLabel = (r: Role | undefined) => ROLES.find((x) => x.id === r)?.label ?? "—";

export interface Member {
  name: string;
  email: string;
  role: Role;
  /** Nomor WhatsApp, format bebas (dinormalkan saat dipakai) */
  wa?: string;
  /** Username Telegram (tanpa @) */
  telegram?: string;
  /** Diisi otomatis saat anggota menekan /start di bot */
  telegramChatId?: number;
  /** Kanal notifikasi penugasan yang aktif */
  notifyVia?: Channel[];
  /** Ruang kerja tim (kosong = anggota lokal untuk penugasan & bot saja) */
  workspaceId?: string;
  /** Anggota ini adalah pengguna aplikasi ini */
  isMe?: boolean;
  color?: BlockColor;
  /** Kode tautan bot (/start KODE) */
  linkCode?: string;
  /** Id anggota di server tim */
  remoteId?: string;
}

export type Channel = "telegram" | "wa" | "email";
export const CHANNEL_LABEL: Record<Channel, string> = { telegram: "Telegram", wa: "WhatsApp", email: "Email" };

export type Action = "read" | "create" | "update" | "delete" | "manage";

/** Hak akses sebuah peran. `own` = data dibuat olehnya, `assigned` = tugas ditugaskan kepadanya. */
export function can(role: Role | undefined, action: Action, ctx: { own?: boolean; assigned?: boolean } = {}): boolean {
  const lv = roleLevel(role);
  switch (action) {
    case "read":
      return lv >= 1;
    case "create":
      return lv >= 2;
    case "update":
      return lv >= 3 || (lv === 2 && !!(ctx.own || ctx.assigned));
    case "delete":
      return lv >= 3 || (lv === 2 && !!ctx.own);
    case "manage":
      return lv >= 4;
  }
}

/** Siapa boleh mengubah peran siapa: admin tidak boleh menyentuh pemilik. */
export function canManageMember(actor: Role | undefined, target: Role, newRole?: Role): boolean {
  if (roleLevel(actor) < 4) return false;
  if (actor === "pemilik") return true;
  return target !== "pemilik" && newRole !== "pemilik";
}

/** Nomor Indonesia ke format internasional tanpa tanda: 0812-3456-7890 → 6281234567890 */
export function normalizePhone(raw: string | undefined): string {
  if (!raw) return "";
  let d = raw.replace(/[^\d+]/g, "");
  if (d.startsWith("+")) d = d.slice(1);
  if (d.startsWith("0")) d = "62" + d.slice(1);
  else if (d.startsWith("8") && d.length >= 9 && d.length <= 13) d = "62" + d;
  return d.replace(/\D/g, "");
}

export const normalizeEmail = (e: string | undefined) => (e ?? "").trim().toLowerCase();

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

/** Cari anggota dari identitas kanal masuk. */
export function findMember(members: Item<Member>[], who: { email?: string; phone?: string; telegramChatId?: number; telegramUser?: string }): Item<Member> | undefined {
  if (who.telegramChatId !== undefined) {
    const m = members.find((x) => x.telegramChatId === who.telegramChatId);
    if (m) return m;
  }
  if (who.telegramUser) {
    const u = who.telegramUser.replace(/^@/, "").toLowerCase();
    const m = members.find((x) => (x.telegram ?? "").replace(/^@/, "").toLowerCase() === u);
    if (m) return m;
  }
  if (who.phone) {
    const p = normalizePhone(who.phone);
    const m = members.find((x) => x.wa && normalizePhone(x.wa) === p);
    if (m) return m;
  }
  if (who.email) {
    const e = normalizeEmail(who.email);
    return members.find((x) => normalizeEmail(x.email) === e);
  }
  return undefined;
}

export const me = (members: Item<Member>[]) => members.find((m) => m.isMe);
