import { describe, expect, it } from "vitest";
import { eventsInRange, holidaysIn, LAYERS, onDate, shiftAnchor, viewRange, viewTitle, weekLanes, type CalData, type Layer } from "./calendar";
import { DEFAULT_STATUSES, type Project, type Task } from "./tasks";
import type { Item, Reminder, TimeBlock } from "./types";

const proj = (id: string, extra: Partial<Project> = {}): Item<Project> => ({ id, updatedAt: 0, name: id, color: "laut", statuses: DEFAULT_STATUSES, ...extra });
const task = (id: string, extra: Partial<Task>): Item<Task> => ({ id, updatedAt: 0, title: id, projectId: "p1", status: "todo", tags: [], checklist: [], dependsOn: [], order: 0, createdAt: 0, ...extra });
const block = (id: string, extra: Partial<TimeBlock>): Item<TimeBlock> => ({ id, updatedAt: 0, date: "2026-10-26", start: 540, end: 600, title: id, ...extra });

const all = new Set<Layer>(LAYERS.map((l) => l.id));
const opt = { layers: all, match: () => true };

const data = (over: Partial<CalData> = {}): CalData => ({ blocks: [], tasks: [], reminders: [], projects: [proj("p1")], external: [], ...over });

describe("eventsInRange", () => {
  it("blok: warna proyek dari tugas, blok tercatat di lapisan terpisah", () => {
    const ev = eventsInRange(
      data({ blocks: [block("b1", { taskId: "t1" }), block("b2", { tracked: true }), block("b3", { date: "2026-11-30" })], tasks: [task("t1", {})] }),
      "2026-10-26",
      "2026-11-01",
      opt,
    );
    expect(ev.map((e) => e.key)).toEqual(["b:b1", "b:b2"]);
    expect(ev[0]).toMatchObject({ projectId: "p1", color: "laut", movable: true });
    expect(ev[1]).toMatchObject({ layer: "tercatat", movable: false });
  });

  it("tugas: tenggat berjam, hanya di tanggal tenggat, dan sembunyikan selesai", () => {
    const tasks = [task("a", { due: "2026-10-27", dueTime: 600, estimate: 45 }), task("b", { start: "2026-10-20", due: "2026-10-28" }), task("c", { due: "2026-10-27", status: "done" })];
    const ev = eventsInRange(data({ tasks }), "2026-10-26", "2026-11-01", { ...opt, hideDone: true });
    expect(ev.find((e) => e.key === "t:a")).toMatchObject({ start: 600, end: 645, date: "2026-10-27" });
    expect(ev.find((e) => e.key === "t:b")).toMatchObject({ date: "2026-10-28" });
    expect(ev.find((e) => e.key === "t:b")?.endDate).toBeUndefined();
    expect(ev.some((e) => e.key === "t:c")).toBe(false);
  });

  it("pengingat berulang muncul tiap hari, tidak bisa digeser", () => {
    const r: Item<Reminder> = { id: "r1", updatedAt: 0, title: "Minum", dueAt: new Date(2026, 9, 20, 8, 0).getTime(), repeat: "daily", done: false };
    const ev = eventsInRange(data({ reminders: [r] }), "2026-10-26", "2026-10-28", opt);
    expect(ev.map((e) => e.date)).toEqual(["2026-10-26", "2026-10-27", "2026-10-28"]);
    expect(ev[0]).toMatchObject({ start: 480, movable: false });
  });

  it("milestone & periode proyek, filter lingkup proyek", () => {
    const projects = [proj("p1", { start: "2026-10-01", end: "2026-12-31", milestones: [{ id: "m", title: "Sidang", date: "2026-10-29" }] }), proj("p2", { milestones: [{ id: "n", title: "Lain", date: "2026-10-29" }] })];
    const ev = eventsInRange(data({ projects }), "2026-10-26", "2026-11-01", { layers: all, match: (id) => id === "p1" });
    expect(ev.map((e) => e.key).sort()).toEqual(["m:p1:m", "p:p1"]);
  });

  it("kalender luar: libur beberapa hari dan acara berulang yang diganti", () => {
    const external = [
      {
        id: "lib",
        name: "Libur",
        color: "bata" as const,
        holiday: true,
        events: [{ uid: "cuti", title: "Cuti bersama", date: "2026-10-30", endDate: "2026-11-02", allDay: true }],
      },
      {
        id: "g",
        name: "Kantor",
        color: "ungu" as const,
        events: [
          { uid: "w", title: "Rapat", date: "2026-10-19", start: 540, end: 600, allDay: false, rrule: "FREQ=WEEKLY" },
          { uid: "w", title: "Rapat (pindah)", date: "2026-10-27", start: 600, end: 660, allDay: false, recurrenceOf: "2026-10-26" },
        ],
      },
    ];
    const ev = eventsInRange(data({ external }), "2026-10-26", "2026-11-01", opt);
    expect(ev.filter((e) => e.title.startsWith("Rapat")).map((e) => [e.title, e.date])).toEqual([["Rapat (pindah)", "2026-10-27"]]);
    const h = holidaysIn(ev);
    expect([...h.keys()]).toEqual(["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02"]);
    // Libur yang mulai sebelum rentang tetap muncul.
    const later = eventsInRange(data({ external }), "2026-11-01", "2026-11-07", opt);
    expect(later.find((e) => e.title === "Cuti bersama")).toMatchObject({ date: "2026-10-30", endDate: "2026-11-02" });
  });

  it("waktu sholat sebagai penanda tanpa durasi", () => {
    const ev = eventsInRange(data({ prayerTimes: () => ({ imsak: 0, subuh: 270, terbit: 0, dhuha: 0, dzuhur: 700, ashar: 900, maghrib: 1060, isya: 1140 }) }), "2026-10-26", "2026-10-26", opt);
    expect(ev.map((e) => e.title)).toEqual(["Subuh", "Dzuhur", "Ashar", "Maghrib", "Isya"]);
    expect(ev[0]).toMatchObject({ start: 270, end: 270 });
  });
});

