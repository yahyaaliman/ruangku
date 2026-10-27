import { describe, expect, it } from "vitest";
import { barRange, blockers, dueState, INBOX_ID, isTaskDone, newTask, nextOccurrenceTask, nextRecurrence, orderBetween, workload, wouldCycle } from "./tasks";
import type { Item } from "./types";
import type { Project, Task } from "./tasks";

const projects: Item<Project>[] = [
  { id: "p", updatedAt: 0, name: "Klien", color: "nila", statuses: [{ id: "a", label: "Baru", color: "abu" }, { id: "z", label: "Beres", color: "daun", done: true }] },
];
const mk = (id: string, patch: Partial<Task>): Item<Task> => ({ id, updatedAt: 0, ...newTask({ title: id, ...patch }, projects) });

describe("tugas", () => {
  it("status default mengikuti proyek; inbox memakai status bawaan", () => {
    expect(newTask({ title: "x", projectId: "p" }, projects).status).toBe("a");
    expect(newTask({ title: "x" }, projects)).toMatchObject({ projectId: INBOX_ID, status: "todo" });
    expect(isTaskDone(mk("t", { projectId: "p", status: "z" }), projects)).toBe(true);
    expect(isTaskDone(mk("t", { status: "done" }), projects)).toBe(true);
    // nilai undefined dari isian opsional tidak menghapus default
    expect(newTask({ title: "x", projectId: undefined, status: undefined, tags: undefined }, projects)).toMatchObject({ projectId: INBOX_ID, status: "todo", tags: [] });
  });

  it("dependensi: blocker dan deteksi siklus", () => {
    const a = mk("a", {});
    const b = mk("b", { dependsOn: ["a"] });
    const c = mk("c", { dependsOn: ["b"] });
    const all = [a, b, c];
    expect(blockers(b, all, projects).map((x) => x.id)).toEqual(["a"]);
    expect(wouldCycle("a", "c", all)).toBe(true); // a -> c -> b -> a
    expect(wouldCycle("c", "a", all)).toBe(false);
    expect(wouldCycle("a", "a", all)).toBe(true);
    expect(blockers(b, [{ ...a, status: "done" }, b], projects)).toEqual([]);
  });

  it("tenggat dan pengulangan", () => {
    expect(dueState({ due: "2026-10-25" }, "2026-10-26")).toBe("overdue");
    expect(dueState({ due: "2026-10-28" }, "2026-10-26")).toBe("soon");
    expect(dueState({}, "2026-10-26")).toBe("none");
    expect(nextRecurrence("2026-10-30", { freq: "weekdays", interval: 1 })).toBe("2026-11-02");
    expect(nextRecurrence("2027-01-31", { freq: "monthly", interval: 1 })).toBe("2027-02-28");
    expect(nextRecurrence("2026-10-26", { freq: "weekly", interval: 2 })).toBe("2026-11-09");
    const t = mk("r", { start: "2026-10-24", due: "2026-10-26", status: "done", recurrence: { freq: "weekly", interval: 1 }, checklist: [{ id: "c", text: "x", done: true }] });
    const n = nextOccurrenceTask(t, projects)!;
    expect(n).toMatchObject({ due: "2026-11-02", start: "2026-10-31", status: "todo" });
    expect(n.checklist[0].done).toBe(false);
  });

  it("urutan, timeline, beban kerja", () => {
    const list = [{ id: "a", order: 1 }, { id: "b", order: 2 }, { id: "c", order: 3 }];
    expect(orderBetween(list, "b", "c")).toBe(1.5);
    expect(orderBetween(list, null, "a")).toBe(4);
    expect(orderBetween(list, "a", "c")).toBe(0);
    expect(barRange({ due: "2026-10-26" })).toEqual({ start: "2026-10-26", end: "2026-10-26" });
    expect(barRange({ start: "2026-10-28", due: "2026-10-26" })).toEqual({ start: "2026-10-26", end: "2026-10-28" });
    const w = workload([mk("a", { due: "2026-10-26", estimate: 90 }), mk("b", { due: "2026-10-26" }), mk("c", { due: "2026-10-26", status: "done" })], projects, ["2026-10-26"]);
    expect(w.get("2026-10-26")).toEqual({ minutes: 120, count: 2 });
  });
});
