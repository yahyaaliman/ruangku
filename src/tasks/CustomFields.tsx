// Input kolom tambahan dan tampilan Tabel (seperti spreadsheet) untuk tugas sebuah proyek.
import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Download, ExternalLink } from "lucide-react";
import type { Item } from "../lib/types";
import { isTaskDone, projectOf, statusesOf, type Task } from "../lib/tasks";
import { fieldsFor, formatField, parseField, sortByField, toCsv, type FieldDef, type FieldValue, type SortDir } from "../lib/customFields";
import { api, saveTextFile } from "../lib/api";
import { useMembers } from "../lib/members";
import { dateKey } from "../lib/date";
import type { ViewProps } from "./Views";
import { TaskCheck } from "./shared";
import { firstDoneStatus, firstOpenStatus } from "../lib/tasks";

export function FieldInput({ f, value, onChange, compact }: { f: FieldDef; value: FieldValue | undefined; onChange: (v: FieldValue | undefined) => void; compact?: boolean }) {
  const [draft, setDraft] = useState<string | null>(null);
  if (f.type === "centang") return <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked || undefined)} aria-label={f.name} />;
  if (f.type === "pilihan")
    return (
      <select value={typeof value === "string" ? value : ""} onChange={(e) => onChange(e.target.value || undefined)} aria-label={f.name} className={compact ? "cf-compact" : undefined}>
        <option value="">–</option>
        {(f.options ?? []).map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
        {typeof value === "string" && value && !(f.options ?? []).includes(value) && <option value={value}>{value}</option>}
      </select>
    );
  if (f.type === "tanggal") return <input type="date" value={typeof value === "string" ? value : ""} onChange={(e) => onChange(e.target.value || undefined)} aria-label={f.name} className={compact ? "cf-compact" : undefined} />;
  const shown = draft ?? (value === undefined ? "" : f.type === "rupiah" || f.type === "angka" ? formatField(f, value) : String(value));
  return (
    <span className="cf-wrap">
      <input
        className={`${compact ? "cf-compact" : ""} ${f.type === "rupiah" || f.type === "angka" ? "cf-num" : ""}`}
        value={shown}
        inputMode={f.type === "angka" || f.type === "rupiah" ? "decimal" : undefined}
        placeholder={f.type === "rupiah" ? "mis. 7,5 jt" : f.type === "tautan" ? "https://…" : ""}
        aria-label={f.name}
        onFocus={() => setDraft(value === undefined ? "" : String(value))}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (draft === null) return;
          const v = parseField(f, draft);
          setDraft(null);
          if (v !== value) onChange(v);
        }}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
      />
      {f.type === "tautan" && typeof value === "string" && value && (
        <button className="icon-btn sm" onClick={() => api.openUrl(value)} aria-label={`Buka ${f.name}`} title={value}>
          <ExternalLink size={13} />
        </button>
      )}
    </span>
  );
}

