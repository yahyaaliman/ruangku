import { describe, expect, it } from "vitest";
import { basename, crumbs, isInside, join, parent } from "./paths";

describe("paths", () => {
  it("windows", () => {
    expect(join("C:\\", "Users")).toBe("C:\\Users");
    expect(join("C:\\Users\\", "Saya")).toBe("C:\\Users\\Saya");
    expect(parent("C:\\Users\\Saya")).toBe("C:\\Users");
    expect(parent("C:\\Users")).toBe("C:\\");
    expect(parent("C:\\")).toBe(null);
    expect(basename("C:\\Users\\Saya\\a.txt")).toBe("a.txt");
    expect(crumbs("C:\\Users\\Saya").map((c) => c.path)).toEqual(["C:\\", "C:\\Users", "C:\\Users\\Saya"]);
    expect(isInside("C:\\Users\\Saya\\x", "c:\\users")).toBe(true);
    expect(isInside("C:\\Users2", "C:\\Users")).toBe(false);
  });
  it("unix", () => {
    expect(join("/home", "a")).toBe("/home/a");
    expect(parent("/home")).toBe("/");
    expect(parent("/")).toBe(null);
    expect(crumbs("/home/a").map((c) => c.label)).toEqual(["/", "home", "a"]);
  });
});
