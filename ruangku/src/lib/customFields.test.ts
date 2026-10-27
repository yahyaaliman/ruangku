import { describe, expect, it } from "vitest";
import { fieldsFor, formatField, parseField, sortByField, toCsv, type FieldDef } from "./customFields";
import { DEFAULT_STATUSES, type Project, type Task } from "./tasks";
import type { Item } from "./types";

const P = (id: string, extra: Partial<Project> = {}): Item<Project> => ({ id, updatedAt: 0, name: id, color: "nila", statuses: DEFAULT_STATUSES, ...extra });
const gaji: FieldDef = { id: "gaji", name: "Ekspektasi gaji", type: "rupiah" };
const skor: FieldDef = { id: "skor", name: "Skor", type: "angka" };

describe("kolom tambahan", () => {
  it("diwarisi dari proyek induk tanpa duplikat", () => {
    const ps = [P("rek", { fields: [gaji, skor] }), P("be", { parentId: "rek", fields: [{ id: "stack", name: "Stack", type: "teks" }, skor] })];
    expect(fieldsFor(ps, "be").map((f) => f.id)).toEqual(["gaji", "skor", "stack"]);
    expect(fieldsFor(ps, undefined)).toEqual([]);
  });

  it("membaca angka gaya Indonesia", () => {
    expect(parseField(gaji, "Rp 7.500.000")).toBe(7500000);
    expect(parseField(gaji, "7,5 jt")).toBe(7500000);
    expect(parseField(gaji, "850rb")).toBe(850000);
    expect(parseField(skor, "4,25")).toBe(4.25);
    expect(parseField(skor, "")).toBeUndefined();
    expect(parseField({ id: "l", name: "Link", type: "tautan" }, "drive.google.com/x")).toBe("https://drive.google.com/x");
    expect(parseField({ id: "c", name: "Ok", type: "centang" }, true)).toBe(true);
  });

  it("format tampilan", () => {
    expect(formatField(gaji, 7500000).replace(/\s/g, " ")).toBe("Rp 7.500.000");
    expect(formatField({ id: "c", name: "Ok", type: "centang" }, false)).toBe("Tidak");
  });

  it("urut berdasarkan kolom; kosong di bawah", () => {
    const t = (id: string, v?: number): Item<Task> => ({ id, updatedAt: 0, title: id, projectId: "be", status: "todo", tags: [], checklist: [], dependsOn: [], order: 0, createdAt: 0, custom: v === undefined ? {} : { skor: v } });
    const list = [t("a", 3), t("b"), t("c", 5)];
    expect(sortByField(list, "skor", -1, [skor]).map((x) => x.id)).toEqual(["c", "a", "b"]);
    expect(sortByField(list, "title", 1, [skor]).map((x) => x.id)).toEqual(["a", "b", "c"]);
  });

  it("CSV untuk Excel Indonesia", () => {
    expect(toCsv([["Nama", "Gaji"], ['Andi "A"', 7500000.5]])).toBe('﻿Nama;Gaji\r\n"Andi ""A""";7500000,5\r\n');
  });
});
