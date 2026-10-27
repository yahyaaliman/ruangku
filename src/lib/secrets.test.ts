import { describe, expect, it } from "vitest";
import { MASK, mergeSecrets, splitSecrets } from "./secrets";

describe("rahasia", () => {
  const cfg = { provider: "anthropic", apiKey: "sk-ant-123", telegram: { token: "123:abc", enabled: true }, email: { password: "" } };
  const paths = ["apiKey", "telegram.token", "email.password", "wa.token"];

  it("memisahkan rahasia dan menyisakan penanda", () => {
    const { masked, secrets } = splitSecrets(cfg, paths);
    expect(masked).toEqual({ provider: "anthropic", apiKey: MASK, telegram: { token: MASK, enabled: true }, email: { password: "" } });
    expect(secrets).toEqual({ apiKey: "sk-ant-123", "telegram.token": "123:abc", "email.password": "" });
    expect(cfg.apiKey).toBe("sk-ant-123"); // asli tidak diubah
  });

  it("penanda yang belum diubah tidak menimpa rahasia tersimpan", () => {
    const { secrets } = splitSecrets({ apiKey: MASK }, ["apiKey"]);
    expect(secrets).toEqual({});
  });

  it("mengisi kembali dan mengenali nilai lama", async () => {
    const store: Record<string, string> = { apiKey: "sk-ant-123" };
    const { value, legacy } = await mergeSecrets({ apiKey: MASK, telegram: { token: "lama-teks-biasa" } }, paths, async (p) => store[p] ?? null);
    expect(value).toEqual({ apiKey: "sk-ant-123", telegram: { token: "lama-teks-biasa" } });
    expect(legacy).toEqual({ "telegram.token": "lama-teks-biasa" });
  });
});
