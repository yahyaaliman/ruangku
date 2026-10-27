/// <reference path="../pb_data/types.d.ts" />
// Hook server tim Ruangku:
// 1. Menegakkan peran: daftar readers/writers/editors/admins di setiap workspace
//    dihitung ulang dari koleksi members setiap kali anggota/pengguna berubah.
// 2. Webhook WhatsApp Cloud API: verifikasi (GET) dan pesan masuk (POST) ke koleksi inbox.
// 3. Kirim WhatsApp lewat server (token tidak perlu disimpan di tiap komputer).
//
// Variabel lingkungan:
//   RUANGKU_WA_VERIFY_TOKEN  token verifikasi webhook (bebas, samakan dengan di Meta)
//   RUANGKU_WA_APP_SECRET    App Secret aplikasi Meta (untuk cek tanda tangan X-Hub-Signature-256)
//   RUANGKU_WA_TOKEN         token akses WhatsApp Cloud API (opsional, untuk kirim lewat server)
//   RUANGKU_WA_PHONE_ID      Phone Number ID WhatsApp (opsional, untuk kirim lewat server)
//   RUANGKU_WA_GRAPH         versi Graph API, default v23.0

/** Hitung ulang daftar peran satu workspace dari anggotanya. */
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

// Pemilik otomatis menjadi anggota berperan "pemilik".
onRecordAfterCreateSuccess((e) => {
  try {
    const owner = e.app.findRecordById("users", e.record.get("owner"));
    const col = e.app.findCollectionByNameOrId("members");
    const m = new Record(col);
    m.set("workspace", e.record.id);
    m.set("email", owner.email());
    m.set("name", owner.get("name") || owner.email());
    m.set("role", "pemilik");
    m.set("user", owner.id);
    e.app.save(m);
  } catch (err) {
    console.log("ruangku: gagal menambah pemilik", err);
  }
  ruangkuRecompute(e.app, e.record.id);
  e.next();
}, "workspaces");

// Admin tidak boleh menyentuh pemilik atau mengangkat orang menjadi pemilik.
onRecordUpdateRequest((e) => {
  const auth = e.auth;
  const ws = e.app.findRecordById("workspaces", e.record.get("workspace"));
  const isOwner = auth && ws.get("owner") === auth.id;
  const original = e.record.original();
  if (!isOwner && (original.get("role") === "pemilik" || e.record.get("role") === "pemilik")) {
    throw new ForbiddenError("Hanya pemilik ruang kerja yang boleh mengubah peran pemilik.");
  }
  e.next();
}, "members");

onRecordAfterCreateSuccess((e) => (ruangkuRecompute(e.app, e.record.get("workspace")), e.next()), "members");
onRecordAfterUpdateSuccess((e) => (ruangkuRecompute(e.app, e.record.get("workspace")), e.next()), "members");
onRecordAfterDeleteSuccess((e) => (ruangkuRecompute(e.app, e.record.get("workspace")), e.next()), "members");

// Pengguna baru mendaftar / masuk: tautkan ke undangan anggota dengan email yang sama.
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
onRecordAfterCreateSuccess((e) => (ruangkuLinkUser(e.app, e.record), e.next()), "users");
onRecordAuthRequest((e) => (ruangkuLinkUser(e.app, e.record), e.next()), "users");

// Isi assignee_emails tidak boleh dipalsukan: dihitung dari data.assignees + anggota workspace.
function ruangkuAssignees(app, rec) {
  const data = rec.get("data") || {};
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
onRecordCreateRequest((e) => (ruangkuAssignees(e.app, e.record), e.next()), "records");
onRecordUpdateRequest((e) => {
  // Penilaian izin memakai nilai lama assignee_emails; nilai baru dihitung sesudahnya.
  e.next();
}, "records");
onRecordAfterUpdateSuccess((e) => {
  const before = e.record.get("assignee_emails");
  ruangkuAssignees(e.app, e.record);
  if (before !== e.record.get("assignee_emails")) e.app.saveNoValidate(e.record);
  e.next();
}, "records");

// ---------- WhatsApp Cloud API ----------

routerAdd("GET", "/api/ruangku/wa/webhook", (e) => {
  const q = e.request.url.query();
  if (q.get("hub.mode") === "subscribe" && q.get("hub.verify_token") === $os.getenv("RUANGKU_WA_VERIFY_TOKEN") && $os.getenv("RUANGKU_WA_VERIFY_TOKEN")) {
    return e.string(200, q.get("hub.challenge"));
  }
  return e.string(403, "token verifikasi salah");
});

routerAdd("POST", "/api/ruangku/wa/webhook", (e) => {
  const raw = toString(e.request.body);
  const secret = $os.getenv("RUANGKU_WA_APP_SECRET");
  if (secret) {
    const sig = (e.request.header.get("X-Hub-Signature-256") || "").replace("sha256=", "");
    if (!sig || !$security.equal(sig, $security.hs256(raw, secret))) return e.string(401, "tanda tangan tidak valid");
  }
  let body;
  try {
    body = JSON.parse(raw);
  } catch (_) {
    return e.string(400, "JSON tidak valid");
  }
  const col = $app.findCollectionByNameOrId("inbox");
  for (const entry of body.entry || []) {
    for (const ch of entry.changes || []) {
      const v = ch.value || {};
      const names = {};
      for (const c of v.contacts || []) names[c.wa_id] = (c.profile && c.profile.name) || "";
      for (const m of v.messages || []) {
        const text = m.type === "text" ? m.text.body : m.type === "button" ? m.button.text : m.type === "interactive" ? JSON.stringify(m.interactive) : `[${m.type}]`;
        // Cari workspace dari nomor pengirim (anggota terdaftar).
        let wsId = "";
        try {
          const all = $app.findRecordsByFilter("members", "wa != ''", "", 0, 0);
          const digits = (s) => {
            let d = String(s || "").replace(/\D/g, "");
            if (d.indexOf("0") === 0) d = "62" + d.slice(1);
            return d;
          };
          for (const mm of all) if (digits(mm.get("wa")) === digits(m.from)) {
            wsId = mm.get("workspace");
            break;
          }
        } catch (_) {}
        const r = new Record(col);
        if (wsId) r.set("workspace", wsId);
        r.set("channel", "wa");
        r.set("sender", m.from);
        r.set("sender_name", names[m.from] || "");
        r.set("text", text);
        r.set("raw", m);
        r.set("processed", false);
        $app.save(r);
      }
    }
  }
  return e.json(200, { ok: true });
});

// Kirim pesan WhatsApp lewat server. Hanya admin/pemilik workspace.
routerAdd("POST", "/api/ruangku/wa/send", (e) => {
  const info = e.requestInfo();
  const b = info.body || {};
  const ws = $app.findRecordById("workspaces", b.workspace || "");
  const uid = e.auth.id;
  if (ws.get("owner") !== uid && (ws.get("admins") || []).indexOf(uid) < 0) throw new ForbiddenError("Hanya admin yang boleh mengirim WhatsApp.");
  const token = $os.getenv("RUANGKU_WA_TOKEN");
  const phoneId = $os.getenv("RUANGKU_WA_PHONE_ID");
  if (!token || !phoneId) throw new BadRequestError("RUANGKU_WA_TOKEN dan RUANGKU_WA_PHONE_ID belum diatur di server.");
  const ver = $os.getenv("RUANGKU_WA_GRAPH") || "v23.0";
  const res = $http.send({
    url: `https://graph.facebook.com/${ver}/${phoneId}/messages`,
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify(b.message),
    timeout: 30,
  });
  return e.json(res.statusCode, res.json || {});
}, $apis.requireAuth("users"));
