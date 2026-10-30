function ruangkuRecompute(app, wsId) {
  const LEVEL = { pemilik: 5, admin: 4, editor: 3, kontributor: 2, pembaca: 1 };
  let ws;
  try {
    ws = app.findRecordById("workspaces", wsId);
  } catch (_) {
    return;
  }
  const lists = { readers: [], writers: [], editors: [], admins: [] };
  const add = (key, id) => lists[key].indexOf(id) < 0 && lists[key].push(id);
  const owner = ws.get("owner");
  if (owner) ["readers", "writers", "editors", "admins"].forEach((k) => add(k, owner));
  const members = app.findRecordsByFilter("members", "workspace = {:w}", "", 0, 0, { w: wsId });
  for (const m of members) {
    let uid = m.get("user");
    if (!uid) {
      try {
        const u = app.findAuthRecordByEmail("users", m.get("email"));
        uid = u.id;
        m.set("user", uid);
        app.saveNoValidate(m);
      } catch (_) {
        continue; // belum mendaftar
      }
    }
    const lv = LEVEL[m.get("role")] || 0;
    if (lv >= 1) add("readers", uid);
    if (lv >= 2) add("writers", uid);
    if (lv >= 3) add("editors", uid);
    if (lv >= 4) add("admins", uid);
  }
  ws.set("readers", lists.readers);
  ws.set("writers", lists.writers);
  ws.set("editors", lists.editors);
  ws.set("admins", lists.admins);
  app.saveNoValidate(ws);
}


function ruangkuLinkUser(app, user) {
  const invites = app.findRecordsByFilter("members", "email = {:e}", "", 0, 0, { e: user.email() });
  const seen = {};
  for (const m of invites) {
    if (m.get("user") !== user.id) {
      m.set("user", user.id);
      app.saveNoValidate(m);
    }
    const w = m.get("workspace");
    if (!seen[w]) {
      seen[w] = true;
      ruangkuRecompute(app, w);
    }
  }
}

function ruangkuAssignees(app, rec) {
  let data = rec.get("data") || {};
  if (Array.isArray(data)) data = JSON.parse(toString(data));
  const ids = (data && data.assignees) || [];
  const emails = [];
  for (const id of ids) {
    const rid = String(id).replace(/^pbm-/, "");
    try {
      const m = app.findRecordById("members", rid);
      if (m.get("workspace") === rec.get("workspace")) emails.push(m.get("email"));
    } catch (_) {}
  }
  rec.set("assignee_emails", emails.join(","));
}


module.exports = { ruangkuRecompute, ruangkuLinkUser, ruangkuAssignees };
