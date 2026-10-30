//! Team records are synchronized only through the server that enforces grants.
//! Personal snapshots must not reintroduce previously revoked team records.
use crate::db::{self, Record};
use rusqlite::Connection;
use std::collections::HashSet;

pub fn filter(conn: &Connection, records: &[Record]) -> rusqlite::Result<Vec<Record>> {
    let mut excluded = HashSet::<String>::new();
    let mut stmt = conn.prepare("SELECT value FROM settings WHERE key LIKE 'team_state_%' OR key = 'team_known_ids'")?;
    for value in stmt.query_map([], |r| r.get::<_, String>(0))? {
        let json: serde_json::Value = serde_json::from_str(&value?).unwrap_or_default();
        if let Some(ids) = json.as_array().or_else(|| json.get("rids").and_then(|v| v.as_array())) {
            excluded.extend(ids.iter().filter_map(|v| v.as_str()).map(str::to_owned));
        }
    }
    let existing = db::all(conn)?;
    let all: Vec<&Record> = existing.iter().chain(records).collect();
    for r in &all {
        if r.kind == "workspace" || (r.kind == "member" && r.data.get("workspaceId").and_then(|v| v.as_str()).is_some_and(|s| !s.is_empty())) ||
           (r.kind == "project" && r.data.get("workspaceId").and_then(|v| v.as_str()).is_some_and(|s| !s.is_empty())) { excluded.insert(r.id.clone()); }
    }
    loop {
        let count = excluded.len();
        for r in &all {
            if ["projectId", "parentId", "taskId", "objectiveId", "kpiId", "targetId", "workspaceId"].iter()
                .any(|key| r.data.get(key).and_then(|v| v.as_str()).is_some_and(|id| excluded.contains(id))) { excluded.insert(r.id.clone()); }
        }
        if count == excluded.len() { break; }
    }
    Ok(records.iter().filter(|r| !excluded.contains(&r.id)).cloned().collect())
}

pub fn remember(conn: &Connection, ids: &[String]) -> rusqlite::Result<()> {
    let mut known: HashSet<String> = serde_json::from_str(&db::get_setting(conn, "team_known_ids")?.unwrap_or_default()).unwrap_or_default();
    known.extend(ids.iter().cloned());
    db::set_setting(conn, "team_known_ids", &serde_json::to_string(&known).unwrap())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    #[test]
    fn team_dependencies_and_revoked_ids_never_cross_personal_snapshots() {
        let c = db::open_in_memory().unwrap();
        let make = |id: &str, kind: &str, data| Record { id: id.into(), kind: kind.into(), data, updated_at: 1, deleted: false };
        let rows = vec![make("p", "project", json!({"workspaceId":"ws-a"})), make("o", "objective", json!({"projectId":"p"})), make("k", "keyresult", json!({"objectiveId":"o"})), make("personal", "note", json!({"title":"Mine"})), make("old", "note", json!({"title":"Revoked"}))];
        remember(&c, &["old".into()]).unwrap();
        assert_eq!(filter(&c, &rows).unwrap().iter().map(|r| r.id.as_str()).collect::<Vec<_>>(), vec!["personal"]);
    }
}
