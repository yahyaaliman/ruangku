// Komentar pada tugas/catatan dengan @mention, dan kotak masuk (penugasan, sebutan, komentar).
import type { Item } from "./types";
import type { Member } from "./team";
import type { Task } from "./tasks";

export interface Comment {
  target: "task" | "note";
  targetId: string;
  projectId?: string;
  body: string;
  authorId?: string;
  authorName?: string;
  mentions: string[];
  at: number;
  editedAt?: number;
}

export interface OutboxRec {
  /** assign = penugasan, mention = sebutan, meeting = undangan/hasil rapat */
  type: "assign" | "mention" | "meeting";
  meetingId?: string;
  /** Untuk type "meeting" */
  meetingMsg?: "undangan" | "hasil" | "batal";
  taskId?: string;
  noteId?: string;
  commentId?: string;
  projectId?: string;
  memberId: string;
  by?: string;
  at: number;
  status: "pending" | "sent" | "failed" | "skipped";
  tries: number;
  lastError?: string;
  sentVia?: string[];
}

const norm = (s: string) => s.toLocaleLowerCase("id-ID");

/**
 * Anggota yang disebut dengan "@Nama" di teks. Nama lengkap dicocokkan lebih dulu,
 * lalu nama depan bila hanya satu anggota yang memakainya.
 */
export function parseMentions(body: string, members: Pick<Item<Member>, "id" | "name">[]): string[] {
  const text = norm(body);
  const full = [...members].filter((m) => m.name.trim()).sort((a, b) => b.name.length - a.name.length);
  const firsts = new Map<string, string[]>();
  for (const m of members) {
    const f = norm(m.name.trim().split(/\s+/)[0] ?? "");
    if (f) firsts.set(f, [...(firsts.get(f) ?? []), m.id]);
  }
  const out: string[] = [];
  for (let i = text.indexOf("@"); i >= 0; i = text.indexOf("@", i + 1)) {
    if (i > 0 && /[\p{L}\p{N}._-]/u.test(text[i - 1])) continue; // bagian dari email
    const rest = text.slice(i + 1);
    const hit = full.find((m) => rest.startsWith(norm(m.name)) && !/[\p{L}\p{N}]/u.test(rest[m.name.length] ?? ""));
    if (hit) {
      if (!out.includes(hit.id)) out.push(hit.id);
      continue;
    }
    const word = /^[\p{L}\p{N}_-]+/u.exec(rest)?.[0];
    const ids = word ? firsts.get(word) : undefined;
    if (ids?.length === 1 && !out.includes(ids[0])) out.push(ids[0]);
  }
  return out;
}

/** Potong teks menjadi bagian biasa dan bagian @mention untuk ditampilkan. */
export function mentionParts(body: string, members: Pick<Item<Member>, "id" | "name">[]): { text: string; member?: string }[] {
  const names = [...members].filter((m) => m.name.trim()).sort((a, b) => b.name.length - a.name.length);
  const out: { text: string; member?: string }[] = [];
  let buf = "";
  for (let i = 0; i < body.length; i++) {
    if (body[i] === "@" && (i === 0 || !/[\p{L}\p{N}._-]/u.test(body[i - 1]))) {
      const rest = norm(body.slice(i + 1));
      const hit = names.find((m) => rest.startsWith(norm(m.name)) && !/[\p{L}\p{N}]/u.test(rest[m.name.length] ?? ""));
      if (hit) {
        if (buf) out.push({ text: buf });
        buf = "";
        out.push({ text: body.slice(i, i + 1 + hit.name.length), member: hit.id });
        i += hit.name.length;
        continue;
      }
    }
    buf += body[i];
  }
  if (buf) out.push({ text: buf });
  return out;
}

export function mentionMessage(c: Pick<Comment, "body" | "target">, targetTitle: string, by: string | undefined, code?: string) {
  const where = c.target === "task" ? `tugas "${targetTitle}"` : `catatan "${targetTitle}"`;
  return {
    subject: `${code ? `[Ruangku #${code}] ` : "[Ruangku] "}${by ?? "Seseorang"} menyebut Anda`,
    text: [`💬 *${by ?? "Seseorang"}* menyebut Anda di ${where}:`, "", c.body.slice(0, 800), code ? `\nKode tugas: ${code}` : ""].filter((x) => x !== "").join("\n"),
  };
}

export interface InboxEntry {
  key: string;
  kind: "assign" | "mention" | "comment" | "meeting";
  at: number;
  title: string;
  text: string;
  target: { kind: "task" | "note" | "meeting"; id: string };
  by?: string;
}

/** Kotak masuk untuk "saya": penugasan & sebutan dari orang lain, serta komentar di tugas saya. */
export function inboxFor(
  myIds: Set<string>,
  data: { outbox: Item<OutboxRec>[]; comments: Item<Comment>[]; tasks: Item<Task>[]; notes: { id: string; title: string }[]; members: Item<Member>[]; meetings?: { id: string; title: string }[] },
  limit = 40,
): InboxEntry[] {
  const nameOf = (id?: string) => data.members.find((m) => m.id === id)?.name;
  const titleOf = (kind: "task" | "note", id: string) => (kind === "task" ? data.tasks.find((t) => t.id === id)?.title : data.notes.find((n) => n.id === id)?.title) ?? "(sudah dihapus)";
  const out: InboxEntry[] = [];
  for (const o of data.outbox) {
    if (!myIds.has(o.memberId) || (o.by && myIds.has(o.by))) continue;
    if (o.type === "assign" && o.taskId) out.push({ key: `o:${o.id}`, kind: "assign", at: o.at, title: titleOf("task", o.taskId), text: "ditugaskan kepada Anda", target: { kind: "task", id: o.taskId }, by: nameOf(o.by) });
    if (o.type === "meeting" && o.meetingId) {
      const title = data.meetings?.find((m) => m.id === o.meetingId)?.title ?? "(rapat sudah dihapus)";
      out.push({ key: `o:${o.id}`, kind: "meeting", at: o.at, title, text: o.meetingMsg === "hasil" ? "mengirim hasil rapat" : o.meetingMsg === "batal" ? "membatalkan rapat" : "mengundang Anda rapat", target: { kind: "meeting", id: o.meetingId }, by: nameOf(o.by) });
    }
  }
  for (const c of data.comments) {
    if (c.authorId && myIds.has(c.authorId)) continue;
    const forMe = c.mentions.some((m) => myIds.has(m));
    const t = c.target === "task" ? data.tasks.find((x) => x.id === c.targetId) : undefined;
    const mine = !!t && ((t.assignees ?? []).some((a) => myIds.has(a)) || (t.createdBy ? myIds.has(t.createdBy) : false));
    if (!forMe && !mine) continue;
    out.push({
      key: `c:${c.id}`,
      kind: forMe ? "mention" : "comment",
      at: c.at,
      title: titleOf(c.target, c.targetId),
      text: c.body.length > 140 ? `${c.body.slice(0, 140)}…` : c.body,
      target: { kind: c.target, id: c.targetId },
      by: c.authorName ?? nameOf(c.authorId),
    });
  }
  return out.sort((a, b) => b.at - a.at).slice(0, limit);
}
