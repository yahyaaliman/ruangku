import { describe, expect, it } from "vitest";
import { compareVersions, DEFAULT_UPDATE_REPO, updateRepo, validRepo } from "./update";

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

describe("sumber rilis bawaan", () => {
  it("belum diatur → repo resmi; dikosongkan → cek dimatikan; diisi → dipakai", () => {
    expect(updateRepo(null)).toBe(DEFAULT_UPDATE_REPO);
    expect(validRepo(updateRepo(null))).toBe(true);
    expect(updateRepo("")).toBe("");
    expect(validRepo(updateRepo(""))).toBe(false);
    expect(updateRepo("orang/garpu")).toBe("orang/garpu");
  });
});
