import { CalendarDays, Flag, Link2, ListChecks, Lock, Repeat, Timer } from "lucide-react";
import type { Item } from "../lib/types";
import { blockers, dueState, fmtDuration, isTaskDone, PRIORITIES, Project, projectOf, statusesOf, subtaskProgress, Task, TaskPriority } from "../lib/tasks";
import { dateKey, parseDateKey } from "../lib/date";
import { fmtMin } from "../lib/timeblocks";
import { useMembers } from "../lib/members";
import { AvatarStack } from "../team/Avatars";

const SHORT = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

export function shortDate(d: string, today = dateKey()): string {
  if (d === today) return "Hari ini";
  const t = parseDateKey(today);
  const x = parseDateKey(d);
  const diff = Math.round((x.getTime() - t.getTime()) / 86400000);
  if (diff === 1) return "Besok";
  if (diff === -1) return "Kemarin";
  return `${x.getDate()} ${SHORT[x.getMonth()]}${x.getFullYear() !== t.getFullYear() ? ` ${x.getFullYear()}` : ""}`;
}

export function PriorityFlag({ p }: { p?: TaskPriority }) {
  if (!p) return null;
  const label = PRIORITIES.find((x) => x.id === p)?.label;
  return (
    <span className={`tk-flag pr-${p}`} title={`Prioritas ${label}`} aria-label={`Prioritas ${label}`}>
      <Flag size={13} />
    </span>
  );
}

export function DueChip({ t, done }: { t: Pick<Task, "due" | "dueTime">; done?: boolean }) {
  if (!t.due) return null;
  const st = done ? "done" : dueState(t);
  return (
    <span className={`tk-due due-${st}`}>
      <CalendarDays size={12} /> {shortDate(t.due)}
      {t.dueTime !== undefined && ` ${fmtMin(t.dueTime)}`}
    </span>
  );
}

export function StatusDot({ project, status }: { project: Item<Project>; status: string }) {
  const s = statusesOf(project).find((x) => x.id === status);
  return <span className={`tk-sdot bc-${s?.color ?? "abu"}`} title={s?.label} />;
}

export function TaskMeta({ t, all, projects, showProject, tracked }: { t: Item<Task>; all: Item<Task>[]; projects: Item<Project>[]; showProject?: boolean; tracked?: number }) {
  const sub = subtaskProgress(t, all, projects);
  const cl = t.checklist.length ? `${t.checklist.filter((c) => c.done).length}/${t.checklist.length}` : null;
  const blocked = blockers(t, all, projects).length > 0 && !isTaskDone(t, projects);
  const p = projectOf(projects, t.projectId);
  const members = useMembers();
  return (
    <span className="tk-meta">
      <AvatarStack ids={t.assignees} members={members} />
      {blocked && (
        <span className="tk-chip warn" title="Terblokir oleh tugas lain yang belum selesai">
          <Lock size={11} /> Terblokir
        </span>
      )}
      {showProject && (
        <span className="tk-chip tp-proyek">
          {p.icon ? <span aria-hidden="true">{p.icon}</span> : <i className={`tk-pdot bc-${p.color}`} />} {p.name}
        </span>
      )}
      <DueChip t={t} done={isTaskDone(t, projects)} />
      {sub.total > 0 && (
        <span className="tk-chip tp-subtugas" title="Subtugas selesai">
          <ListChecks size={12} /> {sub.done}/{sub.total}
        </span>
      )}
      {cl && <span className="tk-chip tp-checklist" title="Checklist">☑ {cl}</span>}
      {t.estimate ? (
        <span className="tk-chip tp-estimasi" title="Estimasi">
          <Timer size={12} /> {tracked ? `${fmtDuration(Math.round(tracked))} / ` : ""}
          {fmtDuration(t.estimate)}
        </span>
      ) : tracked ? (
        <span className="tk-chip tp-estimasi" title="Waktu tercatat">
          <Timer size={12} /> {fmtDuration(Math.round(tracked))}
        </span>
      ) : null}
      {t.recurrence && (
        <span className="tk-chip tp-berulang" title="Berulang">
          <Repeat size={11} />
        </span>
      )}
      {t.krId && (
        <span className="tk-chip tp-kr" title="Tertaut ke key result">
          <Link2 size={11} /> KR
        </span>
      )}
      {t.tags.map((g) => (
        <span key={g} className="tk-tag">#{g}</span>
      ))}
    </span>
  );
}

export function TaskCheck({ done, onToggle, label }: { done: boolean; onToggle: () => void; label: string }) {
  return <button className="check" aria-pressed={done} aria-label={done ? `Buka lagi: ${label}` : `Selesaikan: ${label}`} onClick={(e) => (e.stopPropagation(), onToggle())} />;
}
