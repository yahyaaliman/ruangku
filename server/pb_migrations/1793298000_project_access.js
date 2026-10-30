// Project grants are evaluated from memberships at request time, including realtime.
// No cached ACL can leave access behind when an administrator revokes a grant.
migrate((app) => {
  const records = app.findCollectionByNameOrId("records");
  const members = app.findCollectionByNameOrId("members");
  members.fields.add(new SelectField({ name: "projectAccess", values: ["all", "selected"], maxSelect: 1 }));
  members.fields.add(new RelationField({ name: "projects", collectionId: records.id, maxSelect: 999, cascadeDelete: false }));
  members.createRule = `(${members.createRule}) && @request.body.user:isset = false`;
  app.save(members);
  const access = "@request.auth.id != '' && (workspace.owner = @request.auth.id || (@collection.members:grant.workspace ?= workspace && @collection.members:grant.user ?= @request.auth.id && (@collection.members:grant.role ?= 'admin' || @collection.members:grant.projectAccess ?!= 'selected' || @collection.members:grant.projects.rid ?= project)))";
  records.listRule = access;
  records.viewRule = access;
  records.updateRule = `(${records.updateRule}) && (${access}) && @request.body.assignee_emails:isset = false`;
  records.deleteRule = `(${records.deleteRule}) && (${access})`;
  records.createRule = `(${records.createRule}) && @request.body.assignee_emails:isset = false`;
  app.save(records);
}, (app) => {
  const records = app.findCollectionByNameOrId("records");
  records.listRule = "workspace.readers ?= @request.auth.id";
  records.viewRule = records.listRule;
  const ed = "workspace.editors ?= @request.auth.id", wr = "workspace.writers ?= @request.auth.id";
  records.createRule = `${wr} && @request.body.author = @request.auth.id`;
  records.updateRule = `@request.body.workspace:isset = false && @request.body.author:isset = false && (${ed} || (${wr} && (author = @request.auth.id || (assignee_emails ~ @request.auth.email && (@request.body.deleted:isset = false || @request.body.deleted = false)))))`;
  records.deleteRule = `${ed} || (${wr} && author = @request.auth.id)`;
  app.save(records);
  const members = app.findCollectionByNameOrId("members");
  members.fields.removeByName("projectAccess"); members.fields.removeByName("projects");
  members.createRule = "(workspace.owner = @request.auth.id || workspace.admins ?= @request.auth.id) && @request.body.role != 'pemilik'";
  app.save(members);
});
