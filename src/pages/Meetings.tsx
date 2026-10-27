// Halaman Rapat: daftar rapat mendatang & riwayat, detail rapat (peserta, tempat/tautan, agenda,
// notulen, keputusan, action item → tugas), rapat berulang, dan kirim undangan/hasil lewat bot.
import { useEffect, useMemo, useState } from "react";
import {
  CalendarClock, Check, ClipboardCopy, ExternalLink, FileText, Handshake, ListChecks, MapPin, MoreHorizontal, Plus, Repeat, Search, Send, Trash2, Video, X, GripVertical, Sparkles,
} from "lucide-react";
import type { Item, Note } from "../lib/types";
import { useRecords, strip } from "../lib/useRecords";
import { useScope } from "../lib/scope";
import { useTasks } from "../lib/useTasks";
import { useMembers } from "../lib/members";
import { api, newId } from "../lib/api";
import { addDays, dateKey, parseDateKey, relativeDay } from "../lib/date";
import { fmtMin } from "../lib/timeblocks";
import { useOpenRequest, requestOpen, NEW_ID } from "../lib/deeplink";
import { INBOX_ID, isTaskDone } from "../lib/tasks";
import {
  actionsFromNotulen, FREQ_LABEL, findMeetingLink, inviteText, linkPlatform, MEETING_KIND, meetingWhen, normalizeLink, notulenMarkdown, SERIES_KIND, summaryText,
  type ActionItem, type AgendaItem, type Meeting, type MeetingSeries, type RepeatFreq,
} from "../lib/meetings";
import { Confirm, Field, Modal, useToast } from "../components/ui";
import { ContextMenu, useContextMenu } from "../components/ContextMenu";
import { TimeInput } from "../components/TimeInput";
import { ProjectChip, ProjectSelect } from "../projects/ProjectSwitcher";
import { AssigneePicker, Avatar, AvatarStack } from "../team/Avatars";
import { useAccess } from "../lib/access";
import { DAY_NAMES } from "../lib/courses";
import type { Page } from "../App";
import "../meetings/meetings.css";
import { PaneResizer, usePaneWidth } from "../components/Pane";
import { usePageLayout, type SectionDef } from "../lib/pageLayout";
import { LayoutMenu } from "../components/LayoutMenu";

type Tab = "mendatang" | "riwayat";

const dayLabel = (d: string, today: string) => {
  if (d === today) return "Hari ini";
  if (d === dateKey(addDays(parseDateKey(today), 1))) return "Besok";
  return parseDateKey(d).toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long" });
};

