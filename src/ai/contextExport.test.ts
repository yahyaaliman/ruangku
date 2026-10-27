import { describe, expect, it } from "vitest";
import { demoRecords } from "../lib/demo";
import { projectContextMarkdown, type ContextInput } from "./contextExport";

const now = new Date(2026, 9, 27, 9, 0);
const recs = demoRecords({ now });
const of = <T>(kind: string) => recs.filter((r) => r.kind === kind).map((r) => ({ ...(r.data as T), id: r.id, updatedAt: r.updatedAt })) as never;
const base = (projectId: string | null): ContextInput => ({ projectId, today: "2026-10-27", projects: of("project"), tasks: of("task"), notes: of("note"), meetings: of("meeting"), courses: of("course"), ledger: of("ledger"), budgets: of("budget"), objectives: of("objective"), keyResults: of("keyresult") });

describe("ekspor konteks proyek", () => {
  it("satu proyek: hanya data proyek itu, tanpa keuangan pribadi", () => {
    const md = projectContextMarkdown(base("pj-jitu"));
    expect(md).toMatch(/^# Konteks Ruangku: .*Jitu/);
    expect(md).toContain("## Tugas terbuka");
    expect(md).toContain("Sprint review Jitu");
    expect(md).toContain("## Keuangan proyek");
    expect(md).toContain("Gaji tim");
    expect(md).toContain("Anggaran Pemasaran");
    expect(md).not.toContain("Sewa kos");
    expect(md).not.toContain("Riset Thesis");
  });
  it("proyek kuliah memuat mata kuliah", () => {
    const md = projectContextMarkdown(base("pj-kuliah"));
    expect(md).toContain("## Mata kuliah");
    expect(md).toContain("AI5101");
  });
});
