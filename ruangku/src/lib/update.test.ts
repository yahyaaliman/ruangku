import { describe, expect, it } from "vitest";
import { compareVersions, validRepo } from "./update";

describe("pembaruan", () => {
  it("membandingkan versi", () => {
    expect(compareVersions("v0.3.0", "0.2.9")).toBe(1);
    expect(compareVersions("0.3.0", "0.3.0")).toBe(0);
    expect(compareVersions("0.10.0", "0.9.5")).toBe(1);
    expect(compareVersions("1.0.0-beta.1", "1.0.0")).toBe(-1);
    expect(compareVersions("0.2", "0.2.1")).toBe(-1);
  });
  it("format repo", () => {
    expect(validRepo("nama/ruangku")).toBe(true);
    expect(validRepo("https://github.com/nama/ruangku")).toBe(false);
    expect(validRepo("")).toBe(false);
  });
});
