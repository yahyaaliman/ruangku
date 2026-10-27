// Komentar dengan @mention untuk tugas dan catatan. Anggota yang disebut mendapat
// notifikasi lewat kanal botnya (Telegram/WA/email) dan muncul di Kotak masuk.
import { useMemo, useRef, useState } from "react";
import { AtSign, Send, Trash2 } from "lucide-react";
import type { Item } from "../lib/types";
import type { Member } from "../lib/team";
import { useRecords } from "../lib/useRecords";
import { useMembers } from "../lib/members";
import { mentionParts, parseMentions, type Comment, type OutboxRec } from "../lib/comments";
import { relativeAgo } from "../lib/date";
import { newId } from "../lib/api";
import { Avatar } from "../team/Avatars";
import "./collab.css";

export default function Comments({ target, targetId, projectId, readOnly, members: scoped }: { target: "task" | "note"; targetId: string; projectId?: string; readOnly?: boolean; members?: Item<Member>[] }) {
  const comments = useRecords<Comment>("comment");
  const outbox = useRecords<OutboxRec>("outbox");
  const all = useMembers();
  const members = scoped ?? all;
  const me = all.find((m) => m.isMe);
  const [text, setText] = useState("");
  const [pick, setPick] = useState<{ q: string; at: number; sel: number } | null>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  const list = useMemo(() => comments.items.filter((c) => c.target === target && c.targetId === targetId).sort((a, b) => a.at - b.at), [comments.items, target, targetId]);
  const candidates = pick ? members.filter((m) => !m.isMe && m.name.toLowerCase().includes(pick.q.toLowerCase())).slice(0, 6) : [];

  const onInput = (v: string, caret: number) => {
    setText(v);
    const before = v.slice(0, caret);
    const m = /(^|\s)@([\p{L}\p{N} ._-]{0,30})$/u.exec(before);
    if (m && !/\s{2}/.test(m[2])) setPick({ q: m[2], at: caret - m[2].length - 1, sel: 0 });
    else setPick(null);
  };

  const insert = (m: Item<Member>) => {
    if (!pick) return;
    const end = pick.at + 1 + pick.q.length;
    const next = `${text.slice(0, pick.at)}@${m.name} ${text.slice(end)}`;
    setText(next);
    setPick(null);
    requestAnimationFrame(() => {
      const el = box.current;
      if (!el) return;
      const pos = pick.at + m.name.length + 2;
      el.focus();
      el.setSelectionRange(pos, pos);
    });
  };

  const send = async () => {
    const body = text.trim();
    if (!body) return;
    const mentions = parseMentions(body, members).filter((id) => id !== me?.id);
    const id = newId();
    await comments.save({ target, targetId, projectId, body, authorId: me?.id, authorName: me?.name, mentions, at: Date.now() }, id);
    for (const memberId of mentions) {
      await outbox.save({ type: "mention", commentId: id, taskId: target === "task" ? targetId : undefined, noteId: target === "note" ? targetId : undefined, projectId, memberId, by: me?.id, at: Date.now(), status: "pending", tries: 0 }, newId());
    }
    setText("");
  };

  return (
    <section className="cmt-thread" aria-label="Komentar">
      <h3>
        Komentar {list.length > 0 && <span className="muted">{list.length}</span>}
      </h3>
      {list.length === 0 && <p className="muted small">Belum ada komentar. Ketik @ untuk menyebut anggota; mereka akan diberi tahu.</p>}
      <ul className="cmt-list">
        {list.map((c) => {
          const author = all.find((m) => m.id === c.authorId);
          const mine = !!me && c.authorId === me.id;
          return (
            <li key={c.id} className="cmt-item">
              {author ? <Avatar m={author} size={26} /> : <span className="cmt-ava-empty" />}
              <div className="cmt-body">
                <div className="cmt-meta">
                  <b>{c.authorName ?? author?.name ?? "Anggota"}</b>
                  <span className="muted small">{relativeAgo(c.at)}</span>
                  {mine && !readOnly && (
                    <button className="icon-btn sm cmt-del" onClick={() => comments.remove(c.id)} aria-label="Hapus komentar">
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
                <p className="cmt-text">
                  {mentionParts(c.body, all).map((p, i) =>
                    p.member ? (
                      <span key={i} className={`cmt-mention ${p.member === me?.id ? "me" : ""}`}>
                        {p.text}
                      </span>
                    ) : (
                      <span key={i}>{p.text}</span>
                    ),
                  )}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
      {!readOnly && (
        <div className="cmt-compose">
          <textarea
            ref={box}
            rows={2}
            value={text}
            placeholder="Tulis komentar… (@ untuk menyebut, Ctrl+Enter kirim)"
            onChange={(e) => onInput(e.target.value, e.target.selectionStart ?? e.target.value.length)}
            onKeyDown={(e) => {
              if (pick && candidates.length) {
                if (e.key === "ArrowDown") return e.preventDefault(), setPick({ ...pick, sel: (pick.sel + 1) % candidates.length });
                if (e.key === "ArrowUp") return e.preventDefault(), setPick({ ...pick, sel: (pick.sel - 1 + candidates.length) % candidates.length });
                if (e.key === "Enter" || e.key === "Tab") return e.preventDefault(), insert(candidates[pick.sel]);
                if (e.key === "Escape") return e.preventDefault(), setPick(null);
              }
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                send();
              }
            }}
            aria-label="Komentar baru"
          />
          {pick && candidates.length > 0 && (
            <ul className="cmt-pick" role="listbox" aria-label="Sebut anggota">
              {candidates.map((m, i) => (
                <li key={m.id}>
                  <button role="option" aria-selected={i === pick.sel} className={i === pick.sel ? "on" : ""} onMouseDown={(e) => (e.preventDefault(), insert(m))}>
                    <Avatar m={m} size={20} /> {m.name} <span className="muted small">{m.email}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="cmt-actions">
            <button
              className="icon-btn sm"
              title="Sebut anggota"
              aria-label="Sebut anggota"
              onClick={() => {
                const el = box.current;
                const pos = el?.selectionStart ?? text.length;
                const next = `${text.slice(0, pos)}${pos && !/\s$/.test(text.slice(0, pos)) ? " " : ""}@${text.slice(pos)}`;
                onInput(next, next.length - text.slice(pos).length);
                requestAnimationFrame(() => el?.focus());
              }}
            >
              <AtSign size={14} />
            </button>
            <button className="btn btn-sm btn-primary" onClick={send} disabled={!text.trim()}>
              <Send size={13} /> Kirim
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
