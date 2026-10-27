import { describe, expect, it } from "vitest";
import { codeFromSubject, parseCommand } from "./commands";

describe("perintah bot", () => {
  it("mengenali perintah utama", () => {
    expect(parseCommand("/start")).toEqual({ cmd: "bantuan" });
    expect(parseCommand("/start abc123")).toEqual({ cmd: "link", code: "abc123" });
    expect(parseCommand("Tugas")).toEqual({ cmd: "tugas" });
    expect(parseCommand("hari ini")).toEqual({ cmd: "hari_ini" });
    expect(parseCommand("tambah Kirim laporan besok jam 10 #kantor")).toEqual({ cmd: "tambah", text: "Kirim laporan besok jam 10 #kantor" });
    expect(parseCommand("selesai #a1b2")).toEqual({ cmd: "selesai", code: "A1B2" });
    expect(parseCommand("tunda TJ3 jumat")).toEqual({ cmd: "tunda", code: "TJ3", when: "jumat" });
    expect(parseCommand("catat ide: pakai template")).toEqual({ cmd: "catat", text: "ide: pakai template" });
    expect(parseCommand("apa prioritas saya minggu ini?")).toEqual({ cmd: "ai", text: "apa prioritas saya minggu ini?" });
  });
  it("balasan email memakai kode dari subjek", () => {
    expect(codeFromSubject("Re: [Ruangku #TJ3] Tugas baru: Perbaiki crash")).toBe("TJ3");
    expect(parseCommand("Selesai", "TJ3")).toEqual({ cmd: "selesai", code: "TJ3" });
    expect(parseCommand("tunda besok", "TJ3")).toEqual({ cmd: "tunda", code: "TJ3", when: "besok" });
    expect(parseCommand("selesai")).toEqual({ cmd: "ai", text: "selesai" });
  });
});

describe("perintah rapat, kuliah, dan keuangan", () => {
  it("dikenali", () => {
    expect(parseCommand("rapat")).toEqual({ cmd: "rapat" });
    expect(parseCommand("/kuliah")).toEqual({ cmd: "kuliah" });
    expect(parseCommand("Saldo")).toEqual({ cmd: "kas" });
    expect(parseCommand("keluar 25rb makan siang")).toEqual({ cmd: "uang", type: "keluar", text: "25rb makan siang" });
    expect(parseCommand("masuk 5jt gaji Oktober")).toEqual({ cmd: "uang", type: "masuk", text: "5jt gaji Oktober" });
    expect(parseCommand("catat ide rapat")).toEqual({ cmd: "catat", text: "ide rapat" });
  });
});
