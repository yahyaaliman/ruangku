import { describe, expect, it } from "vitest";
import { applyDayTemplate, BUILTIN_DAY_TEMPLATES, BUILTIN_PROJECT_TEMPLATES, fromProject, instantiate } from "./projectTemplates";
import { newTask } from "./tasks";
import type { Item } from "./types";
import type { Project, Task } from "./tasks";

describe("template", () => {
  it("template proyek: tanggal relatif & dependensi", () => {
    const tpl = BUILTIN_PROJECT_TEMPLATES[0];
    const ids = tpl.tasks.map((_, i) => `t${i}`);
    const tasks = instantiate(tpl, "p", "2026-11-02", ids);
    expect(tasks).toHaveLength(5);
    expect(tasks[0]).toMatchObject({ projectId: "p", start: "2026-11-02", due: "2026-11-04", status: "todo" });
    expect(tasks[4].dependsOn).toEqual(["t3"]);
    expect(tasks[0].checklist.map((c) => c.text)).toEqual(["Jadwalkan rapat", "Daftar kebutuhan", "Sepakati timeline"]);
  });

  it("proyek yang ada bisa disimpan lalu dipakai ulang", () => {
    const p: Item<Project> = { id: "p", updatedAt: 0, name: "Klien X", color: "bata", statuses: BUILTIN_PROJECT_TEMPLATES[0].statuses };
    const mk = (id: string, patch: Partial<Task>, order: number): Item<Task> => ({ id, updatedAt: 0, ...newTask({ title: id, projectId: "p", ...patch }, [p]), order });
    const tasks = [mk("a", { start: "2026-10-26", due: "2026-10-28" }, 1), mk("b", { due: "2026-10-30", dependsOn: ["a"] }, 2), mk("c", { parentId: "a" }, 3)];
    const tpl = fromProject(p, tasks);
    expect(tpl.tasks.map((t) => [t.startOffset, t.dueOffset])).toEqual([[0, 2], [undefined, 4], [undefined, undefined]]);
    expect(tpl.tasks[1].dependsOn).toEqual([0]);
    expect(tpl.tasks[2].parent).toBe(0);
    const again = instantiate(tpl, "q", "2026-12-01", ["x", "y", "z"]);
    expect(again[1]).toMatchObject({ due: "2026-12-05", dependsOn: ["x"] });
    expect(again[2].parentId).toBe("x");
  });

  it("template hari melewati blok yang bertabrakan", () => {
    const tpl = BUILTIN_DAY_TEMPLATES[0];
    const blocks = applyDayTemplate(tpl, "2026-10-26", [{ start: 540, end: 600 }]);
    expect(blocks.every((b) => b.date === "2026-10-26")).toBe(true);
    expect(blocks.some((b) => b.title.startsWith("Kerja fokus (tanpa"))).toBe(false);
    expect(applyDayTemplate(tpl, "2026-10-26", [{ start: 540, end: 600 }], false)).toHaveLength(tpl.blocks.length);
  });
});
