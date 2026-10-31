import { lineage } from "../lib/projects";
import type { Member } from "../lib/team";
import type { Project } from "../lib/tasks";
import type { Item } from "../lib/types";

export function memberCanAccess(member: Member, projectId: string | undefined, projects: Item<Project>[]) {
  if (!member.workspaceId) return true; // Existing local-only contacts keep their explicit assignments.
  if (!projectId || !lineage(projects, projectId).some(p => p.workspaceId === member.workspaceId)) return false;
  return ["pemilik", "admin"].includes(member.role) || member.projectAccess !== "selected" || !!member.projectIds?.includes(projectId);
}
