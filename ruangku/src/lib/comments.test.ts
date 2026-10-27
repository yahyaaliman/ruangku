import { describe, expect, it } from "vitest";
import { inboxFor, mentionMessage, mentionParts, parseMentions, type Comment, type OutboxRec } from "./comments";
import type { Item } from "./types";
import type { Member } from "./team";
import type { Task } from "./tasks";

const members = [
  { id: "m-saya", name: "Saya", email: "saya@example.com", role: "pemilik", isMe: true },
  { id: "m-rina", name: "Rina Putri", email: "rina@example.com", role: "admin" },
  { id: "m-rini", name: "Rini", email: "rini@example.com", role: "editor" },
  { id: "m-bayu", name: "Bayu Saputra", email: "bayu@example.com", role: "editor" },
  { id: "m-bayu2", name: "Bayu Ananda", email: "b2@example.com", role: "pembaca" },
] as Item<Member>[];

describe("mention", () => {
  it("nama lengkap, nama depan unik, dan bukan email", () => {
    expect(parseMentions("Tolong cek @Rina Putri dan @rini, cc bayu@example.com", members)).toEqual(["m-rina", "m-rini"]);
    expect(parseMentions("@Rina tolong ya", members)).toEqual(["m-rina"]);
    // "Bayu" dipakai dua anggota: harus nama lengkap.
    expect(parseMentions("@Bayu cek", members)).toEqual([]);
    expect(parseMentions("@Bayu Saputra cek, @Bayu Saputra lagi", members)).toEqual(["m-bayu"]);
    // "@Rini" tidak boleh cocok dengan "@Rinii"
    expect(parseMentions("@Rinii", members)).toEqual([]);
  });

  it("bagian teks untuk ditandai", () => {
    expect(mentionParts("Halo @Rina Putri, cek ya", members)).toEqual([{ text: "Halo " }, { text: "@Rina Putri", member: "m-rina" }, { text: ", cek ya" }]);
  });

  it("pesan notifikasi", () => {
    const m = mentionMessage({ body: "Bisa review?", target: "task" }, "Bab 2", "Saya", "AB12");
    expect(m.subject).toBe("[Ruangku #AB12] Saya menyebut Anda");
    expect(m.text).toContain('tugas "Bab 2"');
  });
});

describe("kotak masuk", () => {
  const tasks = [
    { id: "t1", title: "Bab 2", assignees: ["m-saya"] },
    { id: "t2", title: "Lain", assignees: ["m-bayu"] },
  ] as Item<Task>[];
  const c = (id: string, extra: Partial<Comment>): Item<Comment> => ({ id, updatedAt: 0, target: "task", targetId: "t2", body: "x", mentions: [], at: 1, ...extra });
  const o = (id: string, extra: Partial<OutboxRec>): Item<OutboxRec> => ({ id, updatedAt: 0, type: "assign", memberId: "m-saya", at: 1, status: "sent", tries: 0, ...extra });

  it("penugasan & sebutan dari orang lain, komentar di tugas saya", () => {
    const list = inboxFor(new Set(["m-saya"]), {
      outbox: [o("o1", { taskId: "t1", by: "m-rina", at: 10 }), o("o2", { taskId: "t1", by: "m-saya", at: 11 }), o("o3", { taskId: "t2", memberId: "m-bayu", at: 12 })],
      comments: [
        c("c1", { authorId: "m-rina", mentions: ["m-saya"], at: 20, body: "@Saya cek" }),
        c("c2", { authorId: "m-bayu", targetId: "t1", at: 30 }),
        c("c3", { authorId: "m-saya", targetId: "t1", at: 40 }),
        c("c4", { authorId: "m-bayu", targetId: "t2", at: 50 }),
      ],
      tasks,
      notes: [],
      members,
    });
    expect(list.map((x) => [x.key, x.kind])).toEqual([
      ["c:c2", "comment"],
      ["c:c1", "mention"],
      ["o:o1", "assign"],
    ]);
    expect(list[2]).toMatchObject({ by: "Rina Putri", title: "Bab 2" });
  });
});
