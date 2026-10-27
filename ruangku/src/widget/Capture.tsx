import { useEffect, useRef, useState } from "react";
import { api, isDesktop, onEvent } from "../lib/api";
import { parseQuick } from "../lib/quickParse";
import { useTasks } from "../lib/useTasks";
import { PRIORITIES, projectOf } from "../lib/tasks";
import { fmtMin } from "../lib/timeblocks";
import { dateKey } from "../lib/date";
import { shortDate } from "../tasks/shared";
import { LEDGER_KIND, parseMoneyText } from "../lib/finance";
import { newId } from "../lib/api";

/** "keluar 25rb makan siang" / "masuk 1,5jt honor" → catat ke buku kas. */
const MONEY = /^(keluar|bayar|beli|belanja|masuk|terima|gaji)\s+(.+)$/i;

/** Jendela catat cepat (Ctrl+Shift+Space): ketik, Enter, selesai. */
export default function Capture() {
  const t = useTasks();
  const [text, setText] = useState("");
  const [saved, setSaved] = useState<string | null>(null);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const focus = () => {
      setSaved(null);
      window.setTimeout(() => ref.current?.focus(), 30);
    };
    focus();
    const stop = onEvent("capture-open", focus);
    window.addEventListener("focus", focus);
    return () => {
      stop();
      window.removeEventListener("focus", focus);
    };
  }, []);

  const close = () => {
    setText("");
    if (isDesktop) api.captureHide();
  };

  const p = parseQuick(text, new Date(), t.projects.map((x) => x.name));
  const project = p.project ? t.projects.find((x) => x.name.toLowerCase().startsWith(p.project!.toLowerCase())) : undefined;

  const money = MONEY.exec(text.trim());
  const flow = money ? (/^(masuk|terima|gaji)$/i.test(money[1]) ? "masuk" : "keluar") : null;
  const parsedMoney = money && flow ? parseMoneyText(/^gaji$/i.test(money[1]) ? `${money[2]} gaji` : money[2], flow) : null;

  const submit = async () => {
    if (parsedMoney && flow) {
      let acc: string | undefined;
      try {
        acc = JSON.parse((await api.getSetting("finance_prefs")) ?? "{}").defaultAccount;
      } catch {
        acc = undefined;
      }
      await api.save(newId(), LEDGER_KIND, { date: dateKey(), type: flow, amount: parsedMoney.amount, category: parsedMoney.category, description: parsedMoney.description || undefined, accountId: acc, method: "transfer" });
      setSaved(`${flow === "keluar" ? "Pengeluaran" : "Pemasukan"} Rp${parsedMoney.amount.toLocaleString("id-ID")} dicatat di Keuangan`);
      setText("");
      window.setTimeout(close, 900);
      return;
    }
    if (!p.title) return;
    await t.create({ title: p.title, projectId: project?.id, due: p.due, dueTime: p.dueTime, tags: p.tags, priority: p.priority, estimate: p.estimate, recurrence: p.recurrence });
    setSaved(`Tersimpan ke ${project ? project.name : "Inbox"}`);
    setText("");
    window.setTimeout(close, 700);
  };

  const chips = parsedMoney ? [`${flow === "keluar" ? "💸 Keluar" : "💵 Masuk"} Rp${parsedMoney.amount.toLocaleString("id-ID")}`, `🏷 ${parsedMoney.category}`, ...(parsedMoney.description ? [parsedMoney.description] : [])] : [
    p.due && `📅 ${shortDate(p.due, dateKey())}`,
    p.dueTime !== undefined && `⏰ ${fmtMin(p.dueTime)}`,
    p.priority && `⚑ ${PRIORITIES.find((x) => x.id === p.priority)?.label}`,
    `▣ ${project ? projectOf(t.projects, project.id).name : p.project ? `${p.project} (tidak ditemukan, ke Inbox)` : "Inbox"}`,
    p.estimate && `⏱ ${p.estimate} menit`,
    p.recurrence && "↻ berulang",
    ...p.tags.map((g) => `#${g}`),
  ].filter(Boolean) as string[];

  return (
    <div className={`capture ${!isDesktop ? "capture-preview" : ""}`}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <span className="capture-plus" aria-hidden="true">+</span>
        <input
          ref={ref}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Escape" && close()}
          onBlur={() => isDesktop && !text && window.setTimeout(close, 150)}
          placeholder="Catat tugas… mis. Telepon klien besok jam 10 #kerja !tinggi"
          aria-label="Catat tugas cepat"
        />
      </form>
      <div className="capture-foot">
        {saved ? <span className="capture-saved">✓ {saved}</span> : text ? chips.map((c) => <span key={c} className="capture-chip">{c}</span>) : <span className="capture-hint">Enter untuk simpan · Esc untuk tutup · @Proyek #tag !prioritas ~30m · "keluar 25rb makan" untuk keuangan</span>}
      </div>
    </div>
  );
}
