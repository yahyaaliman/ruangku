// Otomasi sederhana "jika X maka Y" untuk tugas.
// Mesin ini murni (tanpa efek samping): menerima kejadian dan aturan, lalu
// mengembalikan perubahan tugas dan efek yang harus dijalankan pemanggil.
import type { Item } from "./types";
import { addDays, dateKey, parseDateKey } from "./date";
import { firstDoneStatus, isTaskDone, Project, projectOf, Task, TaskPriority } from "./tasks";

export type TriggerType = "task_created" | "status_changed" | "task_completed" | "due_today" | "subtasks_done";
export const TRIGGER_LABEL: Record<TriggerType, string> = {
  task_created: "Saat tugas dibuat",
  status_changed: "Saat status berubah menjadi",
  task_completed: "Saat tugas selesai",
  due_today: "Saat tenggat tiba dan belum selesai",
  subtasks_done: "Saat semua subtugas selesai",
};

export type ActionType = "set_priority" | "add_tag" | "set_status" | "move_project" | "set_due_offset" | "add_checklist" | "notify" | "complete_parent";
export const ACTION_LABEL: Record<ActionType, string> = {
  set_priority: "Ubah prioritas",
  add_tag: "Tambah tag",
  set_status: "Ubah status",
  move_project: "Pindahkan ke proyek",
  set_due_offset: "Atur tenggat N hari dari sekarang",
  add_checklist: "Tambah checklist",
  notify: "Kirim notifikasi",
  complete_parent: "Selesaikan tugas induk",
};

export interface Trigger {
  type: TriggerType;
  projectId?: string; // kosong = semua proyek
  status?: string; // untuk status_changed
}

export interface Action {
  type: ActionType;
  priority?: TaskPriority;
  tag?: string;
  status?: string;
  projectId?: string;
  days?: number;
  items?: string[];
  text?: string;
}

export interface Rule {
  name: string;
  on: boolean;
  trigger: Trigger;
  actions: Action[];
}

export interface TaskEvent {
  type: TriggerType;
  task: Item<Task>;
}

export type Effect = { kind: "notify"; title: string; body: string } | { kind: "complete_parent"; parentId: string };

export function matches(rule: Rule, ev: TaskEvent): boolean {
  if (!rule.on || rule.trigger.type !== ev.type) return false;
  if (rule.trigger.projectId && rule.trigger.projectId !== ev.task.projectId) return false;
  if (ev.type === "status_changed" && rule.trigger.status && rule.trigger.status !== ev.task.status) return false;
  return true;
}

let seq = 0;
const cid = () => `c${Date.now().toString(36)}${(seq++).toString(36)}`;

/** Terapkan aksi ke salinan tugas. Mengembalikan tugas baru dan efek samping. */
export function applyActions(task: Task, actions: Action[], projects: Item<Project>[], today = dateKey()): { task: Task; effects: Effect[] } {
  let t: Task = { ...task, tags: [...task.tags], checklist: [...task.checklist] };
  const effects: Effect[] = [];
  for (const a of actions) {
    switch (a.type) {
      case "set_priority":
        if (a.priority) t.priority = a.priority;
        break;
      case "add_tag":
        if (a.tag && !t.tags.includes(a.tag)) t.tags.push(a.tag);
        break;
      case "set_status":
        if (a.status) t.status = a.status;
        break;
      case "move_project":
        if (a.projectId && a.projectId !== t.projectId) {
          const target = projectOf(projects, a.projectId);
          const wasDone = isTaskDone(t, projects);
          t = { ...t, projectId: a.projectId, status: wasDone ? firstDoneStatus(target) : target.statuses.find((s) => s.id === t.status)?.id ?? target.statuses.find((s) => !s.done)!.id };
        }
        break;
      case "set_due_offset":
        t.due = dateKey(addDays(parseDateKey(today), a.days ?? 0));
        break;
      case "add_checklist":
        for (const text of a.items ?? []) if (text.trim() && !t.checklist.some((c) => c.text === text)) t.checklist.push({ id: cid(), text, done: false });
        break;
      case "notify":
        effects.push({ kind: "notify", title: a.text?.trim() || "Otomasi Ruangku", body: t.title });
        break;
      case "complete_parent":
        if (t.parentId) effects.push({ kind: "complete_parent", parentId: t.parentId });
        break;
    }
  }
  return { task: t, effects };
}

/** Jalankan semua aturan yang cocok untuk satu kejadian. */
export function runRules(rules: Item<Rule>[], ev: TaskEvent, projects: Item<Project>[], today = dateKey()) {
  let task: Task = ev.task;
  const effects: Effect[] = [];
  const fired: string[] = [];
  for (const r of rules) {
    if (!matches(r, { ...ev, task: { ...ev.task, ...task } })) continue;
    const res = applyActions(task, r.actions, projects, today);
    task = res.task;
    effects.push(...res.effects);
    fired.push(r.id);
  }
  return { task, effects, fired };
}

/** Aturan bawaan yang langsung berguna untuk satu orang. */
export const PRESET_RULES: Rule[] = [
  { name: "Tugas mendesak saat tenggat tiba", on: true, trigger: { type: "due_today" }, actions: [{ type: "set_priority", priority: "urgent" }, { type: "notify", text: "Tenggat hari ini" }] },
  { name: "Selesaikan induk bila semua subtugas beres", on: true, trigger: { type: "subtasks_done" }, actions: [{ type: "complete_parent" }] },
  { name: "Tugas baru di Inbox diberi tenggat 3 hari", on: false, trigger: { type: "task_created", projectId: "inbox" }, actions: [{ type: "set_due_offset", days: 3 }] },
];
