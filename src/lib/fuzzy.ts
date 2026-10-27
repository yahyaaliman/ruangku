// Pencocokan teks sederhana untuk palet perintah: tanpa beda huruf besar/kecil
// dan aksen, setiap kata kueri harus muncul; awal kata dan urutan dekat dinilai lebih tinggi.

export const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

/** Skor kecocokan (lebih besar lebih baik), atau -1 bila tidak cocok. */
export function score(text: string, query: string): number {
  const q = fold(query).trim();
  if (!q) return 0;
  const t = fold(text);
  let total = 0;
  for (const word of q.split(/\s+/)) {
    const i = t.indexOf(word);
    if (i >= 0) {
      const atWord = i === 0 || /[\s\-_/·:([]/.test(t[i - 1]);
      total += 10 + (atWord ? 8 : 0) + (i === 0 ? 6 : 0) + Math.max(0, 6 - i / 8);
      continue;
    }
    // Inisial berurutan, mis. "ri th" ~ "Riset thesis" atau "pdh" ~ "perpanjang domain hosting".
    const initials = t
      .split(/[\s\-_/·]+/)
      .map((w) => w[0] ?? "")
      .join("");
    if (word.length >= 2 && initials.includes(word)) {
      total += 6;
      continue;
    }
    return -1;
  }
  // Teks pendek yang cocok lebih relevan daripada teks panjang.
  return total - Math.min(8, t.length / 20);
}

export interface Ranked<T> {
  item: T;
  score: number;
}

export function rank<T>(items: T[], query: string, text: (x: T) => string, limit = 50): Ranked<T>[] {
  const out: Ranked<T>[] = [];
  for (const item of items) {
    const s = score(text(item), query);
    if (s >= 0) out.push({ item, score: s });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, limit);
}

/** Bagian teks yang cocok, untuk disorot. */
export function highlight(text: string, query: string): { text: string; hit: boolean }[] {
  const words = fold(query).trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [{ text, hit: false }];
  const t = fold(text);
  const mark = new Array(text.length).fill(false);
  for (const w of words) {
    const i = t.indexOf(w);
    if (i >= 0) for (let j = i; j < i + w.length && j < mark.length; j++) mark[j] = true;
  }
  const out: { text: string; hit: boolean }[] = [];
  for (let i = 0; i < text.length; i++) {
    const last = out[out.length - 1];
    if (last && last.hit === mark[i]) last.text += text[i];
    else out.push({ text: text[i], hit: mark[i] });
  }
  return out;
}
