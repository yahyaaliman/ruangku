// Gambar di catatan disimpan di dalam Markdown sebagai data URL supaya ikut tersinkron.
// Gambar besar diperkecil dulu (sisi terpanjang 1600 px, JPEG 82%) agar catatan tetap ringan.
export const MAX_SIDE = 1600;

export function fitSize(w: number, h: number, max = MAX_SIDE): { w: number; h: number } {
  if (w <= max && h <= max) return { w, h };
  const s = max / Math.max(w, h);
  return { w: Math.round(w * s), h: Math.round(h * s) };
}

const readAsDataUrl = (f: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(f);
  });

export async function imageFileToDataUrl(file: File): Promise<string> {
  const raw = await readAsDataUrl(file);
  // Gambar kecil, GIF (animasi), dan SVG disimpan apa adanya.
  if (file.size < 250_000 || /gif|svg/.test(file.type)) return raw;
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.src = raw;
  });
  const { w, h } = fitSize(img.naturalWidth, img.naturalHeight);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return raw;
  const png = file.type === "image/png";
  if (!png) {
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, w, h);
  }
  ctx.drawImage(img, 0, 0, w, h);
  const out = canvas.toDataURL(png && file.size < 900_000 ? "image/png" : "image/jpeg", 0.82);
  return out.length < raw.length ? out : raw;
}
