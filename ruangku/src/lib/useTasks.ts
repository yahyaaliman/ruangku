import { useCallback, useMemo, useRef } from "react";
import type { Item, KeyResult } from "./types";
import { api, newId } from "./api";
import { strip, useRecords } from "./useRecords";
import { dateKey } from "./date";
import { Effect, Rule, runRules, TriggerType } from "./automation";
import { firstDoneStatus, firstOpenStatus, INBOX_PROJECT, isTaskDone, newTask, nextOccurrenceTask, Project, projectOf, Task } from "./tasks";

export function useTasks() {
  const projects = useRecords<Project>("project");
  const tasks = useRecords<Task>("task");
  const rules = useRecords<Rule>("automation");
  const krs = useRecords<KeyResult>("keyresult");

  const allProjects = useMemo(
    () => [INBOX_PROJECT, ...projects.items.filter((p) => !p.archived).sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.name.localeCompare(b.name))],
    [projects.items],
  );
  // Referensi terbaru untuk dipakai di dalam aksi asinkron berantai.
  const ref = useRef({ tasks: tasks.items, projects: allProjects, rules: rules.items, krs: krs.items });
  ref.current = { tasks: tasks.items, projects: allProjects, rules: rules.items, krs: krs.items };

  const bumpKr = useCallback(
    async (t: Task, sign: 1 | -1) => {
      if (!t.krId) return;
      const kr = ref.current.krs.find((k) => k.id === t.krId);
      if (!kr) return;
      const inc = (t.krIncrement ?? 1) * sign;
      const value = Math.round((kr.current + inc) * 1000) / 1000;
      const history = [...(kr.history ?? []), { at: Date.now(), value, note: `${sign > 0 ? "Tugas selesai" : "Tugas dibuka lagi"}: ${t.title}` }].slice(-60);
      await krs.save({ ...strip(kr), current: value, history }, kr.id);
    },
    [krs],
  );

  /** Antrean pesan penugasan untuk bot (WA/Telegram/Email). */
  const enqueueAssign = useCallback(async (taskId: string, before: string[] | undefined, after: string[] | undefined) => {
    const added = (after ?? []).filter((m) => !(before ?? []).includes(m));
    for (const memberId of added) await api.save(newId(), "outbox", { type: "assign", taskId, memberId, at: Date.now(), status: "pending", tries: 0 });
  }, []);

  const runEffects = useCallback(async (effects: Effect[]) => {
    for (const e of effects) {
      if (e.kind === "notify") api.notifySend(e.title, e.body).catch(() => {});
      if (e.kind === "complete_parent") {
        const parent = ref.current.tasks.find((t) => t.id === e.parentId);
        if (parent && !isTaskDone(parent, ref.current.projects)) await update(parent.id, { status: firstDoneStatus(projectOf(ref.current.projects, parent.projectId)) }, true);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const automate = useCallback(
    (type: TriggerType, t: Item<Task>) => {
      const res = runRules(ref.current.rules, { type, task: t }, ref.current.projects);
      return res;
    },
    [],
  );

  const create = useCallback(
    async (partial: Partial<Task> & { title: string }, opts: { skipRules?: boolean } = {}) => {
      const list = ref.current.tasks;
      const order = Math.max(0, ...list.map((x) => x.order)) + 1;
      let t = newTask(partial, ref.current.projects, order);
      const id = newId();
      let effects: Effect[] = [];
      if (!opts.skipRules) {
        const r = automate("task_created", { ...t, id, updatedAt: 0 });
        t = r.task;
        effects = r.effects;
      }
      await tasks.save(t, id);
      await runEffects(effects);
      if (t.assignees?.length) await enqueueAssign(id, [], t.assignees);
      return id;
    },
    [tasks, automate, runEffects, enqueueAssign],
  );

  /** Ubah tugas. Menangani perubahan status: waktu selesai, KR, pengulangan, otomasi. */
  async function update(id: string, patch: Partial<Task> | ((t: Task) => Task), fromAutomation = false): Promise<void> {
    const cur = ref.current.tasks.find((t) => t.id === id);
    if (!cur) return;
    const prev = strip(cur);
    let next: Task = typeof patch === "function" ? patch(prev) : { ...prev, ...patch };
    const ps = ref.current.projects;
    const wasDone = isTaskDone(prev, ps);
    let isDone = isTaskDone(next, ps);
    let effects: Effect[] = [];
    if (next.status !== prev.status && !fromAutomation) {
      const a = automate("status_changed", { ...next, id, updatedAt: 0 });
      next = a.task;
      effects.push(...a.effects);
      isDone = isTaskDone(next, ps);
      if (isDone && !wasDone) {
        const b = automate("task_completed", { ...next, id, updatedAt: 0 });
        next = b.task;
        effects.push(...b.effects);
      }
    }
    if (isDone && !wasDone) next.completedAt = Date.now();
    if (!isDone && wasDone) next.completedAt = undefined;
    // Simpan ke ref dulu supaya efek berantai melihat keadaan terbaru.
    ref.current.tasks = ref.current.tasks.map((t) => (t.id === id ? { ...next, id, updatedAt: Date.now() } : t));
    await tasks.save(next, id);
    if ((next.assignees ?? []).join() !== (prev.assignees ?? []).join()) await enqueueAssign(id, prev.assignees, next.assignees);

    if (isDone !== wasDone) await bumpKr(next, isDone ? 1 : -1);
    if (isDone && !wasDone && next.recurrence) {
      const n = nextOccurrenceTask(next, ps);
      if (n) await tasks.save({ ...n, order: next.order + 0.001 }, newId());
    }
    // Semua subtugas selesai -> pemicu pada induk.
    if (isDone && !wasDone && next.parentId) {
      const siblings = ref.current.tasks.filter((t) => t.parentId === next.parentId);
      const parent = ref.current.tasks.find((t) => t.id === next.parentId);
      if (parent && siblings.length && siblings.every((s) => isTaskDone(s, ps))) {
        const r = automate("subtasks_done", { ...next, id, updatedAt: 0 });
        effects.push(...r.effects);
      }
    }
    await runEffects(effects);
  }

  const remove = useCallback(
    async (id: string) => {
      const all = ref.current.tasks;
      const ids = new Set<string>([id]);
      // Hapus juga semua subtugas (bertingkat).
      let grew = true;
      while (grew) {
        grew = false;
        for (const t of all) if (t.parentId && ids.has(t.parentId) && !ids.has(t.id)) (ids.add(t.id), (grew = true));
      }
      for (const x of ids) await tasks.remove(x);
      for (const t of all) {
        if (!ids.has(t.id) && t.dependsOn.some((d) => ids.has(d))) await tasks.save({ ...strip(t), dependsOn: t.dependsOn.filter((d) => !ids.has(d)) }, t.id);
      }
    },
    [tasks],
  );

  const saveProject = useCallback((p: Project, id?: string) => projects.save(p, id), [projects]);
  const removeProject = useCallback(
    async (id: string) => {
      // Tugas pindah ke proyek induk (atau Inbox), subproyek naik satu tingkat.
      const gone = projects.items.find((p) => p.id === id);
      const parent = gone?.parentId ? ref.current.projects.find((p) => p.id === gone.parentId) : undefined;
      const target = parent ?? INBOX_PROJECT;
      for (const t of ref.current.tasks.filter((x) => x.projectId === id)) {
        const done = isTaskDone(t, ref.current.projects);
        await tasks.save({ ...strip(t), projectId: target.id, status: done ? firstDoneStatus(target) : firstOpenStatus(target) }, t.id);
      }
      for (const c of projects.items.filter((p) => p.parentId === id)) await projects.save({ ...strip(c), parentId: gone?.parentId }, c.id);
      await projects.remove(id);
    },
    [projects, tasks],
  );

  /** Jalankan otomasi "tenggat tiba" untuk tugas jatuh tempo hari ini (dipanggil berkala). */
  const runDueToday = useCallback(async () => {
    const today = dateKey();
    const dueRules = ref.current.rules.filter((r) => r.on && r.trigger.type === "due_today");
    if (!dueRules.length) return;
    for (const t of ref.current.tasks) {
      if (t.due !== today || isTaskDone(t, ref.current.projects)) continue;
      const pending = dueRules.filter((r) => !(t.autoFired ?? []).includes(`${r.id}:${today}`));
      if (!pending.length) continue;
      const res = runRules(pending, { type: "due_today", task: t }, ref.current.projects, today);
      if (!res.fired.length) continue;
      const fired = [...(t.autoFired ?? []).filter((k) => k.endsWith(today)), ...res.fired.map((r) => `${r}:${today}`)];
      await tasks.save({ ...strip(t), ...res.task, autoFired: fired }, t.id);
      await runEffects(res.effects);
    }
  }, [tasks, runEffects]);

  return {
    projects: allProjects,
    rawProjects: projects,
    tasks: tasks.items,
    rules,
    krs: krs.items,
    loading: tasks.loading || projects.loading,
    create,
    update,
    remove,
    saveProject,
    removeProject,
    runDueToday,
  };
}
