import { describe, expect, it } from "vitest";
import { isNewShortcut } from "./shortcuts";

const k = (key: string, mods: Partial<{ ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean }> = {}) => ({ key, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...mods });
describe("Ctrl+N", () => {
  it("hanya Ctrl/Cmd+N tanpa Shift/Alt", () => {
    expect(isNewShortcut(k("n", { ctrlKey: true }))).toBe(true);
    expect(isNewShortcut(k("N", { metaKey: true }))).toBe(true);
    expect(isNewShortcut(k("n"))).toBe(false);
    // Ctrl+Shift+N dipakai File untuk folder baru.
    expect(isNewShortcut(k("N", { ctrlKey: true, shiftKey: true }))).toBe(false);
    expect(isNewShortcut(k("n", { ctrlKey: true, altKey: true }))).toBe(false);
  });
});
