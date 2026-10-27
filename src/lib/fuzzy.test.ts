import { describe, expect, it } from "vitest";
import { highlight, rank, score } from "./fuzzy";

describe("fuzzy", () => {
  it("abaikan huruf besar dan aksen", () => {
    expect(score("Rapat Évaluasi", "evaluasi")).toBeGreaterThan(0);
    expect(score("Rapat", "x")).toBe(-1);
  });

  it("semua kata harus ada", () => {
    expect(score("Perpanjang domain & hosting", "domain host")).toBeGreaterThan(0);
    expect(score("Perpanjang domain & hosting", "domain email")).toBe(-1);
  });

  it("awal kata lebih tinggi daripada tengah kata", () => {
    expect(score("Thesis bab 2", "the")).toBeGreaterThan(score("Mathematics", "the"));
  });

  it("cocok inisial", () => {
    expect(score("Riset thesis", "rt")).toBeGreaterThan(0);
  });

  it("rank mengurutkan dan membatasi", () => {
    const r = rank(["Bab 2 thesis", "Thesis", "Laporan"], "thesis", (x) => x);
    expect(r.map((x) => x.item)).toEqual(["Thesis", "Bab 2 thesis"]);
  });

  it("highlight menandai bagian yang cocok", () => {
    expect(highlight("Riset Thesis", "thes")).toEqual([
      { text: "Riset ", hit: false },
      { text: "Thes", hit: true },
      { text: "is", hit: false },
    ]);
  });
});
