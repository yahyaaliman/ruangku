import { describe, expect, it } from "vitest";
import { byMonth, byParty, donorReportHtml, ledgerRows, rupiah, summary, withBalance, type LedgerEntry } from "./ledger";

const e = (id: string, date: string, type: LedgerEntry["type"], amount: number, extra: Partial<LedgerEntry> = {}) => ({ id, date, type, amount, category: type === "masuk" ? "Infaq" : "Penyaluran", ...extra });

const list = [
  e("a", "2026-09-28", "masuk", 1_000_000, { party: "Hamba Allah" }),
  e("b", "2026-10-02", "masuk", 2_500_000, { party: "Bu Siti", method: "transfer", ref: "TRF-01" }),
  e("c", "2026-10-05", "keluar", 1_200_000, { party: "Panti Al-Ikhlas" }),
  e("d", "2026-10-09", "masuk", 500_000, { party: " bu  siti " }),
  e("e", "2026-11-01", "masuk", 300_000, { party: "Pak Budi" }),
];

describe("buku kas", () => {
  it("ringkasan periode dengan saldo awal", () => {
    expect(summary(list, "2026-10-01", "2026-10-31")).toEqual({ opening: 1_000_000, masuk: 3_000_000, keluar: 1_200_000, closing: 2_800_000 });
  });

  it("saldo berjalan urut tanggal", () => {
    expect(withBalance([...list].reverse()).map((x) => x.balance)).toEqual([1_000_000, 3_500_000, 2_300_000, 2_800_000, 3_100_000]);
  });

  it("per bulan dan per donatur (nama tanpa beda huruf/spasi)", () => {
    expect(byMonth(list)).toEqual([
      { month: "2026-09", masuk: 1_000_000, keluar: 0 },
      { month: "2026-10", masuk: 3_000_000, keluar: 1_200_000 },
      { month: "2026-11", masuk: 300_000, keluar: 0 },
    ]);
    expect(byParty(list)[0]).toEqual({ party: "Bu Siti", total: 3_000_000, count: 2, last: "2026-10-09" });
  });

  it("laporan donatur hanya berisi transaksi donatur itu pada periode", () => {
    const html = donorReportHtml({ org: "Penitipan Infaq <Al-Amin>", donor: "Bu Siti", from: "2026-10-01", to: "2026-10-31", entries: list, distributed: 1_200_000 });
    expect(html).toContain("Penitipan Infaq &lt;Al-Amin&gt;");
    expect(html).toContain("TRF-01");
    expect(html).toContain(rupiah(3_000_000));
    expect(html).not.toContain("Hamba Allah");
    expect(html).toContain("menyalurkan dana sebesar");
  });

  it("baris CSV", () => {
    const rows = ledgerRows(list.slice(0, 3), () => "Infaq");
    expect(rows[0][0]).toBe("Tanggal");
    expect(rows[3]).toEqual(["2026-10-05", "Keluar", "Penyaluran", "Panti Al-Ikhlas", "", "", "", undefined, 1_200_000, 2_300_000, "Infaq"]);
  });
});
