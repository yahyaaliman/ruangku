// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../lib/api";
import { DEFAULT_BOT, handleIncoming, processOutbox } from "./bot";
import { updateTask } from "../lib/taskOps";

describe("bot WA/Telegram/email", () => {
  beforeEach(() => localStorage.clear());

  it("anggota terdaftar bisa melihat dan menyelesaikan tugasnya; orang asing ditolak", async () => {
    const list = await handleIncoming({ channel: "wa", phone: "6285755556666", text: "tugas" });
    expect(list).toContain("Verifikasi 12 calon penerima");
    expect(list).toMatch(/\[TI2\]/);
    const done = await handleIncoming({ channel: "wa", phone: "0857-5555-6666", text: "selesai TI2" });
    expect(done).toContain("ditandai selesai");
    const t = (await api.list("task")).find((x) => x.id === "t-i2")!;
    expect(t.data.status).toBe("done");
    expect(t.data.completedAt).toBeGreaterThan(0);
    // Sari (kontributor) tidak boleh menyelesaikan tugas Bayu.
    const deny = await handleIncoming({ channel: "wa", phone: "6285755556666", text: "selesai TJ1" });
    expect(deny).toContain("tidak boleh");
    const stranger = await handleIncoming({ channel: "wa", phone: "6281200000000", text: "tugas" });
    expect(stranger).toContain("belum terdaftar");
  });

  it("tambah tugas lewat email dan tautan Telegram", async () => {
    const r = await handleIncoming({ channel: "email", email: "rina@example.com", text: "tambah Siapkan materi rapat besok #rapat !tinggi" });
    expect(r).toContain("Tugas dibuat");
    const t = (await api.list("task")).find((x) => x.data.title === "Siapkan materi rapat")!;
    expect(t.data).toMatchObject({ assignees: ["m-rina"], createdBy: "m-rina", priority: "tinggi", tags: ["rapat"] });
    // Dr. Hendra (pembaca) tidak boleh menambah.
    expect(await handleIncoming({ channel: "email", email: "hendra@example.com", text: "tambah x" })).toContain("tidak boleh");
    // Tautan Telegram /start KODE
    const bayu = (await api.list("member")).find((m) => m.id === "m-bayu")!;
    await api.save("m-bayu", "member", { ...bayu.data, linkCode: "k9x2" });
    const hi = await handleIncoming({ channel: "telegram", telegramChatId: 4242, telegramUser: "bayup", text: "/start k9x2" });
    expect(hi).toContain("Halo Bayu");
    expect((await api.list("member")).find((m) => m.id === "m-bayu")!.data.telegramChatId).toBe(4242);
    expect(await handleIncoming({ channel: "telegram", telegramChatId: 4242, text: "hari ini" })).toContain("Selamat pagi, Bayu");
  });

  it("antrean penugasan dikirim ke WA dan Telegram", async () => {
    const sent: { url: string; body: any }[] = [];
    vi.stubGlobal("fetch", async (url: string, init: { body: string }) => {
      sent.push({ url, body: JSON.parse(init.body) });
      return new Response(JSON.stringify({ ok: true, messages: [{ id: "wamid" }] }), { status: 200 });
    });
    const bayu = (await api.list("member")).find((m) => m.id === "m-bayu")!;
    await api.save("m-bayu", "member", { ...bayu.data, telegramChatId: 777, notifyVia: ["wa", "telegram"] });
    await updateTask("t-j4", { assignees: ["m-bayu"] }, "m-saya");
    const cfg = { ...DEFAULT_BOT, enabled: true, telegram: { ...DEFAULT_BOT.telegram, enabled: true, token: "123:abc" }, wa: { ...DEFAULT_BOT.wa, enabled: true, phoneId: "999", token: "EAAG" } };
    await processOutbox(cfg);
    expect(sent.map((s) => s.url)).toEqual(["https://graph.facebook.com/v23.0/999/messages", "https://api.telegram.org/bot123:abc/sendMessage"]);
    expect(sent[0].body).toMatchObject({ to: "6281333334444", type: "text" });
    expect(sent[0].body.text.body).toContain("Ekspor laporan ke PDF");
    expect(sent[1].body.chat_id).toBe(777);
    const ob = (await api.list("outbox")).find((o) => o.data.taskId === "t-j4")!;
    expect(ob.data.status).toBe("sent");
    // Tidak dikirim dua kali.
    await processOutbox(cfg);
    expect(sent.length).toBe(2);
  });
});
