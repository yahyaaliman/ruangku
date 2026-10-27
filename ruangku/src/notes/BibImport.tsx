// Impor daftar pustaka (.bib dari Zotero/Mendeley/Google Scholar) menjadi halaman "Pustaka"
// berisi daftar pustaka APA, plus satu halaman catatan baca per referensi.
import { useMemo, useState } from "react";
import { BookMarked, Upload } from "lucide-react";
import { Field, Modal, useToast } from "../components/ui";
import { newId, openTextFile } from "../lib/api";
import type { Item, Note } from "../lib/types";
import { apa, inText, parseBibtex, sortRefs, toRef, type Ref } from "../lib/bibtex";
import { ProjectSelect } from "../projects/ProjectSwitcher";
import { useScope } from "../lib/scope";
import { useRecords } from "../lib/useRecords";

const refTag = (key: string) => `ref:${key.toLowerCase()}`;

function refBody(r: Ref): string {
  const link = r.doi ? `https://doi.org/${r.doi}` : r.url;
  return [
    `> ${apa(r)}`,
    "",
    `**Sitasi dalam teks:** ${inText(r)} · **Kunci:** \`${r.key}\``,
    link ? `**Tautan:** [${link}](${link})` : "",
    "",
    "## Ringkasan",
    r.abstract ?? "_Tulis ringkasan dengan kata-kata sendiri._",
    "",
    "## Metode & data",
    "- ",
    "",
    "## Temuan penting",
    "- ",
    "",
    "## Relevansi untuk thesis",
    "- ",
  ]
    .filter((x, i, a) => !(x === "" && a[i - 1] === ""))
    .join("\n");
}

export default function BibImport({ notes, save, onClose, onDone }: { notes: Item<Note>[]; save: (n: Note, id: string) => Promise<string>; onClose: () => void; onDone: (pageId: string) => void }) {
  const toast = useToast();
  const scope = useScope();
  const [text, setText] = useState("");
  const [file, setFile] = useState("");
  const [projectId, setProjectId] = useState<string | undefined>(scope.defaultProjectId);
  const [perRef, setPerRef] = useState(true);
  const [busy, setBusy] = useState(false);
  const refStore = useRecords<Ref & { projectId?: string; noteId?: string }>("reference");
  const refs = useMemo(() => sortRefs(parseBibtex(text).map(toRef)), [text]);
  const existing = useMemo(() => new Set(notes.flatMap((n) => n.tags.filter((t) => t.startsWith("ref:")))), [notes]);
  const fresh = refs.filter((r) => !existing.has(refTag(r.key)));

  const run = async () => {
    setBusy(true);
    try {
      // Halaman induk "Pustaka" per proyek (dipakai ulang bila sudah ada).
      let parent = notes.find((n) => n.tags.includes("pustaka") && !n.parentId && (n.projectId ?? "") === (projectId ?? ""));
      const parentId = parent?.id ?? newId();
      const childIds = new Map<string, string>();
      for (const n of notes) for (const t of n.tags) if (t.startsWith("ref:")) childIds.set(t, n.id);
      if (perRef)
        for (const r of fresh) {
          const id = newId();
          childIds.set(refTag(r.key), id);
          await save({ title: `${inText(r).slice(1, -1)} — ${r.title}`.slice(0, 120), body: refBody(r), tags: ["pustaka-item", refTag(r.key), ...r.keywords.slice(0, 4)], icon: "📄", parentId }, id);
        }
      // Simpan referensi sebagai data (ikut sinkron), lalu tulis ulang daftar pustaka dari semuanya.
      for (const r of refs) await refStore.save({ ...r, projectId, noteId: childIds.get(refTag(r.key)) }, `ref-${projectId ?? "umum"}-${r.key}`.slice(0, 120));
      const prevRefs = refStore.items.filter((x) => (x.projectId ?? "") === (projectId ?? "") && !refs.some((r) => r.key === x.key));
      const all = sortRefs([...prevRefs, ...refs]);
      const list = all.map((r) => {
        const cid = childIds.get(refTag(r.key));
        return `- ${apa(r)}${cid ? ` — [catatan](note:${cid})` : ""}`;
      });
      const body = [`Daftar pustaka (${all.length} referensi, gaya APA 7). Terakhir diimpor dari ${file || "BibTeX"} pada ${new Date().toLocaleDateString("id-ID", { dateStyle: "long" })}.`, "", ...list].join("\n");
      parent = { ...(parent ?? ({} as Item<Note>)), title: parent?.title ?? "Pustaka", body, tags: [...new Set([...(parent?.tags ?? []), "pustaka"])], icon: parent?.icon ?? "📚", projectId };
      const { id: _i, updatedAt: _u, ...data } = parent as Item<Note>;
      await save(data as Note, parentId);
      toast(`${refs.length} referensi diimpor${perRef ? `, ${fresh.length} halaman catatan baru` : ""}`);
      onDone(parentId);
      onClose();
    } catch (e) {
      toast(`Gagal mengimpor: ${e instanceof Error ? e.message : String(e)}`, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Impor daftar pustaka"
      onClose={onClose}
      wide
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Batal
          </button>
          <button className="btn btn-primary" disabled={!refs.length || busy} onClick={run}>
            <BookMarked size={15} /> Impor {refs.length || ""} referensi
          </button>
        </>
      }
    >
      <div className="form">
        <p className="muted">
          Di Zotero: klik kanan koleksi → <i>Export Collection…</i> → format <b>BibTeX</b>. Mendeley dan Google Scholar juga bisa mengekspor .bib. Ruangku membuat halaman <b>Pustaka</b> berisi daftar pustaka gaya APA, dan (opsional) satu halaman catatan baca per referensi. Impor ulang hanya menambah yang baru.
        </p>
        <div className="btn-row">
          <button
            className="btn"
            onClick={async () => {
              const f = await openTextFile("Pilih berkas BibTeX", { name: "BibTeX", extensions: ["bib", "bibtex", "txt"] });
              if (f) (setText(f.text), setFile(f.name));
            }}
          >
            <Upload size={15} /> Pilih berkas .bib
          </button>
          {file && <span className="muted small">{file}</span>}
        </div>
        <Field label="Atau tempel isi BibTeX">
          <textarea rows={5} value={text} onChange={(e) => setText(e.target.value)} placeholder="@article{kunci2024, title = {...}, author = {...}, year = {2024} }" className="mono" />
        </Field>
        <div className="form-row">
          <Field label="Proyek">
            <ProjectSelect value={projectId} onChange={setProjectId} projects={scope.allProjects} />
          </Field>
          <label className="check-row" style={{ alignSelf: "end", paddingBottom: 8 }}>
            <input type="checkbox" checked={perRef} onChange={(e) => setPerRef(e.target.checked)} /> Buat halaman catatan per referensi
          </label>
        </div>
        {refs.length > 0 && (
          <div className="bib-preview">
            <p className="small muted">
              {refs.length} referensi terbaca{refs.length - fresh.length ? `, ${refs.length - fresh.length} sudah ada` : ""}:
            </p>
            <ol>
              {refs.slice(0, 8).map((r) => (
                <li key={r.key} className={existing.has(refTag(r.key)) ? "dup" : ""}>
                  {apa(r).replace(/\*/g, "")}
                </li>
              ))}
              {refs.length > 8 && <li className="muted">…dan {refs.length - 8} lainnya</li>}
            </ol>
          </div>
        )}
      </div>
    </Modal>
  );
}
