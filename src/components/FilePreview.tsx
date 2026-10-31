import { useEffect, useRef, useState } from "react";
import { api, errorText, isDesktop } from "../lib/api";
import type { FsEntry } from "../lib/types";
import type { PDFDocumentProxy } from "pdfjs-dist";

export type PreviewData = { kind: "text"; text: string; truncated: boolean } | { kind: "image"; mime: string; bytes: number[] } | { kind: "pdf"; bytes: number[] };

function PdfPreview({ bytes }: { bytes: number[] }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [pdf, setPdf] = useState<PDFDocumentProxy>();
  const [page, setPage] = useState(1);
  const [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    let destroy: (() => void) | undefined;
    (async () => {
      const lib = await import("pdfjs-dist");
      const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
      if (cancelled) return;
      lib.GlobalWorkerOptions.workerSrc = worker.default;
      const loading = lib.getDocument({ data: new Uint8Array(bytes), useSystemFonts: true, disableFontFace: true });
      destroy = () => { void loading.destroy(); };
      const doc = await loading.promise;
      if (!cancelled) { setPdf(doc); setPage(1); }
    })().catch(e => { if (!cancelled) setError(errorText(e)); });
    return () => { cancelled = true; destroy?.(); };
  }, [bytes]);
  useEffect(() => {
    if (!pdf || !canvas.current) return;
    let cancelled = false;
    let stop: (() => void) | undefined;
    pdf.getPage(page).then(p => {
      if (cancelled || !canvas.current) return;
      const el = canvas.current;
      const base = p.getViewport({ scale: 1 });
      const viewport = p.getViewport({ scale: Math.min(2, 900 / base.width) });
      el.width = viewport.width; el.height = viewport.height;
      const task = p.render({ canvas: el, viewport });
      stop = () => task.cancel();
      return task.promise;
    }).catch(e => { if (!cancelled) setError(errorText(e)); });
    return () => { cancelled = true; stop?.(); };
  }, [pdf, page]);
  if (error) return <p role="status">PDF tidak dapat ditampilkan: {error}</p>;
  return <div><canvas ref={canvas} aria-label={`Pratinjau halaman ${page}`} />{pdf ? <div className="preview-pages"><button className="btn btn-sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>‹</button><span>{page} / {pdf.numPages}</span><button className="btn btn-sm" disabled={page === pdf.numPages} onClick={() => setPage(p => p + 1)}>›</button></div> : <p>Memuat PDF…</p>}</div>;
}

export function FilePreview({ file }: { file: FsEntry }) {
  const [data, setData] = useState<PreviewData>();
  const [error, setError] = useState("");
  const [image, setImage] = useState("");
  useEffect(() => {
    setData(undefined); setError(""); setImage("");
    if (file.isDir) return;
    if (!isDesktop) { setError("Pratinjau file lokal tersedia di aplikasi desktop."); return; }
    let live = true;
    api.filePreview(file.path).then(d => { if (live) setData(d); }).catch(e => { if (live) setError(errorText(e)); });
    return () => { live = false; };
  }, [file.path, file.modified, file.size, file.isDir]);
  useEffect(() => {
    if (data?.kind !== "image") return;
    const url = URL.createObjectURL(new Blob([new Uint8Array(data.bytes)], { type: data.mime }));
    setImage(url);
    return () => URL.revokeObjectURL(url);
  }, [data]);
  if (file.isDir) return null;
  return <section className="file-preview" aria-label="Pratinjau isi file">
    {error ? <p role="status">{error}</p> : !data ? <p>Memuat pratinjau…</p> : data.kind === "text" ? <><pre>{data.text}</pre>{data.truncated && <small>Hanya 256 KB pertama ditampilkan.</small>}</> : data.kind === "pdf" ? <PdfPreview key={`${file.path}:${file.modified}`} bytes={data.bytes} /> : image ? <img src={image} alt={file.name} onError={() => setError("Gambar tidak dapat dibaca.")} /> : null}
  </section>;
}
