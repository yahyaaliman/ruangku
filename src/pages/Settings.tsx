// Pengaturan bertab ala Notion: Umum, Widget, Connector, Plugin & ekstensi, Notifikasi, Data & keamanan.
import { AccountTab } from "../settings/AccountTab";
import { useState } from "react";
import { Bell, Blocks, LayoutPanelLeft, Plug, Settings2, ShieldCheck } from "lucide-react";
import BreakSettings from "../breaks/BreakSettings";
import { BackupSettings, DiagnosticsSettings, SecurityUpdateSettings } from "../settings/Reliability";
import { AppearanceSettings, AutostartSettings, DemoSettings, SidebarSettings } from "../settings/General";
import { WidgetTab } from "../settings/WidgetTab";
import { ConnectorsTab } from "../settings/Connectors";
import { PluginsTab } from "../settings/Plugins";
import { NotifSettings } from "../settings/NotifSettings";
import { SyncSettings, type Sync } from "../settings/SyncSettings";
import { useOpenRequest } from "../lib/deeplink";
import type { NavItem } from "../sidebar/Sidebar";
import "../settings/settings.css";

const TABS = [
  { id: "akun", label: "Akun Google", icon: ShieldCheck, hint: "Data & pengaturan antarperangkat" },
  { id: "umum", label: "Umum", icon: Settings2, hint: "Tema, sidebar, jalan otomatis" },
  { id: "widget", label: "Widget", icon: LayoutPanelLeft, hint: "Widget desktop" },
  { id: "connector", label: "Connector", icon: Plug, hint: "Claude, ChatGPT, kalender, bot" },
  { id: "plugin", label: "Plugin & ekstensi", icon: Blocks, hint: "Modul & otomatisasi" },
  { id: "notifikasi", label: "Notifikasi", icon: Bell, hint: "Pengingat & istirahat" },
  { id: "data", label: "Data & keamanan", icon: ShieldCheck, hint: "Sinkron, backup, pembaruan" },
] as const;
type Tab = (typeof TABS)[number]["id"];
const KEY = "ruangku-settings-tab";
const read = (): Tab => {
  try {
    const v = localStorage.getItem(KEY);
    return TABS.some((t) => t.id === v) ? (v as Tab) : "umum";
  } catch {
    return "umum";
  }
};

export default function Settings({ sync, go, moduleNav }: { sync: Sync; go: (page: string) => void; moduleNav: NavItem[] }) {
  const [tab, setTabState] = useState<Tab>(read);
  const setTab = (t: string) => {
    if (!TABS.some((x) => x.id === t)) return;
    setTabState(t as Tab);
    try {
      localStorage.setItem(KEY, t);
    } catch {
      /* abaikan */
    }
    document.querySelector(".main")?.scrollTo({ top: 0 });
  };
  useOpenRequest("settings", setTab);
  const cur = TABS.find((t) => t.id === tab)!;

  return (
    <div className="page set-page">
      <header className="page-head">
        <div>
          <h1>Pengaturan</h1>
          <p className="page-sub">Data tersimpan lokal; hubungkan akun Google untuk sinkronisasi antarperangkat. Atur tampilan, widget, connector ke Claude/ChatGPT dan layanan lain, serta modul yang Anda pakai.</p>
        </div>
      </header>
      <div className="set-layout">
        <nav className="set-nav" role="tablist" aria-label="Bagian pengaturan" aria-orientation="vertical">
          {TABS.map((t) => (
            <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? "on" : ""} onClick={() => setTab(t.id)}>
              <t.icon size={16} />
              <span>
                {t.label}
                <small>{t.hint}</small>
              </span>
            </button>
          ))}
        </nav>
        <div className="set-content" role="tabpanel" aria-label={cur.label}>
          {tab === "akun" && <AccountTab />}
          {tab === "umum" && (
            <>
              <AppearanceSettings />
              <SidebarSettings moduleNav={moduleNav} />
              <AutostartSettings />
              <DemoSettings />
            </>
          )}
          {tab === "widget" && <WidgetTab />}
          {tab === "connector" && <ConnectorsTab go={go} sync={sync} openTab={setTab} />}
          {tab === "plugin" && <PluginsTab go={go} openTab={setTab} />}
          {tab === "notifikasi" && (
            <>
              <NotifSettings />
              <BreakSettings />
            </>
          )}
          {tab === "data" && (
            <>
              <SyncSettings sync={sync} />
              <BackupSettings />
              <SecurityUpdateSettings />
              <DiagnosticsSettings />
            </>
          )}
          <p className="muted small about">
            Ruangku 0.4.1. Database lokal ada di <code>%APPDATA%\com.ruangku.app\ruangku.db</code>, backup harian di subfolder <code>backups</code>. Pintasan: Ctrl+K cari & perintah, Ctrl+\ sidebar, Ctrl+1 sampai Ctrl+9 pindah halaman, Ctrl+P pilih proyek, Ctrl+J asisten AI, Ctrl+N item baru, Ctrl+Shift+Space catat cepat dari mana saja, F1 panduan.
          </p>
        </div>
      </div>
    </div>
  );
}
