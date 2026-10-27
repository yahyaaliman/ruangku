// Klien REST PocketBase untuk server tim Ruangku.
import { api, httpJson } from "../lib/api";
import { loadSecure, saveSecure } from "../lib/secrets";
import { useEffect, useState } from "react";
import { onEvent } from "../lib/api";

export interface TeamConfig {
  serverUrl: string;
  token: string;
  tokenAt: number;
  userId: string;
  email: string;
  name: string;
  lastSync?: number;
  lastError?: string;
  /** Perangkat ini menjalankan bot (Telegram/WA/email) dan antrean penugasan. */
  botHost?: boolean;
}

const KEY = "team_config";
const SECRET_PATHS = ["token"];
export async function loadTeam(): Promise<TeamConfig | null> {
  try {
    const v = await api.getSetting(KEY);
    const c = v ? (JSON.parse(v) as TeamConfig) : null;
    return c && c.serverUrl ? await loadSecure(KEY, c, SECRET_PATHS) : null;
  } catch {
    return null;
  }
}
export async function saveTeam(c: TeamConfig | null) {
  if (c) await saveSecure(KEY, c, SECRET_PATHS);
  else {
    await api.secretSet(`${KEY}.token`, "");
    await api.setSetting(KEY, "");
  }
}

export function useTeam() {
  const [team, setTeam] = useState<TeamConfig | null>(null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    const load = () => loadTeam().then((t) => (setTeam(t), setLoaded(true)));
    load();
    const a = onEvent<string>("setting-changed", (k) => k === KEY && load());
    const b = onEvent("team-sync", load);
    return () => (a(), b());
  }, []);
  return { team, loaded };
}

const base = (u: string) => u.trim().replace(/\/+$/, "");

export interface PbList<T> {
  page: number;
  perPage: number;
  totalItems: number;
  totalPages: number;
  items: T[];
}
export interface PbUser {
  id: string;
  email: string;
  name?: string;
}

/** Klien kecil di atas REST API PocketBase. */
export class Pb {
  constructor(public url: string, public token = "") {}
  private h(): Record<string, string> {
    return this.token ? { authorization: this.token } : {};
  }
  req<T>(method: string, path: string, body?: unknown): Promise<T> {
    return httpJson<T>(method, `${base(this.url)}${path}`, body, this.h(), 30_000);
  }
  async health(): Promise<boolean> {
    try {
      await this.req("GET", "/api/health");
      return true;
    } catch {
      return false;
    }
  }
  async login(email: string, password: string): Promise<{ token: string; record: PbUser }> {
    const r = await this.req<{ token: string; record: PbUser }>("POST", "/api/collections/users/auth-with-password", { identity: email, password });
    this.token = r.token;
    return r;
  }
  async register(email: string, password: string, name: string): Promise<{ token: string; record: PbUser }> {
    await this.req("POST", "/api/collections/users/records", { email, password, passwordConfirm: password, name });
    return this.login(email, password);
  }
  async refresh(): Promise<{ token: string; record: PbUser }> {
    const r = await this.req<{ token: string; record: PbUser }>("POST", "/api/collections/users/auth-refresh");
    this.token = r.token;
    return r;
  }
  list<T>(collection: string, q: { filter?: string; sort?: string; page?: number; perPage?: number; fields?: string } = {}): Promise<PbList<T>> {
    const p = new URLSearchParams();
    if (q.filter) p.set("filter", q.filter);
    if (q.sort) p.set("sort", q.sort);
    if (q.fields) p.set("fields", q.fields);
    p.set("page", String(q.page ?? 1));
    p.set("perPage", String(q.perPage ?? 200));
    p.set("skipTotal", "1");
    return this.req("GET", `/api/collections/${collection}/records?${p.toString()}`);
  }
  async all<T>(collection: string, q: { filter?: string; sort?: string; fields?: string } = {}): Promise<T[]> {
    const out: T[] = [];
    for (let page = 1; page < 200; page++) {
      const r = await this.list<T>(collection, { ...q, page, perPage: 200 });
      out.push(...r.items);
      if (r.items.length < 200) break;
    }
    return out;
  }
  create<T>(collection: string, body: unknown): Promise<T> {
    return this.req("POST", `/api/collections/${collection}/records`, body);
  }
  update<T>(collection: string, id: string, body: unknown): Promise<T> {
    return this.req("PATCH", `/api/collections/${collection}/records/${id}`, body);
  }
  remove(collection: string, id: string): Promise<unknown> {
    return this.req("DELETE", `/api/collections/${collection}/records/${id}`);
  }
}

/** Kutip nilai untuk filter PocketBase. */
export const q = (s: string) => `'${s.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
