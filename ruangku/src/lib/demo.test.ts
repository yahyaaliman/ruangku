import { describe, expect, it } from "vitest";
import { demoRecords, isDemo } from "./demo";

describe("database demo", () => {
  const rows = demoRecords({ now: new Date(2026, 9, 26, 8, 0) });
  const ids = (kind: string) => new Set(rows.filter((r) => r.kind === kind).map((r) => r.id));
  const projects = ids("project");
  const tasks = ids("task");
  const members = ids("member");

  it("enam proyek utama milik pengguna, masing-masing punya subproyek", () => {
    const roots = rows.filter((r) => r.kind === "project" && !r.data.parentId).map((r) => r.data.name);
    expect(roots).toEqual(["Internal", "Jitu", "Kuliah", "Penitipan Infaq", "Recruitment", "Riset Thesis"]);
    for (const r of rows.filter((x) => x.kind === "project" && !x.data.parentId)) expect(rows.some((x) => x.kind === "project" && x.data.parentId === r.id)).toBe(true);
  });

  it("semua rujukan valid", () => {
    const objectives = ids("objective");
    const krs = ids("keyresult");
    const kpis = ids("kpi");
    const notes = ids("note");
    for (const r of rows) {
      const x = r.data;
      if (x.projectId && x.projectId !== "inbox") expect(projects, `${r.id}.projectId`).toContain(x.projectId);
      if (r.kind === "project" && x.parentId) expect(projects).toContain(x.parentId);
      if (r.kind === "task" && x.parentId) expect(tasks).toContain(x.parentId);
      if (r.kind === "note" && x.parentId) expect(notes).toContain(x.parentId);
      for (const dep of x.dependsOn ?? []) expect(tasks, `${r.id}.dependsOn`).toContain(dep);
      for (const a of x.assignees ?? []) expect(members, `${r.id}.assignees`).toContain(a);
      if (x.leadId) expect(members).toContain(x.leadId);
      if (x.krId) expect(krs, `${r.id}.krId`).toContain(x.krId);
      if (r.kind === "keyresult" || (r.kind === "kpi" && x.objectiveId)) expect(objectives).toContain(x.objectiveId);
      if (r.kind === "kpientry") expect(kpis).toContain(x.kpiId);
      if (r.kind === "timeblock" && x.taskId) expect(tasks).toContain(x.taskId);
    }
  });

  it("status tugas cocok dengan alur status proyeknya", () => {
    const byId = new Map(rows.filter((r) => r.kind === "project").map((r) => [r.id, r.data]));
    for (const r of rows.filter((x) => x.kind === "task" && x.data.projectId !== "inbox")) {
      const st = byId.get(r.data.projectId).statuses.map((s: { id: string }) => s.id);
      expect(st, `${r.id} status ${r.data.status}`).toContain(r.data.status);
    }
  });

  it("blok rencana tidak bertabrakan dan semua bertanda demo", () => {
    const plan = rows.filter((r) => r.kind === "timeblock" && !r.data.tracked);
    for (const a of plan) for (const b of plan) if (a !== b && a.data.date === b.data.date) expect(a.data.end <= b.data.start || b.data.end <= a.data.start, `${a.id} vs ${b.id}`).toBe(true);
    expect(rows.every((r) => isDemo(r.data))).toBe(true);
    expect(new Set(rows.map((r) => r.id)).size).toBe(rows.length);
  });
});
