import { createContext, useContext } from "react";
import { Bell, CheckCircle2, Circle, Diamond, Globe, GraduationCap, Handshake, Moon } from "lucide-react";
import type { CalEvent, CalView } from "../lib/calendar";
import type { Anchor } from "./Popover";
import type { Band } from "../lib/prayerGuard";
import { fmtMin } from "../lib/timeblocks";

export interface Slot {
  date: string;
  start?: number;
  end?: number;
}

export interface CalCtx {
  today: string;
  holidays: Map<string, string[]>;
  hijriDay: (date: string) => { day: number; month: string };
  selected?: string;
  move: (ev: CalEvent, date: string, start?: number | null) => void;
  resize: (ev: CalEvent, end: number) => void;
  open: (ev: CalEvent, at: Anchor) => void;
  create: (slot: Slot, at: Anchor) => void;
  pickDay: (date: string, view?: CalView) => void;
  /** Rentang waktu sholat yang dilindungi pada tanggal itu */
  bands: (date: string) => Band[];
}

export const Ctx = createContext<CalCtx | null>(null);
export const useCal = () => useContext(Ctx)!;

export const DRAG_TYPE = "application/x-ruangku-event";

export function timeRange(ev: CalEvent): string {
  if (ev.start === undefined) return "Sepanjang hari";
  if (ev.layer === "tugas") return `Tenggat ${fmtMin(ev.start)}`;
  if (ev.end === undefined || ev.end === ev.start) return fmtMin(ev.start);
  return `${fmtMin(ev.start)}–${fmtMin(ev.end)}`;
}

/** Ikon kecil penanda jenis acara (bentuk, bukan hanya warna). */
export function EvIcon({ ev, size = 12 }: { ev: CalEvent; size?: number }) {
  if (ev.layer === "tugas") return ev.done ? <CheckCircle2 size={size} aria-label="Tugas selesai" /> : <Circle size={size} aria-label="Tugas" />;
  if (ev.layer === "pengingat") return <Bell size={size} aria-label="Pengingat" />;
  if (ev.layer === "milestone") return <Diamond size={size} aria-label="Milestone" />;
  if (ev.layer === "sholat") return <Moon size={size} aria-label="Waktu sholat" />;
  if (ev.layer === "luar") return <Globe size={size} aria-label="Kalender luar" />;
  if (ev.layer === "rapat") return <Handshake size={size} aria-label="Rapat" />;
  if (ev.layer === "kuliah") return <GraduationCap size={size} aria-label="Kuliah" />;
  return null;
}

export const evLabel = (ev: CalEvent) => `${ev.title}, ${timeRange(ev)}${ev.sub ? `, ${ev.sub}` : ""}${ev.done ? ", selesai" : ""}`;
