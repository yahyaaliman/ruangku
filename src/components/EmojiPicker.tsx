// Pemilih ikon emoji untuk proyek dan halaman (ala Notion): kategori, pencarian kata kunci
// berbahasa Indonesia, tombol acak, dan hapus ikon.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Search, Shuffle, Trash2 } from "lucide-react";
import "./menu.css";
import type { MenuAt } from "./ContextMenu";

const GROUPS: { name: string; items: [string, string][] }[] = [
  {
    name: "Kerja & belajar",
    items: [
      ["📄", "halaman dokumen kertas"], ["📝", "catatan tulis memo"], ["📌", "pin tanda penting"], ["📎", "lampiran klip"], ["📁", "folder map"], ["🗂️", "arsip berkas"],
      ["📚", "buku pustaka belajar"], ["📖", "baca buku"], ["🎓", "kuliah wisuda kampus mahasiswa"], ["🏫", "sekolah kampus kelas"], ["✏️", "pensil tugas"], ["🖊️", "pena"],
      ["🧪", "eksperimen lab riset"], ["🔬", "mikroskop riset penelitian"], ["📊", "grafik data statistik"], ["📈", "naik grafik pertumbuhan kpi"], ["📉", "turun grafik"], ["🧮", "hitung kalkulasi"],
      ["💼", "kerja kantor bisnis"], ["🗓️", "jadwal kalender rapat"], ["📅", "kalender tanggal"], ["⏰", "alarm pengingat waktu"], ["⏳", "tenggat waktu"], ["🗒️", "notulen catatan"],
      ["🤝", "rapat kerja sama meeting"], ["🗣️", "diskusi presentasi"], ["📣", "pengumuman"], ["📮", "surat kirim"], ["✉️", "email surat"], ["📞", "telepon panggilan"],
      ["💻", "laptop komputer koding"], ["🖥️", "komputer desktop"], ["⌨️", "keyboard"], ["🧑‍💻", "programmer developer"], ["🐞", "bug galat"], ["🛠️", "alat perbaikan"],
      ["⚙️", "pengaturan setelan"], ["🔧", "kunci inggris perbaikan"], ["🧩", "puzzle template integrasi"], ["🔗", "tautan link"], ["🔍", "cari riset"], ["🧭", "arah strategi review"],
    ],
  },
  {
    name: "Target & status",
    items: [
      ["🎯", "target tujuan okr"], ["🚀", "peluncuran proyek mulai"], ["🏆", "juara prestasi"], ["🥇", "nomor satu"], ["⭐", "bintang favorit"], ["✨", "baru spesial"],
      ["✅", "selesai beres"], ["☑️", "centang"], ["❌", "batal gagal"], ["⚠️", "peringatan risiko"], ["❗", "penting"], ["❓", "pertanyaan"],
      ["🔥", "mendesak panas"], ["💡", "ide gagasan"], ["🧠", "pikiran otak"], ["🔒", "rahasia kunci privat"], ["🔑", "akses kunci"], ["🛡️", "keamanan perlindungan"],
      ["🟥", "merah"], ["🟧", "oranye"], ["🟨", "kuning"], ["🟩", "hijau"], ["🟦", "biru"], ["🟪", "ungu"],
    ],
  },
  {
    name: "Uang & usaha",
    items: [
      ["💰", "uang kas keuangan"], ["💵", "dolar tunai"], ["💳", "kartu kredit debit"], ["🏦", "bank tabungan"], ["🪙", "koin"], ["🧾", "struk kuitansi tagihan"],
      ["🛒", "belanja keranjang"], ["🛍️", "belanja tas"], ["🏪", "toko warung"], ["🏢", "gedung kantor perusahaan"], ["📦", "paket produk barang"], ["🚚", "kirim logistik"],
      ["🤲", "infaq sedekah doa"], ["🎁", "hadiah donasi"], ["💸", "pengeluaran uang terbang"], ["📒", "buku kas akuntansi"], ["⚖️", "hukum seimbang"], ["🏷️", "label harga"],
    ],
  },
  {
    name: "Hidup & ibadah",
    items: [
      ["🕌", "masjid ibadah sholat"], ["📿", "tasbih dzikir"], ["🌙", "bulan ramadan malam"], ["☪️", "islam"], ["🤲", "doa"], ["🕋", "kabah haji umrah"],
      ["🏠", "rumah keluarga"], ["👪", "keluarga"], ["❤️", "cinta hati"], ["😊", "senang"], ["🧘", "meditasi tenang"], ["🏃", "olahraga lari"],
      ["🍽️", "makan"], ["☕", "kopi istirahat"], ["🥗", "sehat diet"], ["💊", "obat kesehatan"], ["🩺", "dokter kesehatan"], ["😴", "tidur"],
      ["✈️", "perjalanan liburan pesawat"], ["🏖️", "liburan pantai"], ["🚗", "mobil kendaraan"], ["🏍️", "motor"], ["🚆", "kereta"], ["🗺️", "peta perjalanan"],
      ["🌱", "tumbuh tanaman awal"], ["🌳", "pohon"], ["🌸", "bunga"], ["☀️", "matahari pagi"], ["🌧️", "hujan"], ["🐱", "kucing hewan"],
      ["🎵", "musik"], ["🎮", "game main"], ["📷", "foto kamera"], ["🎨", "seni desain"], ["🎬", "film video"], ["⚽", "bola sepak"],
    ],
  },
];