export default function Meetings({ go }: { go: (p: Page) => void }) {
  const meetings = useRecords<Meeting>(MEETING_KIND);
  const series = useRecords<MeetingSeries>(SERIES_KIND);
  const scope = useScope();
  const toast = useToast();
  const members = useMembers();
  const [tab, setTab] = useState<Tab>("mendatang");
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<string | null>(null);
  const [form, setForm] = useState<null | { seriesId?: string; date?: string }>(null);
  const [listW, setListW, resetListW] = usePaneWidth("meetings-list", 360, 260, 680);
  const today = dateKey();
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes();

  useOpenRequest("meeting", (id) => (id === NEW_ID ? setForm({}) : (setSel(id), setTab(meetings.items.find((m) => m.id === id && (m.date < today || m.status !== "terjadwal")) ? "riwayat" : "mendatang"))), !meetings.loading);

  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    return meetings.items
      .filter((m) => scope.match(m.projectId))
      .filter((m) => !term || `${m.title} ${m.location ?? ""} ${m.description ?? ""}`.toLowerCase().includes(term))
      .filter((m) => {
        const past = m.date < today || (m.date === today && m.end <= nowMin) || m.status !== "terjadwal";
        return tab === "riwayat" ? past : !past;
      })
      .sort((a, b) => (tab === "riwayat" ? b.date.localeCompare(a.date) || b.start - a.start : a.date.localeCompare(b.date) || a.start - b.start));
  }, [meetings.items, scope, q, tab, today, nowMin]);

  const groups = useMemo(() => {
    const g = new Map<string, Item<Meeting>[]>();
    for (const m of list.slice(0, 200)) g.set(m.date, [...(g.get(m.date) ?? []), m]);
    return [...g.entries()];
  }, [list]);

  const current = meetings.items.find((m) => m.id === sel) ?? null;
  useEffect(() => {
    if (!sel && list[0] && window.innerWidth > 1100) setSel(list[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list.length]);

  return (
    <div className="page page-wide mtg-page">
      <header className="page-head">
        <div>
          <h1>Rapat{scope.current ? <span className="page-scope"> · {scope.current.name}</span> : null}</h1>
          <p className="page-sub">Agenda, peserta, tautan Zoom/Meet, notulen, dan action item yang langsung jadi tugas. Rapat otomatis tampil di Kalender, Jadwal harian, widget, dan rangkuman pagi.</p>
        </div>
        <div className="btn-row">
          <button className="btn btn-primary" onClick={() => setForm({})}>
            <Plus size={16} /> Rapat baru
          </button>
        </div>
      </header>
      <div className="toolbar">
        <div className="seg" role="tablist">
          <button role="tab" aria-selected={tab === "mendatang"} className={tab === "mendatang" ? "active" : ""} onClick={() => setTab("mendatang")}>Mendatang</button>
          <button role="tab" aria-selected={tab === "riwayat"} className={tab === "riwayat" ? "active" : ""} onClick={() => setTab("riwayat")}>Riwayat</button>
        </div>
        <label className="search search-sm">
          <Search size={14} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari rapat" />
        </label>
        <span className="muted small">{series.items.filter((s) => s.active && scope.match(s.projectId)).length} rapat berulang aktif</span>
      </div>

      <div className="mtg-layout pane-host" style={{ "--pane-l": `${listW}px` } as React.CSSProperties}>
        <PaneResizer value={listW} onChange={setListW} onReset={resetListW} min={260} max={680} offset={9} label="Lebar daftar rapat" />
        <div className="mtg-list">
          {groups.map(([d, items]) => (
            <section key={d}>
              <h3 className="mtg-day">{dayLabel(d, today)}</h3>
              {items.map((m) => (
                <button key={m.id} className={`mtg-card ${sel === m.id ? "active" : ""} st-${m.status}`} onClick={() => setSel(m.id)}>
                  <span className="mtg-time">
                    <b>{fmtMin(m.start)}</b>
                    <small>{fmtMin(m.end)}</small>
                  </span>
                  <span className="mtg-main">
                    <span className="mtg-title">
                      {m.seriesId && <Repeat size={12} className="muted" aria-label="Berulang" />} {m.title || "Rapat"}
                      {m.status === "batal" && <span className="mtg-pill batal">Batal</span>}
                      {m.status === "selesai" && <span className="mtg-pill selesai">Selesai</span>}
                    </span>
                    <span className="mtg-meta">
                      {m.link && (
                        <span>
                          <Video size={12} /> {linkPlatform(m.link)}
                        </span>
                      )}
                      {m.location && (
                        <span>
                          <MapPin size={12} /> {m.location}
                        </span>
                      )}
                      {m.projectId && <ProjectChip id={m.projectId} />}
                    </span>
                  </span>
                  <AvatarStack ids={m.attendees} members={members} />
                </button>
              ))}
            </section>
          ))}
          {!meetings.loading && list.length === 0 && (
            <div className="empty">
              <Handshake size={28} />
              <p className="empty-title">{tab === "mendatang" ? "Belum ada rapat terjadwal" : "Belum ada riwayat rapat"}</p>
              <p className="empty-text">Buat rapat dengan agenda dan peserta. Bisa juga rapat berulang seperti stand-up harian atau rapat mingguan.</p>
              {tab === "mendatang" && (
                <button className="btn btn-primary" onClick={() => setForm({})}>
                  <Plus size={16} /> Rapat baru
                </button>
              )}
            </div>
          )}
        </div>
        <div className="mtg-detail">
          {current ? <MeetingDetail key={current.id} m={current} go={go} onEditSeries={(sid) => setForm({ seriesId: sid })} onDeleted={() => setSel(null)} /> : <p className="muted pad">Pilih rapat di kiri untuk melihat detailnya.</p>}
        </div>
      </div>
      {form && (
        <MeetingForm
          seriesId={form.seriesId}
          onClose={() => setForm(null)}
          onSaved={(id, msg) => {
            if (id) setSel(id);
            setTab("mendatang");
            toast(msg);
          }}
        />
      )}
    </div>
  );
}

// ---------- Formulir rapat baru / ubah seri ----------
function MeetingForm({ seriesId, onClose, onSaved }: { seriesId?: string; onClose: () => void; onSaved: (id: string | null, msg: string) => void }) {
  const meetings = useRecords<Meeting>(MEETING_KIND);
  const seriesRec = useRecords<MeetingSeries>(SERIES_KIND);
  const scope = useScope();
  const members = useMembers();
  const existing = seriesId ? seriesRec.items.find((s) => s.id === seriesId) : undefined;
  const now = new Date();
  const roundStart = Math.min(22 * 60, Math.ceil((now.getHours() * 60 + now.getMinutes() + 30) / 30) * 30);
  const [title, setTitle] = useState(existing?.title ?? "");
  const [date, setDate] = useState(existing?.from ?? dateKey());
  const [start, setStart] = useState(existing?.start ?? roundStart);
  const [end, setEnd] = useState(existing?.end ?? roundStart + 60);
  const [projectId, setProjectId] = useState<string | undefined>(existing?.projectId ?? scope.defaultProjectId);
  const [location, setLocation] = useState(existing?.location ?? "");
  const [link, setLink] = useState(existing?.link ?? "");
  const [attendees, setAttendees] = useState<string[]>(existing?.attendees ?? members.filter((m) => m.isMe).map((m) => m.id));
  const [agenda, setAgenda] = useState((existing?.agenda ?? []).map((a) => a.text).join("\n"));
  const [freq, setFreq] = useState<RepeatFreq | "none">(existing?.freq ?? "none");
  const [weekdays, setWeekdays] = useState<number[]>(existing?.weekdays ?? [parseDateKey(date).getDay()]);
  const [until, setUntil] = useState(existing?.until ?? "");
  const [skipHolidays, setSkipHolidays] = useState(existing?.skipHolidays ?? true);
  const [invite, setInvite] = useState(false);
  const others = attendees.filter((id) => !members.find((m) => m.id === id)?.isMe);

  const save = async () => {
    const agendaItems: AgendaItem[] = agenda.split("\n").map((t) => t.trim()).filter(Boolean).map((text) => ({ id: newId(), text, done: false }));
    const base = { title: title.trim() || "Rapat", start, end: Math.max(end, start + 15), projectId, location: location.trim() || undefined, link: normalizeLink(link), attendees };
    if (freq !== "none") {
      const s: MeetingSeries = { ...base, agenda: agendaItems, freq, from: date, until: until || undefined, weekdays: freq === "weekly" || freq === "biweekly" ? weekdays : undefined, skipHolidays, active: true };
      const sid = seriesId ?? newId();
      await seriesRec.save(s, sid);
      onSaved(null, existing ? "Rapat berulang diperbarui. Kemunculan mendatang ikut berubah." : `Rapat berulang dibuat (${FREQ_LABEL[freq].toLowerCase()}). Kemunculan 8 minggu ke depan muncul di Kalender.`);
      if (invite && others.length) {
        // Undangan untuk kemunculan pertama dikirim setelah dibuat (lihat Kirim undangan di detailnya).
      }
      onClose();
      return;
    }
    const id = newId();
    const m: Meeting = { ...base, date, agenda: agendaItems, actions: [], status: "terjadwal", createdAt: Date.now() };
    await meetings.save(m, id);
    if (invite && others.length) await queueMessages(id, m, others, "undangan", members.find((x) => x.isMe)?.id);
    onSaved(id, invite && others.length ? `Rapat dibuat dan undangan dikirim ke ${others.length} peserta` : "Rapat dibuat");
    onClose();
  };

  return (
    <Modal
      title={existing ? "Ubah rapat berulang" : "Rapat baru"}
      onClose={onClose}
      wide
      footer={
        <>
          <button className="btn" onClick={onClose}>Batal</button>
          <button className="btn btn-primary" onClick={save}>{existing ? "Simpan seri" : "Buat rapat"}</button>
        </>
      }
    >
      <div className="form">
        <Field label="Judul rapat">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Mis. Rapat evaluasi sprint" />
        </Field>
        <div className="form-row form-row-4">
          <Field label={freq === "none" ? "Tanggal" : "Mulai tanggal"}>
            <input type="date" value={date} onChange={(e) => (setDate(e.target.value), !existing && setWeekdays([parseDateKey(e.target.value).getDay()]))} />
          </Field>
          <Field label="Mulai">
            <TimeInput value={start} onChange={(v) => (setEnd(v + (end - start)), setStart(v))} label="Jam mulai" />
          </Field>
          <Field label="Selesai">
            <TimeInput value={end} onChange={setEnd} label="Jam selesai" />
          </Field>
          <Field label="Ulangi">
            <select value={freq} onChange={(e) => setFreq(e.target.value as RepeatFreq | "none")}>
              <option value="none">Tidak berulang</option>
              {(Object.keys(FREQ_LABEL) as RepeatFreq[]).map((f) => (
                <option key={f} value={f}>{FREQ_LABEL[f]}</option>
              ))}
            </select>
          </Field>
        </div>
        {freq !== "none" && (
          <div className="mtg-repeat">
            {(freq === "weekly" || freq === "biweekly") && (
              <div className="btn-row" role="group" aria-label="Hari">
                {[1, 2, 3, 4, 5, 6, 0].map((d) => (
                  <button key={d} type="button" className={`chip ${weekdays.includes(d) ? "active" : ""}`} onClick={() => setWeekdays((w) => (w.includes(d) ? (w.length > 1 ? w.filter((x) => x !== d) : w) : [...w, d]))}>
                    {DAY_NAMES[d].slice(0, 3)}
                  </button>
                ))}
              </div>
            )}
            <label className="inline-field">
              Sampai <input type="date" value={until} onChange={(e) => setUntil(e.target.value)} />
            </label>
            <label className="check-row">
              <input type="checkbox" checked={skipHolidays} onChange={(e) => setSkipHolidays(e.target.checked)} /> Lewati hari libur nasional
            </label>
          </div>
        )}
        <div className="form-row">
          <Field label="Tempat">
            <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Mis. Ruang rapat lt. 2" />
          </Field>
          <Field label="Tautan rapat daring" hint={link ? `${linkPlatform(normalizeLink(link)) ?? "Tautan"}` : "Zoom, Google Meet, Teams… tempel undangan utuh pun bisa"}>
            <input
              value={link}
              onChange={(e) => setLink(e.target.value)}
              onPaste={(e) => {
                const t = e.clipboardData.getData("text");
                const found = t.length > 60 ? findMeetingLink(t) : undefined;
                if (found) (e.preventDefault(), setLink(found));
              }}
              placeholder="https://meet.google.com/…"
            />
          </Field>
        </div>
        <div className="form-row">
          <Field label="Proyek">
            <ProjectSelect value={projectId} onChange={setProjectId} projects={scope.allProjects} />
          </Field>
          <Field label="Peserta">
            <AssigneePicker value={attendees} members={members} onChange={setAttendees} />
          </Field>
        </div>
        <Field label="Agenda" hint="Satu baris satu butir">
          <textarea rows={4} value={agenda} onChange={(e) => setAgenda(e.target.value)} placeholder={"Evaluasi minggu lalu\nRencana minggu ini\nLain-lain"} />
        </Field>
        {freq === "none" && others.length > 0 && (
          <label className="check-row">
            <input type="checkbox" checked={invite} onChange={(e) => setInvite(e.target.checked)} /> Kirim undangan ke {others.length} peserta lewat WhatsApp/Telegram/email (bot harus aktif)
          </label>
        )}
      </div>
    </Modal>
  );
}

async function queueMessages(meetingId: string, m: Meeting, memberIds: string[], kind: "undangan" | "hasil" | "batal", by?: string) {
  for (const memberId of memberIds) await api.save(newId(), "outbox", { type: "meeting", meetingId, meetingMsg: kind, memberId, by, projectId: m.projectId, at: Date.now(), status: "pending", tries: 0 });
}

// ---------- Detail rapat ----------
const MTG_SECTIONS: SectionDef[] = [
  { id: "info", label: "Waktu, tempat, tautan & peserta" },
  { id: "agenda", label: "Agenda" },
  { id: "notulen", label: "Notulen" },
  { id: "keputusan", label: "Keputusan" },
  { id: "action", label: "Action item" },
];

function MeetingDetail({ m, go, onEditSeries, onDeleted }: { m: Item<Meeting>; go: (p: Page) => void; onEditSeries: (sid: string) => void; onDeleted: () => void }) {
  const meetings = useRecords<Meeting>(MEETING_KIND);
  const seriesRec = useRecords<MeetingSeries>(SERIES_KIND);
  const notes = useRecords<Note>("note");
  const tk = useTasks();
  const members = useMembers();
  const scope = useScope();
  const toast = useToast();
  const access = useAccess();
  const menu = useContextMenu();
  const ro = access.readOnly(m.projectId);
  const ml = usePageLayout("rapat", MTG_SECTIONS);
  const sec = (id: string) => ({ hidden: !ml.isOn(id), style: { order: 10 + ml.sections.findIndex((x) => x.id === id) } });
  const [del, setDel] = useState(false);
  const [newAgenda, setNewAgenda] = useState("");
  const [newAction, setNewAction] = useState("");
  const me = members.find((x) => x.isMe);
  const series = m.seriesId ? seriesRec.items.find((s) => s.id === m.seriesId) : undefined;
  const note = m.noteId ? notes.items.find((n) => n.id === m.noteId) : undefined;
  const who = members.map((x) => ({ id: x.id, name: x.name }));
  const others = m.attendees.filter((id) => id !== me?.id);

  const set = (patch: Partial<Meeting>) => meetings.save({ ...strip(m), ...patch, detached: m.seriesId && ("date" in patch || "start" in patch || "end" in patch) ? true : m.detached }, m.id);
  void scope;

  const makeNotulen = async () => {
    const id = newId();
    await notes.save({ title: `Notulen ${m.title} — ${parseDateKey(m.date).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}`, body: notulenMarkdown(m, who), tags: ["rapat"], icon: "🤝", projectId: m.projectId }, id);
    await set({ noteId: id });
    requestOpen("note", id);
    go("notes");
  };

  const toTask = async (a: ActionItem) => {
    const id = await tk.create({ title: a.text, projectId: m.projectId ?? INBOX_ID, due: a.due, assignees: a.assignee ? [a.assignee] : undefined, tags: ["rapat"], description: `Tindak lanjut rapat "${m.title}" (${meetingWhen(m)})` });
    return id;
  };
  const tasksFromActions = async () => {
    let n = 0;
    const next: ActionItem[] = [];
    for (const a of m.actions) {
      if (a.taskId) next.push(a);
      else (next.push({ ...a, taskId: await toTask(a) }), n++);
    }
    await set({ actions: next });
    toast(n ? `${n} tugas dibuat dari action item${next.some((a) => a.assignee && a.assignee !== me?.id) ? "; penanggung jawab diberi tahu lewat bot" : ""}` : "Semua action item sudah menjadi tugas");
  };

  const copyInvite = async () => {
    try {
      await navigator.clipboard.writeText(inviteText(m, who, me?.name).replace(/\*/g, ""));
      toast("Undangan disalin. Tempel di WhatsApp atau email.");
    } catch {
      toast("Tidak bisa menyalin", "error");
    }
  };

  const moreMenu = (el: HTMLElement) =>
    menu.open(el, [
      { label: "Salin teks undangan", icon: <ClipboardCopy size={14} />, run: copyInvite },
      { label: "Kirim undangan ke peserta", icon: <Send size={14} />, disabled: !others.length || ro, run: async () => (await queueMessages(m.id, m, others, "undangan", me?.id), toast(`Undangan masuk antrean bot untuk ${others.length} peserta`)) },
      { label: "Kirim hasil rapat ke peserta", icon: <Send size={14} />, disabled: !others.length || ro, run: async () => (await queueMessages(m.id, m, others, "hasil", me?.id), toast(`Hasil rapat masuk antrean bot untuk ${others.length} peserta`)) },
      { type: "separator" },
      { label: "Buka di Kalender", icon: <CalendarClock size={14} />, run: () => (requestOpen("date", m.date), go("calendar")) },
      ...(series ? [{ label: "Ubah rapat berulang…", icon: <Repeat size={14} />, disabled: ro, run: () => onEditSeries(series.id) }, { label: "Hentikan pengulangan", icon: <X size={14} />, disabled: ro, run: async () => (await seriesRec.save({ ...strip(series), active: false }, series.id), toast("Pengulangan dihentikan. Kemunculan mendatang yang belum dipakai dihapus.")) }] : []),
      { type: "separator" },
      m.status === "batal"
        ? { label: "Jadwalkan lagi", icon: <CalendarClock size={14} />, disabled: ro, run: () => set({ status: "terjadwal" }) }
        : { label: "Batalkan rapat", icon: <X size={14} />, disabled: ro, run: async () => (await set({ status: "batal" }), others.length && (await queueMessages(m.id, m, others, "batal", me?.id)), toast(others.length ? "Rapat dibatalkan; peserta diberi tahu lewat bot" : "Rapat dibatalkan")) },
      { label: "Hapus rapat…", icon: <Trash2 size={14} />, danger: true, disabled: ro, run: () => setDel(true) },
    ]);

  const linkName = linkPlatform(m.link);
  return (
    <article className="mtg-d">
      <header className="mtg-d-head">
        <input className="mtg-d-title" value={m.title} disabled={ro} onChange={(e) => set({ title: e.target.value })} aria-label="Judul rapat" />
        <div className="btn-row">
          {m.link && (
            <button className="btn btn-primary btn-sm" onClick={() => api.openUrl(m.link!)}>
              <Video size={14} /> Gabung {linkName && linkName !== "Tautan" ? linkName : ""}
            </button>
          )}
          {m.status !== "selesai" ? (
            <button className="btn btn-sm" disabled={ro} onClick={() => set({ status: "selesai" })}>
              <Check size={14} /> Tandai selesai
            </button>
          ) : (
            <button className="btn btn-sm" disabled={ro} onClick={() => set({ status: "terjadwal" })}>Buka lagi</button>
          )}
          <LayoutMenu layout={ml} title="Atur bagian detail rapat" label="" compact />
          <button className="icon-btn" aria-label="Menu rapat" onClick={(e) => moreMenu(e.currentTarget)}>
            <MoreHorizontal size={16} />
          </button>
        </div>
      </header>
      {m.status === "batal" && <p className="ro-banner">Rapat ini dibatalkan dan tidak tampil di jadwal.</p>}
      {ro && <p className="ro-banner">Anda pembaca di proyek ini: rapat hanya bisa dilihat.</p>}
      <fieldset className="mtg-grid" disabled={ro} {...sec("info")}>
        <label>
          <span>Tanggal</span>
          <input type="date" value={m.date} onChange={(e) => e.target.value && set({ date: e.target.value })} />
        </label>
        <label>
          <span>Jam</span>
          <span className="mtg-times">
            <TimeInput value={m.start} onChange={(v) => set({ start: v, end: v + (m.end - m.start) })} label="Mulai" /> – <TimeInput value={m.end} onChange={(v) => set({ end: Math.max(v, m.start + 5) })} label="Selesai" />
            <small className="muted">{relativeDay(parseDateKey(m.date).getTime())}</small>
          </span>
        </label>
        <label>
          <span>Tempat</span>
          <input value={m.location ?? ""} onChange={(e) => set({ location: e.target.value || undefined })} placeholder="Ruang / alamat" />
        </label>
        <label>
          <span>Tautan</span>
          <span className="mtg-link">
            <input value={m.link ?? ""} onChange={(e) => set({ link: e.target.value || undefined })} onBlur={(e) => set({ link: normalizeLink(e.target.value) })} placeholder="https://meet.google.com/…" />
            {m.link && (
              <button type="button" className="icon-btn sm" onClick={() => api.openUrl(m.link!)} aria-label="Buka tautan">
                <ExternalLink size={13} />
              </button>
            )}
          </span>
        </label>
        <label>
          <span>Proyek</span>
          <ProjectSelect value={m.projectId} onChange={(projectId) => set({ projectId })} projects={scope.allProjects} />
        </label>
        <div className="mtg-field">
          <span>Peserta</span>
          <AssigneePicker value={m.attendees} members={members} onChange={(attendees) => set({ attendees })} />
        </div>
        <label className="span2">
          <span>Tamu luar</span>
          <input value={m.guests ?? ""} onChange={(e) => set({ guests: e.target.value || undefined })} placeholder="Nama/email tamu, pisahkan dengan koma" />
        </label>
      </fieldset>
      {series && ml.isOn("info") && (
        <p className="mtg-series" style={sec("info").style}>
          <Repeat size={13} /> Bagian dari rapat berulang: {FREQ_LABEL[series.freq].toLowerCase()}
          {series.weekdays?.length && (series.freq === "weekly" || series.freq === "biweekly") ? ` (${series.weekdays.map((d) => DAY_NAMES[d]).join(", ")})` : ""}
          {series.until ? ` sampai ${parseDateKey(series.until).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}` : ""}
          {m.detached ? " · jadwal kemunculan ini diubah sendiri" : ""}
          {!series.active && " · pengulangan dihentikan"}
          {!ro && (
            <button className="link" onClick={() => onEditSeries(series.id)}>
              Ubah seri
            </button>
          )}
        </p>
      )}

      <section className="mtg-sec" {...sec("agenda")}>
        <h3>
          <ListChecks size={15} /> Agenda
        </h3>
        <ul className="mtg-agenda">
          {m.agenda.map((a, i) => (
            <li key={a.id} className={a.done ? "done" : ""}>
              <GripVertical size={13} className="muted" aria-hidden="true" />
              <input type="checkbox" checked={a.done} disabled={ro} onChange={() => set({ agenda: m.agenda.map((x) => (x.id === a.id ? { ...x, done: !x.done } : x)) })} aria-label={`Selesai: ${a.text}`} />
              <input className="mtg-agenda-text" value={a.text} disabled={ro} onChange={(e) => set({ agenda: m.agenda.map((x) => (x.id === a.id ? { ...x, text: e.target.value } : x)) })} />
              <input className="mtg-min" type="number" min={0} placeholder="mnt" value={a.minutes ?? ""} disabled={ro} onChange={(e) => set({ agenda: m.agenda.map((x) => (x.id === a.id ? { ...x, minutes: Number(e.target.value) || undefined } : x)) })} aria-label="Menit" />
              <button className="icon-btn sm" disabled={ro || i === 0} onClick={() => { const n = [...m.agenda]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; set({ agenda: n }); }} aria-label="Naikkan">↑</button>
              <button className="icon-btn sm" disabled={ro} onClick={() => set({ agenda: m.agenda.filter((x) => x.id !== a.id) })} aria-label="Hapus butir">
                <X size={13} />
              </button>
            </li>
          ))}
        </ul>
        {!ro && (
          <form className="mtg-add" onSubmit={(e) => (e.preventDefault(), newAgenda.trim() && (set({ agenda: [...m.agenda, { id: newId(), text: newAgenda.trim(), done: false }] }), setNewAgenda("")))}>
            <Plus size={14} />
            <input value={newAgenda} onChange={(e) => setNewAgenda(e.target.value)} placeholder="Tambah butir agenda, Enter" />
          </form>
        )}
        {m.agenda.some((a) => a.minutes) && <p className="muted small">Total {m.agenda.reduce((s, a) => s + (a.minutes ?? 0), 0)} menit dari {m.end - m.start} menit rapat.</p>}
      </section>

      <section className="mtg-sec" {...sec("notulen")}>
        <h3>
          <FileText size={15} /> Notulen
        </h3>
        {note ? (
          <div className="mtg-note">
            <button className="mtg-note-card" onClick={() => (requestOpen("note", note.id), go("notes"))}>
              <span>{note.icon ?? "📄"}</span>
              <b>{note.title || "Notulen"}</b>
              <span className="muted small">{note.body.replace(/[#*>`\-[\]]/g, " ").replace(/\s+/g, " ").trim().slice(0, 140)}…</span>
            </button>
            {!ro && (
              <button
                className="btn btn-sm"
                onClick={async () => {
                  const found = actionsFromNotulen(note.body, who);
                  const fresh = found.filter((f) => !m.actions.some((a) => a.text.toLowerCase() === f.text.toLowerCase()));
                  if (!fresh.length) return toast("Tidak ada butir baru di bagian Tindak lanjut notulen");
                  await set({ actions: [...m.actions, ...fresh.map((f) => ({ ...f, id: newId() }))] });
                  toast(`${fresh.length} action item diambil dari notulen`);
                }}
              >
                <Sparkles size={14} /> Ambil action item dari notulen
              </button>
            )}
          </div>
        ) : (
          <button className="btn btn-sm" disabled={ro} onClick={makeNotulen}>
            <FileText size={14} /> Buat notulen
          </button>
        )}
      </section>

      <section className="mtg-sec" {...sec("keputusan")}>
        <h3>Keputusan</h3>
        <textarea rows={3} disabled={ro} value={m.decisions ?? ""} onChange={(e) => set({ decisions: e.target.value || undefined })} placeholder="Ringkas keputusan rapat (juga diambil otomatis dari bagian Keputusan di notulen saat mengirim hasil)" />
      </section>

      <section className="mtg-sec" {...sec("action")}>
        <h3>
          <Check size={15} /> Action item
          {m.actions.some((a) => !a.taskId) && !ro && (
            <button className="btn btn-sm" onClick={tasksFromActions}>
              Jadikan tugas semua
            </button>
          )}
        </h3>
        <ul className="mtg-actions">
          {m.actions.map((a) => {
            const t = a.taskId ? tk.tasks.find((x) => x.id === a.taskId) : undefined;
            const done = t ? isTaskDone(t, tk.projects) : false;
            const assignee = members.find((x) => x.id === a.assignee);
            return (
              <li key={a.id} className={done ? "done" : ""}>
                <input className="grow" value={a.text} disabled={ro || !!t} onChange={(e) => set({ actions: m.actions.map((x) => (x.id === a.id ? { ...x, text: e.target.value } : x)) })} aria-label="Action item" />
                <select value={a.assignee ?? ""} disabled={ro || !!t} onChange={(e) => set({ actions: m.actions.map((x) => (x.id === a.id ? { ...x, assignee: e.target.value || undefined } : x)) })} aria-label="Penanggung jawab">
                  <option value="">Penanggung jawab…</option>
                  {members.map((x) => (
                    <option key={x.id} value={x.id}>{x.isMe ? `${x.name} (saya)` : x.name}</option>
                  ))}
                </select>
                <input type="date" value={a.due ?? ""} disabled={ro || !!t} onChange={(e) => set({ actions: m.actions.map((x) => (x.id === a.id ? { ...x, due: e.target.value || undefined } : x)) })} aria-label="Tenggat" />
                {t ? (
                  <button className="chip-btn" onClick={() => (requestOpen("task", t.id), go("tasks"))} title="Buka tugas">
                    {done ? "✓ Selesai" : "Tugas"} {assignee && <Avatar m={assignee} size={16} />}
                  </button>
                ) : (
                  <button
                    className="chip-btn"
                    disabled={ro}
                    onClick={async () => {
                      const id = await toTask(a);
                      await meetings.save({ ...strip(m), actions: m.actions.map((x) => (x.id === a.id ? { ...x, taskId: id } : x)) }, m.id);
                      toast(a.assignee && a.assignee !== me?.id ? "Tugas dibuat; penanggung jawab diberi tahu lewat bot" : "Tugas dibuat");
                    }}
                  >
                    Jadikan tugas
                  </button>
                )}
                <button className="icon-btn sm" disabled={ro} onClick={() => set({ actions: m.actions.filter((x) => x.id !== a.id) })} aria-label="Hapus">
                  <X size={13} />
                </button>
              </li>
            );
          })}
        </ul>
        {!ro && (
          <form className="mtg-add" onSubmit={(e) => (e.preventDefault(), newAction.trim() && (set({ actions: [...m.actions, { id: newId(), text: newAction.trim() }] }), setNewAction("")))}>
            <Plus size={14} />
            <input value={newAction} onChange={(e) => setNewAction(e.target.value)} placeholder="Tambah action item, Enter" />
          </form>
        )}
      </section>
      <details className="mtg-preview">
        <summary>Pratinjau pesan hasil rapat</summary>
        <pre>{summaryText(m, who, note?.body)}</pre>
      </details>
      <ContextMenu {...menu.props} />
      {del && (
        <Confirm
          title="Hapus rapat?"
          text={`"${m.title}" dan bloknya di jadwal dihapus. Notulen dan tugas yang sudah dibuat tetap ada.${m.seriesId ? " Kemunculan lain dari rapat berulang tidak terpengaruh." : ""}`}
          confirmLabel="Hapus rapat"
          onConfirm={async () => {
            await meetings.remove(m.id);
            const b = `blk-${m.id}`;
            await api.remove(b, "timeblock").catch(() => {});
            onDeleted();
          }}
          onClose={() => setDel(false)}
        />
      )}
    </article>
  );
}
