import { describe, expect, it } from "vitest";
import { can, canManageMember, findMember, initials, normalizePhone } from "./team";
import type { Member } from "./team";
import type { Item } from "./types";

describe("peran & akses", () => {
  it("matriks CRUD per peran", () => {
    expect(can("pembaca", "read")).toBe(true);
    expect(can("pembaca", "create")).toBe(false);
    expect(can("kontributor", "create")).toBe(true);
    expect(can("kontributor", "update")).toBe(false);
    expect(can("kontributor", "update", { assigned: true })).toBe(true);
    expect(can("kontributor", "delete", { assigned: true })).toBe(false);
    expect(can("kontributor", "delete", { own: true })).toBe(true);
    expect(can("editor", "delete")).toBe(true);
    expect(can("editor", "manage")).toBe(false);
    expect(can("admin", "manage")).toBe(true);
    expect(can(undefined, "read")).toBe(false);
  });

  it("admin tidak bisa mengubah pemilik", () => {
    expect(canManageMember("admin", "editor", "kontributor")).toBe(true);
    expect(canManageMember("admin", "pemilik")).toBe(false);
    expect(canManageMember("admin", "editor", "pemilik")).toBe(false);
    expect(canManageMember("pemilik", "pemilik", "admin")).toBe(true);
    expect(canManageMember("editor", "pembaca")).toBe(false);
  });

  it("nomor WA dinormalkan", () => {
    expect(normalizePhone("0812-3456-7890")).toBe("6281234567890");
    expect(normalizePhone("+62 812 3456 7890")).toBe("6281234567890");
    expect(normalizePhone("81234567890")).toBe("6281234567890");
    expect(normalizePhone("6281234567890")).toBe("6281234567890");
  });

  it("mengenali pengirim dari kanal", () => {
    const ms: Item<Member>[] = [
      { id: "a", updatedAt: 0, name: "Rina Wulandari", email: "Rina@Contoh.id", role: "admin", wa: "0812-1111-2222", telegram: "@rinaw" },
      { id: "b", updatedAt: 0, name: "Bayu", email: "bayu@contoh.id", role: "editor", telegramChatId: 99 },
    ];
    expect(findMember(ms, { phone: "6281211112222" })?.id).toBe("a");
    expect(findMember(ms, { email: "rina@contoh.id" })?.id).toBe("a");
    expect(findMember(ms, { telegramUser: "RinaW" })?.id).toBe("a");
    expect(findMember(ms, { telegramChatId: 99 })?.id).toBe("b");
    expect(findMember(ms, { email: "x@y.z" })).toBeUndefined();
    expect(initials("Rina Wulandari")).toBe("RW");
  });
});
