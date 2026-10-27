// Kotak masuk: penugasan, sebutan (@), dan komentar di tugas saya dari anggota lain.
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AtSign, Bell, CheckCheck, Handshake, MessageSquare, UserPlus } from "lucide-react";
import type { Item, Note } from "../lib/types";
import type { Task } from "../lib/tasks";
import { useRecords } from "../lib/useRecords";
import { useMembers } from "../lib/members";
import { inboxFor, type Comment, type OutboxRec } from "../lib/comments";
import { api, onEvent } from "../lib/api";
import { relativeAgo } from "../lib/date";
import { requestOpen } from "../lib/deeplink";
import "./collab.css";

const SEEN = "inbox_seen";

export function useInbox() {
  const outbox = useRecords<OutboxRec>("outbox");
  const comments = useRecords<Comment>("comment");
  const tasks = useRecords<Task>("task");
  const notes = useRecords<Note>("note");
  const meetings = useRecords<{ title: string }>("meeting");
  const members = useMembers();
  const [seen, setSeen] = useState(0);
  useEffect(() => {
    const load = () => api.getSetting(SEEN).then((v) => setSeen(Number(v ?? 0) || 0));
    load();
    return onEvent<string>("setting-changed", (k) => k === SEEN && load());
  }, []);
  const myIds = useMemo(() => new Set(members.filter((m) => m.isMe).map((m) => m.id)), [members]);
  const entries = useMemo(
    () => inboxFor(myIds, { outbox: outbox.items, comments: comments.items, tasks: tasks.items as Item<Task>[], notes: notes.items.map((n) => ({ id: n.id, title: n.title })), members, meetings: meetings.items.map((m) => ({ id: m.id, title: m.title })) }),
    [myIds, outbox.items, comments.items, tasks.items, notes.items, members, meetings.items],
  );
  const unread = entries.filter((e) => e.at > seen).length;
  const markRead = () => api.setSetting(SEEN, String(Date.now()));
  return { entries, unread, seen, markRead };
}

const ICON = { assign: UserPlus, mention: AtSign, comment: MessageSquare, meeting: Handshake };
const LABEL = { assign: "Penugasan", mention: "Menyebut Anda", comment: "Komentar", meeting: "Rapat" };

export default function InboxButton({ go }: { go: (page: "tasks" | "notes" | "meetings") => void }) {
  const inbox = useInbox();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ left: 0, top: 0 });
  const ref = useRef<HTMLDivElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && !pop.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", esc);
    return () => (window.removeEventListener("mousedown", close), window.removeEventListener("keydown", esc));
  }, [open]);

  return (
    <div className="ibx-wrap" ref={ref}>
      <button
        className="icon-btn ibx-btn"
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setPos({ left: Math.max(8, Math.min(r.left - 12, window.innerWidth - 372)), top: r.bottom + 6 });
          setOpen(!open);
        }} aria-label={`Kotak masuk${inbox.unread ? `, ${inbox.unread} belum dibaca` : ""}`} aria-expanded={open} title="Kotak masuk">
        <Bell size={17} />
        {inbox.unread > 0 && <span className="ibx-badge">{inbox.unread > 9 ? "9+" : inbox.unread}</span>}
      </button>
      {open &&
        createPortal(
        <div className="ibx-pop" ref={pop} role="dialog" aria-label="Kotak masuk" style={{ left: pos.left, top: pos.top }}>
          <header>
            <b>Kotak masuk</b>
            {inbox.unread > 0 && (
              <button className="link" onClick={inbox.markRead}>
                <CheckCheck size={14} /> Tandai dibaca
              </button>
            )}
          </header>
          {inbox.entries.length === 0 ? (
            <p className="ibx-empty">Belum ada apa-apa. Penugasan dan @sebutan dari anggota tim akan muncul di sini.</p>
          ) : (
            <ul>
              {inbox.entries.map((e) => {
                const Icon = ICON[e.kind];
                return (
                  <li key={e.key}>
                    <button
                      className={`ibx-row ${e.at > inbox.seen ? "unread" : ""}`}
                      onClick={() => {
                        requestOpen(e.target.kind, e.target.id);
                        go(e.target.kind === "task" ? "tasks" : e.target.kind === "meeting" ? "meetings" : "notes");
                        setOpen(false);
                      }}
                    >
                      <span className={`ibx-icon k-${e.kind}`}>
                        <Icon size={14} />
                      </span>
                      <span className="ibx-main">
                        <span className="ibx-top">
                          <b>{e.by ?? "Seseorang"}</b> · {LABEL[e.kind]}
                          <span className="muted small"> · {relativeAgo(e.at)}</span>
                        </span>
                        <span className="ibx-title">{e.title}</span>
                        {e.kind !== "assign" && <span className="ibx-text">{e.text}</span>}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>,
          document.body,
        )}
    </div>
  );
}
