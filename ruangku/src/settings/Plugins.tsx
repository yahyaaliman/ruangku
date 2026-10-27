// Plugin & ekstensi: modul (fitur besar) yang bisa dinyalakan/dimatikan, dan ekstensi
// (perilaku otomatis) seperti penjaga waktu sholat, pengingat istirahat, rangkuman pagi,
// catat otomatis tagihan, dan server MCP.
import { Blocks, Puzzle } from "lucide-react";
import { MODULES, useModules } from "../lib/modules";
import { useGuard } from "../lib/prayerGuard";
import { useBreakConfig } from "../breaks/BreakSettings";
import { useJsonSetting } from "../lib/useSetting";
import { DEFAULT_MCP, MCP_KEY, newToken, type McpConfig } from "../ai/mcp";
import { useBotConfig, saveBot } from "../team/bot";
import { useRecords, strip } from "../lib/useRecords";
import { RECURRING_KIND, type Recurring } from "../lib/finance";

function Ext({ emoji, name, desc, on, onToggle, extra, disabled }: { emoji: string; name: string; desc: string; on: boolean; onToggle: (v: boolean) => void; extra?: React.ReactNode; disabled?: boolean }) {
  return (
    <article className={`pl-card ${on ? "on" : ""}`}>
      <header>
        <span className="pl-emoji">{emoji}</span>
        <b>{name}</b>
        <label className="switch" title={on ? "Matikan" : "Nyalakan"}>
          <input type="checkbox" checked={on} disabled={disabled} onChange={(e) => onToggle(e.target.checked)} aria-label={`${on ? "Matikan" : "Nyalakan"} ${name}`} />
        </label>
      </header>
      <p className="muted small">{desc}</p>
      {extra}
    </article>
  );
}

export function PluginsTab({ go, openTab }: { go: (page: string) => void; openTab: (t: string) => void }) {
  const mods = useModules();
  const guard = useGuard();
  const brk = useBreakConfig();
  const [mcp, saveMcp] = useJsonSetting<McpConfig>(MCP_KEY, DEFAULT_MCP);
  const bot = useBotConfig();
  const recs = useRecords<Recurring>(RECURRING_KIND);
  const autoCount = recs.items.filter((r) => r.auto && r.active).length;
  return (
    <>
      <section className="setting">
        <div className="setting-icon">
          <Blocks size={20} />
        </div>
        <div className="setting-body">
          <h2>Modul</h2>
          <p className="muted">Nyalakan hanya fitur yang Anda pakai. Modul yang dimatikan hilang dari sidebar, Ctrl+K, dasbor, dan widget; datanya tetap tersimpan dan kembali saat dinyalakan.</p>
          <div className="pl-grid">
            {MODULES.map((m) => (
              <Ext
                key={m.id}
                emoji={m.emoji}
                name={m.label}
                desc={m.desc}
                on={mods.isOn(m.id)}
                onToggle={(v) => mods.set(m.id, v)}
                extra={
                  mods.isOn(m.id) ? (
                    <button className="link small" onClick={() => go(m.page)}>
                      Buka {m.label}
                    </button>
                  ) : undefined
                }
              />
            ))}
          </div>
        </div>
      </section>
      <section className="setting">
        <div className="setting-icon">
          <Puzzle size={20} />
        </div>
        <div className="setting-body">
          <h2>Ekstensi</h2>
          <p className="muted">Perilaku otomatis yang bekerja di latar belakang selama Ruangku berjalan di tray.</p>
          <div className="pl-grid">
            <Ext
              emoji="🔌"
              name="Server MCP (Claude & ChatGPT)"
              desc="Claude Desktop, Claude Code, ChatGPT, dan klien MCP lain bisa membaca & mencatat ke Ruangku."
              on={mcp.enabled}
              onToggle={(v) => saveMcp({ ...mcp, enabled: v, token: mcp.token || newToken() })}
              extra={
                <button className="link small" onClick={() => openTab("connector")}>
                  Cara menghubungkan
                </button>
              }
            />
            <Ext emoji="🕌" name="Penjaga waktu sholat" desc="Memberi tanda dan menggeser jadwal/rapat yang menimpa waktu sholat; asisten AI juga menghindarinya." on={guard.cfg.enabled} onToggle={(v) => guard.save({ enabled: v })} extra={<button className="link small" onClick={() => go("ibadah")}>Atur durasi</button>} />
            <Ext emoji="☕" name="Pengingat istirahat" desc={`Jeda ${brk.cfg.breakMin} menit setiap ${brk.cfg.workMin} menit kerja dan istirahat mata 20-20-20, diselaraskan dengan waktu sholat.`} on={brk.cfg.enabled} onToggle={(v) => brk.save({ enabled: v })} extra={<button className="link small" onClick={() => openTab("notifikasi")}>Atur</button>} />
            <Ext
              emoji="🌅"
              name="Rangkuman pagi"
              desc="Agenda, rapat, kelas, tugas, dan tagihan jatuh tempo dikirim tiap pagi lewat Telegram/WhatsApp/email."
              on={bot.cfg.digest.enabled}
              onToggle={(v) => saveBot({ ...bot.cfg, digest: { ...bot.cfg.digest, enabled: v } })}
              extra={
                <button className="link small" onClick={() => go("team")}>
                  {bot.cfg.enabled ? "Atur jam & penerima" : "Bot belum aktif: atur di Tim & bot"}
                </button>
              }
            />
            <Ext
              emoji="💳"
              name="Catat otomatis tagihan rutin"
              desc={autoCount ? `${autoCount} tagihan/langganan dicatat otomatis saat jatuh tempo.` : "Langganan & debit otomatis langsung tercatat di buku kas saat jatuh tempo."}
              on={autoCount > 0}
              disabled={!recs.items.length}
              onToggle={(v) => {
                if (!v) for (const r of recs.items.filter((x) => x.auto)) recs.save({ ...strip(r), auto: false }, r.id);
                else go("ledger");
              }}
              extra={
                <button className="link small" onClick={() => go("ledger")}>
                  Pilih tagihan di Keuangan › Tagihan rutin
                </button>
              }
            />
            <Ext emoji="⚡" name="Catat cepat global" desc="Ctrl+Shift+Space dari aplikasi mana pun untuk mencatat tugas, catatan, atau pengeluaran (ketik 'keluar 25rb makan')." on disabled onToggle={() => {}} />
          </div>
        </div>
      </section>
    </>
  );
}