/** Tampilan Tabel: kolom bawaan + kolom tambahan proyek, bisa diurutkan dan diekspor CSV. */
export function TableView({ t, list, scopeProject, onOpen, selected }: ViewProps) {
  const members = useMembers();
  const [sort, setSort] = useState<{ key: string; dir: SortDir }>({ key: "due", dir: 1 });
  // Kolom gabungan dari semua proyek yang muncul (biasanya satu proyek / subproyeknya).
  const fields = useMemo(() => {
    const pids = scopeProject ? [scopeProject.id] : [...new Set(list.map((x) => x.projectId))];
    const seen = new Set<string>();
    const out: FieldDef[] = [];
    for (const pid of pids) for (const f of fieldsFor(t.projects, pid)) if (!seen.has(f.id)) (seen.add(f.id), out.push(f));
    for (const x of list) for (const f of fieldsFor(t.projects, x.projectId)) if (!seen.has(f.id)) (seen.add(f.id), out.push(f));
    return out;
  }, [t.projects, list, scopeProject]);
  const rows = useMemo(() => sortByField(list.filter((x) => !x.parentId), sort.key, sort.dir, fields), [list, sort, fields]);
  const memberName = (id: string) => members.find((m) => m.id === id)?.name ?? id;

  const head = (key: string, label: string, cls = "") => (
    <th key={key} className={cls} aria-sort={sort.key === key ? (sort.dir === 1 ? "ascending" : "descending") : "none"}>
      <button onClick={() => setSort((s) => ({ key, dir: s.key === key ? ((-s.dir) as SortDir) : 1 }))}>
        {label}
        {sort.key === key && (sort.dir === 1 ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
      </button>
    </th>
  );

  const setCustom = (x: Item<Task>, f: FieldDef, v: FieldValue | undefined) => {
    const custom = { ...(x.custom ?? {}) };
    if (v === undefined) delete custom[f.id];
    else custom[f.id] = v;
    t.update(x.id, { custom: Object.keys(custom).length ? custom : undefined });
  };

  const exportCsv = async () => {
    const header = ["Judul", "Proyek", "Status", "Ditugaskan", "Tenggat", "Prioritas", ...fields.map((f) => f.name)];
    const data = rows.map((x) => {
      const p = projectOf(t.projects, x.projectId);
      return [x.title, p.name, statusesOf(p).find((s) => s.id === x.status)?.label ?? x.status, (x.assignees ?? []).map(memberName).join(", "), x.due ?? "", x.priority ?? "", ...fields.map((f) => (f.type === "angka" || f.type === "rupiah" ? (x.custom?.[f.id] as number | undefined) : formatField(f, x.custom?.[f.id])))];
    });
    const name = `${(scopeProject?.name ?? "tugas").replace(/[^\w-]+/g, "-").toLowerCase()}-${dateKey()}.csv`;
    await saveTextFile("Simpan tabel", name, toCsv([header, ...data]), { name: "CSV", extensions: ["csv"] }, "text/csv");
  };

  return (
    <div className="tbl-wrap">
      <div className="tbl-bar">
        <span className="muted small">
          {rows.length} tugas{fields.length ? ` · ${fields.length} kolom tambahan` : " · tambahkan kolom lewat Edit proyek → Kolom tambahan tugas"}
        </span>
        <button className="btn btn-sm" onClick={exportCsv} disabled={!rows.length}>
          <Download size={14} /> Ekspor CSV
        </button>
      </div>
      <div className="tbl-scroll">
        <table className="tbl">
          <thead>
            <tr>
              <th className="tbl-check" aria-label="Selesai" />
              {head("title", "Judul", "tbl-title")}
              {!scopeProject && head("projectId", "Proyek")}
              {head("status", "Status")}
              {head("due", "Tenggat")}
              {fields.map((f) => head(f.id, f.name, f.type === "angka" || f.type === "rupiah" ? "num" : ""))}
            </tr>
          </thead>
          <tbody>
            {rows.map((x) => {
              const p = projectOf(t.projects, x.projectId);
              const done = isTaskDone(x, t.projects);
              const own = fieldsFor(t.projects, x.projectId).map((f) => f.id);
              return (
                <tr key={x.id} className={`${selected === x.id ? "sel" : ""} ${done ? "done" : ""}`}>
                  <td className="tbl-check">
                    <TaskCheck done={done} label={x.title} onToggle={() => t.update(x.id, { status: done ? firstOpenStatus(p) : firstDoneStatus(p) })} />
                  </td>
                  <td className="tbl-title">
                    <button onClick={() => onOpen(x.id)}>{x.title}</button>
                  </td>
                  {!scopeProject && <td className="muted">{p.name}</td>}
                  <td>
                    <select className="cf-compact" value={x.status} onChange={(e) => t.update(x.id, { status: e.target.value })} aria-label="Status">
                      {statusesOf(p).map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input type="date" className="cf-compact" value={x.due ?? ""} onChange={(e) => t.update(x.id, { due: e.target.value || undefined })} aria-label="Tenggat" />
                  </td>
                  {fields.map((f) => (
                    <td key={f.id} className={f.type === "angka" || f.type === "rupiah" ? "num" : ""}>
                      {own.includes(f.id) ? <FieldInput f={f} value={x.custom?.[f.id]} onChange={(v) => setCustom(x, f, v)} compact /> : <span className="muted">–</span>}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
          {fields.some((f) => f.type === "angka" || f.type === "rupiah") && (
            <tfoot>
              <tr>
                <td />
                <td className="muted small">Jumlah</td>
                {!scopeProject && <td />}
                <td />
                <td />
                {fields.map((f) => (
                  <td key={f.id} className="num">
                    {f.type === "angka" || f.type === "rupiah" ? <b>{formatField(f, rows.reduce((s, x) => s + (typeof x.custom?.[f.id] === "number" ? (x.custom[f.id] as number) : 0), 0))}</b> : null}
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
