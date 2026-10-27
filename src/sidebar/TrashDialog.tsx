// Sampah: halaman yang dihapus bisa dicari, dipulihkan, atau dihapus permanen.
// Isi sampah lebih dari 30 hari dibersihkan otomatis saat dialog dibuka.
import { useEffect, useMemo, useState } from "react";
import { RotateCcw, Search, Trash2 } from "lucide-react";
import { Modal, useToast } from "../components/ui";
import { useRecords } from "../lib/useRecords";
import { expired, restoreItems, TRASH_DAYS, TRASH_KIND, type TrashEntry } from "../lib/trash";
import type { Note } from "../lib/types";
import { relativeAgo } from "../lib/date";
import { useScope } from "../lib/scope";

export default function TrashDialog({ onClose, onOpen }: { onClose: () => void; onOpen: (id: string) => void }) {
  const trash = useRecords<TrashEntry>(TRASH_KIND);
  const notes = useRecords<Note>("note");
  const scope = useScope();
  const toast = useToast();
  const [q, setQ] = useState("");

  useEffect(() => {
    if (trash.loading) return;
    for (const t of trash.items) if (expired(t)) trash.remove(t.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trash.loading]);

  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    return [...trash.items]
      .filter((t) => !term || t.items.some((i) => `${i.data.title} ${i.data.body}`.toLowerCase().includes(term)))
      .sort((a, b) => b.trashedAt - a.trashedAt);
  }, [trash.items, q]);

  const restore = async (t: (typeof trash.items)[number]) => {
    const existing = new Set(notes.items.map((n) => n.id));
    const items = restoreItems(t, existing);
    for (const it of items) await notes.save(it.data, it.id);
    await trash.remove(t.id);
    toast(`"${t.title}" dipulihkan`, "info", { label: "Buka", run: () => onOpen(items[0].id) });
  };

  return (
    <Modal title="Sampah" onClose={onClose} wide>
      <label className="search">
        <Search size={15} />
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari di halaman yang dihapus" />
      </label>
      <ul className="trash-list">
        {list.map((t) => (
          <li key={t.id}>
            <span className="trash-ico">{t.icon ?? "📄"}</span>
            <span className="trash-main">
              <b>{t.title}</b>
              <span className="muted small">
                {t.projectId ? `${scope.path(t.projectId) || "Proyek terhapus"} · ` : "Halaman pribadi · "}
                {t.items.length > 1 ? `beserta ${t.items.length - 1} subhalaman · ` : ""}dihapus {relativeAgo(t.trashedAt)}
              </span>
            </span>
            <button className="btn btn-sm" onClick={() => restore(t)} title="Pulihkan">
              <RotateCcw size={14} /> Pulihkan
            </button>
            <button className="icon-btn sm" title="Hapus permanen" aria-label="Hapus permanen" onClick={async () => (await trash.remove(t.id), toast(`"${t.title}" dihapus permanen`))}>
              <Trash2 size={14} />
            </button>
          </li>
        ))}
        {list.length === 0 && <li className="muted small pad">{q ? "Tidak ada yang cocok." : "Sampah kosong. Halaman yang dihapus muncul di sini dan bisa dipulihkan."}</li>}
      </ul>
      <p className="muted small">Halaman di Sampah dihapus permanen otomatis setelah {TRASH_DAYS} hari.</p>
      {list.length > 1 && (
        <button className="link small text-danger" onClick={async () => { for (const t of list) await trash.remove(t.id); toast("Sampah dikosongkan"); }}>
          Kosongkan sampah
        </button>
      )}
    </Modal>
  );
}
