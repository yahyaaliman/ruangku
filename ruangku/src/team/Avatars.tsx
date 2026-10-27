import { useEffect, useRef, useState } from "react";
import { Check, Plus, UserPlus } from "lucide-react";
import type { Item } from "../lib/types";
import { initials, Member, roleLabel } from "../lib/team";

export function Avatar({ m, size = 22 }: { m: Pick<Member, "name" | "color">; size?: number }) {
  return (
    <span className={`avatar bc-${m.color ?? "abu"}`} style={{ width: size, height: size, fontSize: size * 0.42 }} title={m.name} aria-hidden="true">
      {initials(m.name)}
    </span>
  );
}

export function AvatarStack({ ids, members, max = 3 }: { ids: string[] | undefined; members: Item<Member>[]; max?: number }) {
  const list = (ids ?? []).map((id) => members.find((m) => m.id === id)).filter((m): m is Item<Member> => !!m);
  if (!list.length) return null;
  return (
    <span className="avatar-stack" title={list.map((m) => m.name).join(", ")}>
      {list.slice(0, max).map((m) => <Avatar key={m.id} m={m} size={18} />)}
      {list.length > max && <span className="avatar more">+{list.length - max}</span>}
    </span>
  );
}

/** Pilih anggota yang ditugaskan. */
export function AssigneePicker({ value, members, onChange }: { value: string[] | undefined; members: Item<Member>[]; onChange: (ids: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const ids = value ?? [];
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open]);
  const toggle = (id: string) => onChange(ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]);
  return (
    <div className="assignee" ref={ref}>
      <div className="assignee-list">
        {ids.map((id) => {
          const m = members.find((x) => x.id === id);
          if (!m) return null;
          return (
            <button key={id} className="assignee-chip" onClick={() => toggle(id)} title={`Lepas ${m.name}`}>
              <Avatar m={m} size={18} /> {m.isMe ? "Saya" : m.name.split(" ")[0]} <span aria-hidden="true">×</span>
            </button>
          );
        })}
        <button className="chip-btn" onClick={() => setOpen(!open)} aria-expanded={open}>
          {ids.length ? <Plus size={13} /> : <UserPlus size={13} />} {ids.length ? "" : "Tugaskan"}
        </button>
      </div>
      {open && (
        <div className="menu assignee-menu">
          {members.length === 0 && <p className="muted small pad">Belum ada anggota. Tambahkan di halaman Tim & bot.</p>}
          {members.map((m) => (
            <button key={m.id} onClick={() => toggle(m.id)}>
              <Avatar m={m} size={20} />
              <span className="assignee-name">{m.name}{m.isMe ? " (saya)" : ""}<small>{roleLabel(m.role)}</small></span>
              {ids.includes(m.id) && <Check size={14} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
