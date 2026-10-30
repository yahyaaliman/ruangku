// Explicit relation IDs work consistently for multi-valued role lists.
migrate((app) => {
  for (const name of ["workspaces", "members", "records", "inbox"]) {
    const c = app.findCollectionByNameOrId(name);
    for (const key of ["listRule", "viewRule", "createRule", "updateRule", "deleteRule"]) {
      if (c[key]) c[key] = c[key].replace(/\b(readers|writers|editors|admins) \?=/g, "$1.id ?=");
    }
    app.save(c);
  }
}, (app) => {});
