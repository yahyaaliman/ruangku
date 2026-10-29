import { describe, expect, it } from "vitest";
import { DEFAULT_APPEARANCE, mergeAppearance, portableAppearance } from "./appearance";

describe("ukuran tampilan per perangkat", () => {
  it("bagian yang disinkron tidak membawa zoom", () => {
    const shared = JSON.parse(portableAppearance({ ...DEFAULT_APPEARANCE, accent: "daun", zoom: 135 }));
    expect(shared.accent).toBe("daun");
    expect("zoom" in shared).toBe(false);
  });
  it("zoom perangkat ini menang atas zoom dari perangkat lain", () => {
    const fromOther = JSON.stringify({ ...DEFAULT_APPEARANCE, accent: "ungu", zoom: 150 });
    const a = mergeAppearance(fromOther, "110", 100);
    expect(a.accent).toBe("ungu");
    expect(a.zoom).toBe(110);
  });
  it("migrasi: tanpa setelan zoom khusus, pakai zoom lama lalu bawaan", () => {
    expect(mergeAppearance(JSON.stringify({ zoom: 120 }), null, 100).zoom).toBe(120);
    expect(mergeAppearance(JSON.stringify({ accent: "laut" }), null, 90).zoom).toBe(90);
    expect(mergeAppearance(null, "999", 100).zoom).toBe(150);
  });
});
