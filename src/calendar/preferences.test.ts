import { expect, it } from "vitest";
import { calendarSize, CALENDAR_SIZE } from "./preferences";
it("bounds synced calendar dimensions so a corrupt preference cannot break the layout", () => {
  expect(calendarSize({ height: NaN, hourHeight: Infinity })).toEqual(CALENDAR_SIZE);
  expect(calendarSize({ height: -1, monthHeight: 999, hourHeight: 120 })).toEqual({ height: 400, monthHeight: 220, hourHeight: 100 });
});