describe("tata letak", () => {
  it("onDate: sepanjang hari dulu, lalu urut jam", () => {
    const ev = eventsInRange(data({ blocks: [block("late", { start: 900, end: 960 }), block("early", { start: 480, end: 540 })], tasks: [task("t", { due: "2026-10-26" })] }), "2026-10-26", "2026-10-26", opt);
    expect(onDate(ev, "2026-10-26").map((e) => e.key)).toEqual(["t:t", "b:early", "b:late"]);
  });

  it("weekLanes: batang panjang tidak bertumpuk dan bersambung", () => {
    const week = viewRange("minggu", "2026-10-28").days;
    expect(week[0]).toBe("2026-10-26");
    const external = [{ id: "c", name: "C", color: "ungu" as const, events: [{ uid: "long", title: "Konferensi", date: "2026-10-20", endDate: "2026-10-28", allDay: true }] }];
    const ev = eventsInRange(data({ external, tasks: [task("x", { due: "2026-10-27" }), task("y", { due: "2026-10-30" })] }), week[0], week[6], opt);
    const lanes = weekLanes(ev, week);
    const long = lanes.find((l) => l.event.title === "Konferensi")!;
    expect(long).toMatchObject({ from: 0, to: 2, row: 0, contL: true, contR: false });
    expect(lanes.find((l) => l.event.key === "t:x")!.row).toBe(1);
    expect(lanes.find((l) => l.event.key === "t:y")!.row).toBe(0);
  });
});

describe("navigasi", () => {
  it("rentang bulan mulai Senin, 6 minggu", () => {
    const r = viewRange("bulan", "2026-10-15");
    expect(r.days).toHaveLength(42);
    expect(r.from).toBe("2026-09-28");
  });
  it("geser tampilan", () => {
    expect(shiftAnchor("bulan", "2026-01-31", 1)).toBe("2026-02-01");
    expect(shiftAnchor("minggu", "2026-10-26", -1)).toBe("2026-10-19");
    expect(shiftAnchor("tahun", "2026-10-26", 1)).toBe("2027-10-01");
  });
  it("judul", () => {
    expect(viewTitle("bulan", "2026-10-26")).toBe("Oktober 2026");
    expect(viewTitle("minggu", "2026-10-28")).toMatch(/26 Okt.*1 Nov.*2026/);
  });
});

describe("menggeser", () => {
  it("blok menjaga durasi dan tetap di dalam hari", async () => {
    const { moveBlock } = await import("./calendar");
    expect(moveBlock({ date: "2026-10-26", start: 540, end: 600 }, "2026-10-28", 1420)).toEqual({ date: "2026-10-28", start: 1380, end: 1440 });
    expect(moveBlock({ date: "2026-10-26", start: 540, end: 600 }, "2026-10-28")).toEqual({ date: "2026-10-28", start: 540, end: 600 });
  });
  it("tugas rentang ikut bergeser; jadi berjam / sepanjang hari", async () => {
    const { moveTask } = await import("./calendar");
    expect(moveTask({ start: "2026-10-20", due: "2026-10-28" }, "2026-10-20", "2026-10-22")).toEqual({ start: "2026-10-22", due: "2026-10-30", dueTime: undefined });
    expect(moveTask({ due: "2026-10-28" }, "2026-10-28", "2026-10-29", 600)).toEqual({ start: undefined, due: "2026-10-29", dueTime: 600 });
    expect(moveTask({ due: "2026-10-28", dueTime: 600 }, "2026-10-28", "2026-10-28", null)).toEqual({ start: undefined, due: "2026-10-28", dueTime: undefined });
  });
  it("pengingat pindah hari dengan jam yang sama", async () => {
    const { moveReminder } = await import("./calendar");
    const at = new Date(2026, 9, 26, 14, 30).getTime();
    expect(moveReminder(at, "2026-10-29")).toBe(new Date(2026, 9, 29, 14, 30).getTime());
    expect(moveReminder(at, "2026-10-29", 480)).toBe(new Date(2026, 9, 29, 8, 0).getTime());
  });
});
