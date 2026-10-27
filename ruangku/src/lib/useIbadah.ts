import { useCallback, useMemo } from "react";
import { strip, useRecords } from "./useRecords";
import { emptyLog, IBADAH_CONFIG_ID, IbadahConfig, IbadahLog, logId, normalizeConfig, PrayerKey, PrayerStatus } from "./ibadah";
import { timesForDate, Times } from "./prayer";

export function useIbadah() {
  const cfgs = useRecords<IbadahConfig>("ibadahconfig");
  const logs = useRecords<IbadahLog>("ibadahlog");
  const raw = cfgs.items.find((x) => x.id === IBADAH_CONFIG_ID);
  const config = useMemo(() => normalizeConfig(raw ? strip(raw) : null), [raw]);

  const saveConfig = useCallback((patch: Partial<IbadahConfig>) => cfgs.save({ ...config, ...patch }, IBADAH_CONFIG_ID), [cfgs, config]);

  const logFor = useCallback((date: string) => logs.items.find((l) => l.date === date), [logs.items]);

  const saveLog = useCallback(
    (date: string, fn: (l: IbadahLog) => IbadahLog) => {
      const cur = logFor(date);
      const base = cur ? strip(cur) : emptyLog(date);
      return logs.save(fn({ ...base, prayers: { ...base.prayers }, items: { ...base.items } }), logId(date));
    },
    [logFor, logs],
  );

  const setPrayer = (date: string, key: PrayerKey, status: PrayerStatus | undefined) =>
    saveLog(date, (l) => {
      if (status) l.prayers[key] = status;
      else delete l.prayers[key];
      return l;
    });
  const setItem = (date: string, id: string, value: number) =>
    saveLog(date, (l) => {
      if (value > 0) l.items[id] = value;
      else delete l.items[id];
      return l;
    });
  const setMuhasabah = (date: string, text: string) => saveLog(date, (l) => ({ ...l, muhasabah: text || undefined }));
  const setDayUdzur = (date: string, udzur: boolean) => saveLog(date, (l) => ({ ...l, udzur }));

  const times = useCallback(
    (date: string): Times | null => (config.setup ? timesForDate(date, { lat: config.lat, lng: config.lng, tz: config.tz, elevation: config.elevation }, config.offsets) : null),
    [config],
  );

  return {
    config,
    saveConfig,
    loading: cfgs.loading || logs.loading,
    logs: logs.items,
    logFor,
    setPrayer,
    setItem,
    setMuhasabah,
    setDayUdzur,
    times,
  };
}

/** Nama dan waktu sholat berikutnya dari `nowMin` (menit sejak 00:00). */
export function nextPrayer(t: Times, nowMin: number): { id: PrayerKey; label: string; at: number; inMin: number } | null {
  const list: [PrayerKey, string, number][] = [
    ["subuh", "Subuh", t.subuh],
    ["dzuhur", "Dzuhur", t.dzuhur],
    ["ashar", "Ashar", t.ashar],
    ["maghrib", "Maghrib", t.maghrib],
    ["isya", "Isya", t.isya],
  ];
  const n = list.find(([, , at]) => at > nowMin);
  return n ? { id: n[0], label: n[1], at: n[2], inMin: n[2] - nowMin } : null;
}

/** Sholat yang waktunya sedang berjalan. */
export function currentPrayer(t: Times, nowMin: number): PrayerKey | null {
  if (nowMin >= t.isya || nowMin < t.subuh) return "isya";
  if (nowMin >= t.maghrib) return "maghrib";
  if (nowMin >= t.ashar) return "ashar";
  if (nowMin >= t.dzuhur) return "dzuhur";
  if (nowMin < t.terbit) return "subuh";
  return null;
}
