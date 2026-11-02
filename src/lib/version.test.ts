import { describe, expect, it } from "vitest";
import pkg from "../../package.json";
import lock from "../../package-lock.json";
import tauriConf from "../../src-tauri/tauri.conf.json";
import cargoToml from "../../src-tauri/Cargo.toml?raw";
import cargoLock from "../../src-tauri/Cargo.lock?raw";
import guideApp from "../guide/panduan.md?raw";
import guideDocs from "../../docs/panduan.md?raw";

const esc = (v: string) => v.replace(/\./g, "\\.");

describe("nomor versi", () => {
  it("sama di package.json, package-lock.json, tauri.conf.json, Cargo.toml, dan Cargo.lock", () => {
    const v = pkg.version;
    expect(__APP_VERSION__).toBe(v);
    expect(lock.version).toBe(v);
    expect(tauriConf.version).toBe(v);
    expect(cargoToml).toMatch(new RegExp(`^version = "${esc(v)}"`, "m"));
    expect(cargoLock).toMatch(new RegExp(`name = "ruangku"\\r?\\nversion = "${esc(v)}"`));
  });

  it("panduan di docs/ sama dengan panduan di aplikasi", () => {
    expect(guideDocs).toBe(guideApp);
  });
});
