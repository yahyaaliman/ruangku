import { describe, expect, it } from "vitest";
import { duplicatePages, duplicateProject } from "./ops";
import { DEFAULT_STATUSES, type Project, type Task } from "../lib/tasks";
import type { Item, Note } from "../lib/types";

let k = 0;
const nid = () => `x${++k}`;

describe("duplikat", () => {
  it("halaman beserta subhalaman", () => {
    k = 0;
    const notes: Item<Note>[] = [
      { id: "a", updatedAt: 0, title: "Bab 1", body: "isi", tags: [], projectId: "p", order: 3, sticky: { color: "kunyit" } },
      { id: "b", updatedAt: 0, title: "Sub", body: "", tags: [], parentId: "a" },
    ];
    const out = duplicatePages(notes, "a", nid);
    expect(out.map((x) => x.id)).toEqual(["x1", "x2"]);
    expect(out[0].data).toMatchObject({ title: "Bab 1 (salinan)", projectId: "p", order: 4, body: "isi" });
    expect(out[0].data.sticky).toBeUndefined();
    expect(out[1].data.parentId).toBe("x1");
  });

  it("proyek beserta subproyek dan tugas", () => {
    k = 0;
    const P = (id: string, extra: Partial<Project> = {}): Item<Project> => ({ id, updatedAt: 0, name: id, color: "nila", statuses: DEFAULT_STATUSES, ...extra });
    const projects = [P("r", { workspaceId: "ws" }), P("s", { parentId: "r" }), P("lain")];
    const T = (id: string, extra: Partial<Task>): Item<Task> => ({ id, updatedAt: 0, title: id, projectId: "r", status: "todo", tags: [], checklist: [{ id: "c", text: "x", done: true }], dependsOn: [], order: 0, createdAt: 0, ...extra });
    const tasks = [T("t1", { status: "done", completedAt: 5 }), T("t2", { projectId: "s", dependsOn: ["t1"], parentId: "t1" }), T("t3", { projectId: "lain" })];
    const out = duplicateProject(projects, tasks, "r", nid, 99);
    expect(out.projects.map((p) => p.data.name)).toEqual(["r (salinan)", "s"]);
    expect(out.projects[0].data.workspaceId).toBeUndefined();
    expect(out.projects[1].data.parentId).toBe(out.projects[0].id);
    expect(out.tasks).toHaveLength(2);
    const t1 = out.tasks.find((t) => t.data.title === "t1")!;
    const t2 = out.tasks.find((t) => t.data.title === "t2")!;
    expect(t1.data).toMatchObject({ status: "todo", completedAt: undefined, createdAt: 99 });
    expect(t1.data.checklist[0].done).toBe(false);
    expect(t2.data.parentId).toBe(t1.id);
    expect(t2.data.dependsOn).toEqual([t1.id]);
    expect(t2.data.projectId).toBe(out.projects[1].id);
  });
});