export const ALL_EMOJI = GROUPS.flatMap((g) => g.items.map(([e]) => e));

export function EmojiPicker({ at, onPick, onRemove, onClose }: { at: MenuAt; onPick: (emoji: string) => void; onRemove?: () => void; onClose: () => void }) {
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState(at);
  useLayoutEffect(() => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    setPos({ x: Math.max(6, Math.min(at.x, window.innerWidth - r.width - 6)), y: at.y + r.height > window.innerHeight - 6 ? Math.max(6, at.y - r.height - 8) : at.y });
  }, [at]);
  useEffect(() => {
    const down = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && onClose();
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopImmediatePropagation(); onClose(); } };
    window.addEventListener("mousedown", down, true);
    window.addEventListener("keydown", esc, true);
    return () => {
      window.removeEventListener("mousedown", down, true);
      window.removeEventListener("keydown", esc, true);
    };
  }, [onClose]);
  const groups = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return GROUPS;
    const hits = GROUPS.flatMap((g) => g.items).filter(([e, k]) => k.includes(t) || e === t);
    return [{ name: `Hasil "${q}"`, items: [...new Map(hits.map((h) => [h[0], h])).values()] }];
  }, [q]);
  const pick = (e: string) => {
    onPick(e);
    onClose();
  };
  return createPortal(
    <div ref={ref} className="emoji-pop" style={{ left: pos.x, top: pos.y }} role="dialog" aria-label="Pilih ikon">
      <div className="emoji-head">
        <label className="search search-sm">
          <Search size={13} />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && /\p{Extended_Pictographic}/u.test(q.trim())) { e.preventDefault(); pick(q.trim()); } }} placeholder="Cari: uang, kuliah, rapat…" />
        </label>
        <button className="icon-btn sm" title="Acak" aria-label="Ikon acak" onClick={() => pick(ALL_EMOJI[Math.floor(Math.random() * ALL_EMOJI.length)])}>
          <Shuffle size={14} />
        </button>
        {onRemove && (
          <button className="icon-btn sm" title="Hapus ikon" aria-label="Hapus ikon" onClick={() => (onRemove(), onClose())}>
            <Trash2 size={14} />
          </button>
        )}
      </div>
      <div className="emoji-body">
        {groups.map((g) => (
          <section key={g.name}>
            <p className="emoji-group">{g.name}</p>
            <div className="emoji-grid">
              {g.items.map(([e, k]) => (
                <button type="button" aria-label={k} key={e + k} title={k.split(" ")[0]} onClick={() => pick(e)}>
                  {e}
                </button>
              ))}
            </div>
          </section>
        ))}
        {groups[0]?.items.length === 0 && <p className="muted small pad">Tidak ada ikon untuk "{q}". Anda bisa mengetik emoji langsung lalu tekan Enter.</p>}
      </div>
      {q.trim() && /\p{Extended_Pictographic}/u.test(q) && (
        <button className="btn btn-sm emoji-use" onClick={() => pick(q.trim())}>
          Pakai {q.trim()}
        </button>
      )}
    </div>,
    document.body,
  );
}
