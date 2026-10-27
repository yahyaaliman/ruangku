/// <reference path="../pb_data/types.d.ts" />
// Skema server tim Ruangku untuk PocketBase v0.23 ke atas.
// workspaces: ruang kerja tim. Daftar readers/writers/editors/admins diisi
//             otomatis oleh pb_hooks dari koleksi members (jangan diubah manual).
// members:    anggota per email beserta peran dan kanal (WA/Telegram).
// records:    data yang dibagikan (tugas, proyek, jadwal, catatan, OKR, KPI) dari aplikasi.
// inbox:      pesan WhatsApp masuk dari webhook, diproses oleh perangkat "bot host".
migrate((app) => {
  const users = app.findCollectionByNameOrId("users");

  const ws = new Collection({
    type: "base",
    name: "workspaces",
    listRule: "readers ?= @request.auth.id || owner = @request.auth.id",
    viewRule: "readers ?= @request.auth.id || owner = @request.auth.id",
    createRule: "@request.auth.id != '' && @request.body.owner = @request.auth.id",
    updateRule: "(owner = @request.auth.id || admins ?= @request.auth.id) && @request.body.owner:isset = false && @request.body.readers:isset = false && @request.body.writers:isset = false && @request.body.editors:isset = false && @request.body.admins:isset = false",
    deleteRule: "owner = @request.auth.id",
    fields: [
      { name: "name", type: "text", required: true, max: 120 },
      { name: "owner", type: "relation", required: true, maxSelect: 1, collectionId: users.id, cascadeDelete: false },
      { name: "readers", type: "relation", maxSelect: 999, collectionId: users.id },
      { name: "writers", type: "relation", maxSelect: 999, collectionId: users.id },
      { name: "editors", type: "relation", maxSelect: 999, collectionId: users.id },
      { name: "admins", type: "relation", maxSelect: 999, collectionId: users.id },
      { name: "created", type: "autodate", onCreate: true, onUpdate: false },
      { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
    ],
  });
  app.save(ws);

  const adminRule = "workspace.owner = @request.auth.id || workspace.admins ?= @request.auth.id";
  const members = new Collection({
    type: "base",
    name: "members",
    listRule: "workspace.readers ?= @request.auth.id || workspace.owner = @request.auth.id",
    viewRule: "workspace.readers ?= @request.auth.id || workspace.owner = @request.auth.id",
    createRule: `(${adminRule}) && @request.body.role != 'pemilik'`,
    // Admin tidak boleh mengubah/menghapus pemilik atau mengangkat pemilik (dicek juga di hook).
    updateRule: `(${adminRule}) && @request.body.workspace:isset = false && @request.body.user:isset = false`,
    deleteRule: `(${adminRule}) && role != 'pemilik'`,
    fields: [
      { name: "workspace", type: "relation", required: true, maxSelect: 1, collectionId: ws.id, cascadeDelete: true },
      { name: "email", type: "email", required: true },
      { name: "name", type: "text", max: 120 },
      { name: "role", type: "select", required: true, maxSelect: 1, values: ["pemilik", "admin", "editor", "kontributor", "pembaca"] },
      { name: "user", type: "relation", maxSelect: 1, collectionId: users.id },
      { name: "wa", type: "text", max: 40 },
      { name: "telegram", type: "text", max: 64 },
      { name: "notifyVia", type: "json", maxSize: 2000 },
      { name: "created", type: "autodate", onCreate: true, onUpdate: false },
      { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
    ],
    indexes: ["CREATE UNIQUE INDEX idx_members_ws_email ON members (workspace, email)"],
  });
  app.save(members);

  const ed = "workspace.editors ?= @request.auth.id";
  const wr = "workspace.writers ?= @request.auth.id";
  const records = new Collection({
    type: "base",
    name: "records",
    listRule: "workspace.readers ?= @request.auth.id",
    viewRule: "workspace.readers ?= @request.auth.id",
    createRule: `${wr} && @request.body.author = @request.auth.id`,
    // Editor ke atas: semua. Kontributor: buatannya sendiri, atau tugas yang ditugaskan kepadanya (tanpa menghapus).
    updateRule: `@request.body.workspace:isset = false && @request.body.author:isset = false && (${ed} || (${wr} && (author = @request.auth.id || (assignee_emails ~ @request.auth.email && (@request.body.deleted:isset = false || @request.body.deleted = false)))))`,
    deleteRule: `${ed} || (${wr} && author = @request.auth.id)`,
    fields: [
      { name: "workspace", type: "relation", required: true, maxSelect: 1, collectionId: ws.id, cascadeDelete: true },
      { name: "rid", type: "text", required: true, max: 120 },
      { name: "kind", type: "text", required: true, max: 40 },
      { name: "data", type: "json", maxSize: 2000000 },
      { name: "ts", type: "number" },
      { name: "deleted", type: "bool" },
      { name: "project", type: "text", max: 120 },
      { name: "author", type: "relation", maxSelect: 1, collectionId: users.id },
      { name: "assignee_emails", type: "text", max: 2000 },
      { name: "created", type: "autodate", onCreate: true, onUpdate: false },
      { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
    ],
    indexes: ["CREATE UNIQUE INDEX idx_records_ws_rid ON records (workspace, rid)", "CREATE INDEX idx_records_ws_updated ON records (workspace, updated)"],
  });
  app.save(records);

  const inbox = new Collection({
    type: "base",
    name: "inbox",
    listRule: "workspace.owner = @request.auth.id || workspace.admins ?= @request.auth.id",
    viewRule: "workspace.owner = @request.auth.id || workspace.admins ?= @request.auth.id",
    createRule: null,
    updateRule: "(workspace.owner = @request.auth.id || workspace.admins ?= @request.auth.id) && @request.body.workspace:isset = false",
    deleteRule: "workspace.owner = @request.auth.id",
    fields: [
      { name: "workspace", type: "relation", maxSelect: 1, collectionId: ws.id, cascadeDelete: true },
      { name: "channel", type: "text", max: 20 },
      { name: "sender", type: "text", max: 80 },
      { name: "sender_name", type: "text", max: 120 },
      { name: "text", type: "text", max: 5000 },
      { name: "raw", type: "json", maxSize: 200000 },
      { name: "processed", type: "bool" },
      { name: "created", type: "autodate", onCreate: true, onUpdate: false },
      { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
    ],
  });
  app.save(inbox);
}, (app) => {
  for (const name of ["inbox", "records", "members", "workspaces"]) {
    try {
      app.delete(app.findCollectionByNameOrId(name));
    } catch (_) {}
  }
});
