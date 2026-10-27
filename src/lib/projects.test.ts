import { describe, expect, it } from "vitest";
import { blockProject, childrenOf, flatTree, inScope, lineage, projectPath, projectSpan, scopeSet, subtreeIds, wouldCycleProject } from "./projects";
import type { Item } from "./types";
import type { Project } from "./tasks";

const mk = (id: string, name: string, parentId?: string, extra: Partial<Project> = {}): Item<Project> => ({ id, name, parentId, updatedAt: 0, color: "nila", statuses: [], ...extra });
const ps = [
  mk("thesis", "Riset Thesis"),
  mk("lit", "Studi literatur", "thesis"),
  mk("data", "Pengumpulan data", "thesis"),
  mk("survey", "Survei lapangan", "data"),
  mk("jitu", "Jitu"),
  mk("yatim", "Anak tanpa induk", "hilang"),
];

describe("proyek", () => {
  it("pohon, subtree, dan jalur", () => {
    expect(childrenOf(ps, undefined).map((p) => p.id)).toEqual(["yatim", "jitu", "thesis"]);
    expect([...subtreeIds(ps, "thesis")].sort()).toEqual(["data", "lit", "survey", "thesis"]);
    expect(lineage(ps, "survey").map((p) => p.id)).toEqual(["thesis", "data", "survey"]);
    expect(projectPath(ps, "survey")).toBe("Riset Thesis › Pengumpulan data › Survei lapangan");
    expect(flatTree(ps).map((x) => `${x.depth}:${x.p.id}`)).toEqual(["0:yatim", "0:jitu", "0:thesis", "1:data", "2:survey", "1:lit"]);
    expect(flatTree(ps, new Set(["thesis"])).length).toBe(3);
  });

  it("mencegah siklus induk", () => {
    expect(wouldCycleProject(ps, "thesis", "survey")).toBe(true);
    expect(wouldCycleProject(ps, "survey", "lit")).toBe(false);
    expect(wouldCycleProject(ps, "lit", undefined)).toBe(false);
  });

  it("ruang lingkup mencakup subproyek", () => {
    const s = scopeSet(ps, "data");
    expect(inScope(s, "survey")).toBe(true);
    expect(inScope(s, "lit")).toBe(false);
    expect(inScope(s, undefined)).toBe(false);
    expect(inScope(scopeSet(ps, "all"), undefined)).toBe(true);
  });

  it("blok mengikuti proyek tugasnya", () => {
    const tasks = [{ id: "t1", projectId: "lit" }, { id: "t2", projectId: "inbox" }];
    expect(blockProject({ taskId: "t1" }, tasks)).toBe("lit");
    expect(blockProject({ taskId: "t2" }, tasks)).toBeUndefined();
    expect(blockProject({ projectId: "jitu", taskId: "t1" }, tasks)).toBe("jitu");
  });

  it("rentang proyek dari tanggal atau dari isinya", () => {
    const withDates = mk("x", "X", undefined, { start: "2026-12-01", end: "2026-11-01" });
    expect(projectSpan(withDates, ps, [])).toEqual({ start: "2026-11-01", end: "2026-12-01", derived: false });
    const tasks = [{ projectId: "survey", start: "2026-11-03", due: "2026-11-20" }, { projectId: "lit", due: "2026-10-30" }, { projectId: "jitu", due: "2027-01-01" }];
    expect(projectSpan(ps[0], ps, tasks)).toEqual({ start: "2026-10-30", end: "2026-11-20", derived: true });
    expect(projectSpan(ps[4], ps, [])).toBeNull();
  });
});
