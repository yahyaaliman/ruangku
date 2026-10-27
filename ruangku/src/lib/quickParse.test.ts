import { describe, expect, it } from "vitest";
import { parseQuick } from "./quickParse";

const MON = new Date(2026, 9, 26); // Senin 26 Okt 2026

describe("tambah cepat", () => {
  it("judul, tanggal relatif, jam, tag, prioritas, proyek, estimasi", () => {
    expect(parseQuick("Kirim penawaran besok jam 14 #klien !tinggi @Sinar ~30m", MON)).toEqual({
      title: "Kirim penawaran",
      due: "2026-10-27",
      dueTime: 840,
      tags: ["klien"],
      priority: "tinggi",
      project: "Sinar",
      estimate: 30,
    });
  });
  it("nama hari, tanggal, dan pengulangan", () => {
    expect(parseQuick("Rapat kamis", MON).due).toBe("2026-10-29");
    expect(parseQuick("Bayar listrik 5 nov", MON).due).toBe("2026-11-05");
    expect(parseQuick("Lapor pajak 10/3", MON).due).toBe("2027-03-10");
    expect(parseQuick("Stand-up setiap hari kerja jam 9", MON)).toMatchObject({ title: "Stand-up", recurrence: { freq: "weekdays" }, dueTime: 540, due: "2026-10-26" });
    expect(parseQuick("Olahraga jam 5 sore", MON).dueTime).toBe(17 * 60);
    expect(parseQuick("Belajar ~1,5j", MON).estimate).toBe(90);
  });
  it("proyek dua kata hanya jika ada", () => {
    expect(parseQuick("Desain logo @Klien Baru", MON, ["Klien Baru"])).toMatchObject({ title: "Desain logo", project: "Klien Baru" });
    expect(parseQuick("Desain @Klien logo", MON, [])).toMatchObject({ title: "Desain logo", project: "Klien" });
  });
  it("tanpa penanda tetap aman", () => {
    expect(parseQuick("  Beli kopi  ", MON)).toEqual({ title: "Beli kopi", tags: [] });
    expect(parseQuick("Baca bab #1 #buku", MON).tags).toEqual(["1", "buku"]);
  });
});
