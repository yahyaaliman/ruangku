import { describe, expect, it } from "vitest";
import { applyActions, matches, runRules } from "./automation";
import type { Rule } from "./automation";
import { newTask } from "./tasks";
import type { Item } from "./types";
import type { Project, Task } from "./tasks";

const projects: Item<Project>[] = [{ id: "p", updatedAt: 0, name: "Klien", color: "nila", statuses: [{ id: "a", label: "Baru", color: "abu" }, { id: "b", label: "Proses", color: "nila" }, { id: "z", label: "Beres", color: "daun", done: true }] }];
const task = (patch: Partial<Task> = {}): Item<Task> => ({ id: "t", updatedAt: 0, ...newTask({ title: "Kirim penawaran", ...patch }, projects) });
const rule = (r: Partial<Rule>): Item<Rule> => ({ id: "r" + Math.random(), updatedAt: 0, name: "x", on: true, trigger: { type: "task_created" }, actions: [], ...r });

describe("otomasi", () => {
  it("cocokkan pemicu, proyek, dan status", () => {
    const r = rule({ trigger: { type: "status_changed", projectId: "p", status: "b" } });
    expect(matches(r, { type: "status_changed", task: task({ projectId: "p", status: "b" }) })).toBe(true);
    expect(matches(r, { type: "status_changed", task: task({ projectId: "p", status: "a" }) })).toBe(false);
    expect(matches(r, { type: "status_changed", task: task({ status: "b" }) })).toBe(false); // proyek lain
    expect(matches({ ...r, on: false }, { type: "status_changed", task: task({ projectId: "p", status: "b" }) })).toBe(false);
  });

  it("aksi mengubah tugas dan menghasilkan efek", () => {
    const { task: t, effects } = applyActions(
      task({ parentId: "induk" }),
      [
        { type: "set_priority", priority: "tinggi" },
        { type: "add_tag", tag: "klien" },
        { type: "add_tag", tag: "klien" },
        { type: "set_due_offset", days: 2 },
        { type: "add_checklist", items: ["Cek harga", "Kirim email"] },
        { type: "notify", text: "Tugas baru" },
        { type: "complete_parent" },
      ],
      projects,
      "2026-10-26",
    );
    expect(t).toMatchObject({ priority: "tinggi", tags: ["klien"], due: "2026-10-28" });
    expect(t.checklist.map((c) => c.text)).toEqual(["Cek harga", "Kirim email"]);
    expect(effects).toEqual([{ kind: "notify", title: "Tugas baru", body: "Kirim penawaran" }, { kind: "complete_parent", parentId: "induk" }]);
  });

  it("pindah proyek menjaga status selesai/terbuka", () => {
    const moved = applyActions(task({ status: "done" }), [{ type: "move_project", projectId: "p" }], projects).task;
    expect(moved).toMatchObject({ projectId: "p", status: "z" });
    const open = applyActions(task({ status: "todo" }), [{ type: "move_project", projectId: "p" }], projects).task;
    expect(open.status).toBe("a");
  });

  it("beberapa aturan berjalan berurutan", () => {
    const res = runRules([rule({ actions: [{ type: "add_tag", tag: "a" }] }), rule({ actions: [{ type: "add_tag", tag: "b" }] }), rule({ trigger: { type: "due_today" } })], { type: "task_created", task: task() }, projects);
    expect(res.task.tags).toEqual(["a", "b"]);
    expect(res.fired).toHaveLength(2);
  });
});
