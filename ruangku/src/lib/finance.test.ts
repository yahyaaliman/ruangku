import { describe, expect, it } from "vitest";
import { accountBalances, budgetStatus, byCategory, cashflow, dueRecurring, forecast, guessCategory, lastMonths, occurrences, parseMoneyText, postRecurring, type Account, type Budget, type Recurring } from "./finance";
import { summary, type LedgerEntry } from "./ledger";
import type { Item } from "./types";

const acc = (id: string, opening = 0): Item<Account> => ({ id, updatedAt: 0, name: id, type: "bank", opening });
const tx = (id: string, date: string, type: LedgerEntry["type"], amount: number, extra: Partial<LedgerEntry> = {}): Item<LedgerEntry> => ({ id, updatedAt: 0, date, type, amount, category: "Lainnya", ...extra });

describe("keuangan", () => {
  const entries = [
    tx("a", "2026-09-25", "masuk", 8_000_000, { accountId: "bca", category: "Gaji" }),
    tx("b", "2026-10-01", "keluar", 1_500_000, { accountId: "bca", category: "Rumah & cicilan" }),
    tx("c", "2026-10-03", "transfer", 500_000, { accountId: "bca", toAccountId: "gopay" }),
    tx("d", "2026-10-04", "keluar", 25_000, { accountId: "gopay", category: "Makan & minum" }),
    tx("e", "2026-10-10", "keluar", 75_000, { accountId: "tunai", category: "Makan & minum", projectId: "p1" }),
  ];

  it("saldo akun dengan transfer", () => {
    const b = accountBalances([acc("bca", 1_000_000), acc("gopay"), acc("tunai", 200_000)], entries);
    expect(b.get("bca")).toBe(7_000_000);
    expect(b.get("gopay")).toBe(475_000);
    expect(b.get("tunai")).toBe(125_000);
    expect(accountBalances([acc("bca", 1_000_000)], entries, "2026-09-30").get("bca")).toBe(9_000_000);
    // Transfer tidak dihitung sebagai pemasukan/pengeluaran.
    expect(summary(entries, "2026-10-01", "2026-10-31")).toMatchObject({ masuk: 0, keluar: 1_600_000 });
  });

  it("arus kas per bulan & kategori", () => {
    expect(lastMonths("2026-01", 3)).toEqual(["2025-11", "2025-12", "2026-01"]);
    const cf = cashflow(entries, ["2026-09", "2026-10"]);
    expect(cf).toEqual([
      { month: "2026-09", masuk: 8_000_000, keluar: 0, net: 8_000_000 },
      { month: "2026-10", masuk: 0, keluar: 1_600_000, net: -1_600_000 },
    ]);
    expect(byCategory(entries, "2026-10-01", "2026-10-31")).toEqual([
      { category: "Rumah & cicilan", total: 1_500_000 },
      { category: "Makan & minum", total: 100_000 },
    ]);
  });

  it("anggaran bulanan & total proyek", () => {
    const budgets: Item<Budget>[] = [
      { id: "b1", updatedAt: 0, category: "Makan & minum", amount: 120_000, period: "bulanan" },
      { id: "b2", updatedAt: 0, category: "*", amount: 1_000_000, period: "bulanan" },
      { id: "b3", updatedAt: 0, category: "*", amount: 50_000, period: "total", projectId: "p1" },
    ];
    const st = budgetStatus(budgets, entries, "2026-10", (bp, ep) => !bp || bp === ep);
    expect(st.map((s) => [s.spent, s.state])).toEqual([
      [100_000, "waspada"],
      [1_600_000, "lewat"],
      [75_000, "lewat"],
    ]);
  });

  it("transaksi berulang: jatuh tempo, akhir bulan, proyeksi", () => {
    expect(occurrences({ freq: "bulanan", start: "2026-01-31" }, "2026-02-01", "2026-04-30")).toEqual(["2026-02-28", "2026-03-31", "2026-04-30"]);
    expect(occurrences({ freq: "mingguan", start: "2026-10-01", end: "2026-10-20" }, "2026-10-01", "2026-12-31")).toEqual(["2026-10-01", "2026-10-08", "2026-10-15"]);
    expect(occurrences({ freq: "tahunan", start: "2024-02-29" }, "2025-01-01", "2026-12-31")).toEqual(["2025-02-28", "2026-02-28"]);
    const listrik: Item<Recurring> = { id: "r1", updatedAt: 0, title: "Listrik", type: "keluar", amount: 450_000, category: "Tagihan & utilitas", freq: "bulanan", start: "2026-09-20", lastPosted: "2026-09-20", active: true, accountId: "bca" };
    const gaji: Item<Recurring> = { id: "r2", updatedAt: 0, title: "Gaji", type: "masuk", amount: 8_000_000, category: "Gaji", freq: "bulanan", start: "2026-08-25", lastPosted: "2026-09-25", active: true, skipped: [] };
    const due = dueRecurring([listrik, gaji], "2026-10-27");
    expect(due.map((d) => `${d.rec.id}@${d.date}`)).toEqual(["r1@2026-10-20", "r2@2026-10-25"]);
    expect(dueRecurring([{ ...listrik, skipped: ["2026-10-20"] }], "2026-10-27")).toEqual([]);
    expect(postRecurring(listrik, "2026-10-20")).toMatchObject({ date: "2026-10-20", type: "keluar", amount: 450_000, description: "Listrik", recurringId: "r1", accountId: "bca" });
    const f = forecast(1_000_000, [{ ...listrik, lastPosted: "2026-10-20" }, { ...gaji, lastPosted: "2026-10-25" }], "2026-10-27", 30);
    expect(f.items.map((x) => x.date)).toEqual(["2026-11-20", "2026-11-25"]);
    expect(f.end).toBe(1_000_000 - 450_000 + 8_000_000);
  });

  it("catat cepat dari teks", () => {
    expect(parseMoneyText("25rb makan siang", "keluar")).toEqual({ amount: 25_000, description: "makan siang", category: "Makan & minum" });
    expect(parseMoneyText("bensin pertalite 50.000", "keluar")).toEqual({ amount: 50_000, description: "bensin pertalite", category: "Transportasi" });
    expect(parseMoneyText("1,5jt gaji freelance", "masuk")).toMatchObject({ amount: 1_500_000, category: "Gaji" });
    expect(parseMoneyText("Rp 450.000 token listrik", "keluar")).toMatchObject({ amount: 450_000, category: "Tagihan & utilitas" });
    expect(parseMoneyText("makan", "keluar")).toBeNull();
    expect(guessCategory("termin klien Jitu", "masuk")).toBe("Pendapatan proyek");
    expect(guessCategory("gaji", "keluar")).toBe("Lainnya");
  });
});

describe("berulang: tanda & berikutnya", () => {
  it("markRecurring & nextDue", async () => {
    const { markRecurring, nextDue, recurringTxId } = await import("./finance");
    const r = { freq: "bulanan" as const, start: "2026-09-05", active: true, lastPosted: "2026-09-05" };
    expect(markRecurring(r as never, "2026-10-05")).toEqual({ lastPosted: "2026-10-05" });
    expect(markRecurring(r as never, "2026-08-05")).toEqual({ lastPosted: "2026-09-05" });
    expect(markRecurring({ ...r, skipped: ["2026-01-05"] } as never, "2026-10-05", true)).toEqual({ lastPosted: "2026-10-05", skipped: ["2026-01-05", "2026-10-05"] });
    expect(nextDue(r, "2026-10-27")).toBe("2026-10-05");
    expect(nextDue({ ...r, lastPosted: "2026-10-05" }, "2026-10-27")).toBe("2026-11-05");
    expect(nextDue({ ...r, active: false }, "2026-10-27")).toBeUndefined();
    expect(recurringTxId("r1", "2026-10-05")).toBe("rtx-r1-2026-10-05");
  });
});
