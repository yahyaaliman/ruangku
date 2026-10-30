// Loaded with require from each hook isolate. No per-request state is shared.
function data(record) { const value = record.get("data"); return value && typeof value === "object" && !Array.isArray(value) ? value : JSON.parse(toString(value || "{}")); }
function find(app, ws, rid, kind) {
  const r = app.findFirstRecordByFilter("records", "workspace = {:w} && rid = {:r} && kind = {:k} && deleted = false", { w: ws, r: rid, k: kind });
  return r;
}
function allowed(app, ws, uid, project) {
  if (!uid) return false;
  if (app.findRecordById("workspaces", ws).getString("owner") === uid) return true;
  let member;
  try { member = app.findFirstRecordByFilter("members", "workspace = {:w} && user = {:u}", { w: ws, u: uid }); } catch (_) { return false; }
  if (member.getString("role") === "admin" || member.getString("projectAccess") !== "selected") return true;
  for (const id of member.getStringSlice("projects")) {
    try { const p = app.findRecordById("records", id); if (p.getString("workspace") === ws && p.getString("kind") === "project" && p.getString("rid") === project) return true; } catch (_) {}
  }
  return false;
}
function validateMember(e) {
  const ws = e.record.getString("workspace");
  if (e.record.getString("role") === "pemilik" || e.record.getString("role") === "admin") { e.record.set("projectAccess", "all"); e.record.set("projects", []); }
  for (const id of e.record.getStringSlice("projects")) {
    const p = e.app.findRecordById("records", id);
    if (p.getString("workspace") !== ws || p.getString("kind") !== "project" || p.getBool("deleted")) throw new BadRequestError("Pilih proyek aktif dalam ruang kerja yang sama.");
  }
}
function validateRecord(e, creating) {
  const r = e.record, old = r.original(), ws = r.getString("workspace"), kind = r.getString("kind");
  if (!creating && (r.getString("rid") !== old.getString("rid") || kind !== old.getString("kind"))) throw new BadRequestError("Identitas record tidak dapat diubah.");
  if (!creating && ws !== old.getString("workspace")) throw new BadRequestError("Ruang kerja record tidak dapat diubah.");
  if (r.getBool("deleted")) {
    if (creating || r.getString("project") !== old.getString("project")) throw new BadRequestError("Penghapusan memerlukan record asal.");
    if (!e.auth?.isSuperuser() && !allowed(e.app, ws, e.auth?.id, old.getString("project"))) throw new ForbiddenError("Anda tidak memiliki akses ke proyek ini.");
    return; // Parent may already be a tombstone when deleting a whole subtree.
  }
  const d = data(r.getBool("deleted") ? old : r);
  const reference = (rid, k) => find(e.app, ws, rid, k).getString("project");
  let project = "";
  if (kind === "project") {
    project = r.getString("rid");
    if (d.workspaceId && d.workspaceId !== `ws-${ws}`) throw new BadRequestError("Ruang kerja proyek tidak cocok.");
    if (d.parentId) reference(d.parentId, "project");
  } else if (kind === "keyresult") project = reference(d.objectiveId, "objective");
  else if (kind === "kpientry") project = reference(d.kpiId, "kpi");
  else if (kind === "comment") project = reference(d.targetId, d.target === "task" ? "task" : "note");
  else if (kind === "note" && d.parentId) project = reference(d.parentId, "note");
  else if ((kind === "timeblock" || kind === "outbox") && d.taskId) project = reference(d.taskId, "task");
  else if (kind === "task" && d.parentId) project = reference(d.parentId, "task");
  else project = d.projectId || "";
  if (!project || (d.projectId && kind !== "project" && d.projectId !== project) || r.getString("project") !== project) throw new BadRequestError("Proyek record atau referensinya tidak cocok.");
  if (kind !== "project") find(e.app, ws, project, "project");
  // Changing a shared parent would move its dependent records outside their grants.
  if (!creating && old.getString("project") !== project) throw new BadRequestError("Record tim tidak dapat dipindah antarproyek. Buat salinan di proyek tujuan.");
  if (!e.auth?.isSuperuser() && !allowed(e.app, ws, e.auth?.id, project)) throw new ForbiddenError("Anda tidak memiliki akses ke proyek ini.");
}
module.exports = { allowed, validateMember, validateRecord };
