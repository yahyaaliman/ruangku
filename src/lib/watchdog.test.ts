import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { _resetWatchdog, isStalled, onStall, STALL_MS, track } from "./watchdog";

describe("pengawas respons backend", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    _resetWatchdog();
  });
  afterEach(() => {
    _resetWatchdog();
    vi.useRealTimers();
  });

  it("menandai macet bila perintah cepat tertahan, lalu pulih saat selesai", async () => {
    const seen: boolean[] = [];
    onStall((s) => seen.push(s));
    let resolve!: (v: number) => void;
    const p = track("records_list", new Promise<number>((r) => (resolve = r)));
    vi.advanceTimersByTime(STALL_MS - 1000);
    expect(isStalled()).toBe(false);
    vi.advanceTimersByTime(2000);
    expect(isStalled()).toBe(true);
    resolve(1);
    await expect(p).resolves.toBe(1);
    expect(isStalled()).toBe(false);
    expect(seen).toEqual([true, false]);
  });

  it("mengabaikan perintah yang memang lama", () => {
    track("sync_now", new Promise(() => {}));
    vi.advanceTimersByTime(STALL_MS * 3);
    expect(isStalled()).toBe(false);
  });

  it("galat tetap diteruskan dan tidak meninggalkan status macet", async () => {
    const p = track("setting_get", Promise.reject(new Error("x")));
    await expect(p).rejects.toThrow("x");
    vi.advanceTimersByTime(STALL_MS * 2);
    expect(isStalled()).toBe(false);
  });
});
