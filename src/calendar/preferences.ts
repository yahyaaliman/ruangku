export const CALENDAR_SIZE = { height: 640, monthHeight: 110, hourHeight: 46 };
export function calendarSize(raw: Partial<typeof CALENDAR_SIZE>) {
  const clamp = (v: unknown, min: number, max: number, fallback: number) => typeof v === "number" && Number.isFinite(v) ? Math.max(min, Math.min(max, Math.round(v))) : fallback;
  return {
    height: clamp(raw.height, 400, 1000, 640),
    monthHeight: clamp(raw.monthHeight, 80, 220, 110),
    hourHeight: clamp(raw.hourHeight, 32, 100, 46),
  };
}
