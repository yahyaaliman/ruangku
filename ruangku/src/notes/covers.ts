// Sampul halaman: gradasi bawaan (tersimpan sebagai "grad:<nama>") atau gambar (URL/data URL).
export const COVER_GRADIENTS: Record<string, string> = {
  nila: "linear-gradient(120deg, #3b4cca 0%, #8d9bff 100%)",
  senja: "linear-gradient(120deg, #f6a05a 0%, #e0566b 55%, #6b3fa0 100%)",
  pagi: "linear-gradient(120deg, #fbe7a1 0%, #f8b88b 100%)",
  daun: "linear-gradient(120deg, #2f8f6b 0%, #9be3c3 100%)",
  laut: "linear-gradient(120deg, #1c6ea4 0%, #6ad0e8 100%)",
  pasir: "linear-gradient(120deg, #e9dcc3 0%, #c9a77c 100%)",
  malam: "linear-gradient(120deg, #131823 0%, #2a38a3 100%)",
  kunyit: "linear-gradient(120deg, #e0a526 0%, #fbf1d9 100%)",
  jambu: "linear-gradient(120deg, #f7c6d9 0%, #c86b98 100%)",
  batik: "repeating-linear-gradient(45deg, #8a5f00 0 12px, #e0a526 12px 24px, #fbf1d9 24px 36px)",
  kertas: "linear-gradient(180deg, #f6f7fa 0%, #dde2ea 100%)",
  abu: "linear-gradient(120deg, #4a5468 0%, #7c869a 100%)",
};

export function coverCss(cover: string | undefined): string | undefined {
  if (!cover) return undefined;
  if (cover.startsWith("grad:")) return COVER_GRADIENTS[cover.slice(5)] ?? COVER_GRADIENTS.nila;
  if (/^(https?:|data:image\/)/.test(cover)) return `url("${cover.replace(/"/g, "%22")}")`;
  return undefined;
}

export const randomCover = () => {
  const k = Object.keys(COVER_GRADIENTS);
  return `grad:${k[Math.floor(Math.random() * k.length)]}`;
};
