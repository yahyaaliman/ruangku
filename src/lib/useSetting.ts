// Pengaturan JSON per perangkat (tabel settings) sebagai state React: dimuat sekali,
// ikut berubah bila jendela lain menyimpan, dan disimpan saat diubah.
import { useCallback, useEffect, useRef, useState } from "react";
import { api, onEvent } from "./api";

const cache = new Map<string, unknown>();

export function useJsonSetting<T>(key: string, fallback: T): [T, (next: T | ((cur: T) => T)) => void, boolean] {
  const [value, setValue] = useState<T>(() => (cache.has(key) ? (cache.get(key) as T) : fallback));
  const [loaded, setLoaded] = useState(cache.has(key));
  const ref = useRef(value);
  ref.current = value;
  const fb = useRef(fallback);
  useEffect(() => {
    let alive = true;
    const load = () =>
      api
        .getSetting(key)
        .then((v) => {
          if (!alive) return;
          let parsed: T = fb.current;
          try {
            parsed = v ? { ...(fb.current as object), ...JSON.parse(v) } : fb.current;
            if (Array.isArray(fb.current)) parsed = v ? (JSON.parse(v) as T) : fb.current;
          } catch {
            parsed = fb.current;
          }
          cache.set(key, parsed);
          setValue(parsed);
          setLoaded(true);
        })
        .catch(() => setLoaded(true));
    load();
    const stop = onEvent<string>("setting-changed", (k) => k === key && load());
    return () => {
      alive = false;
      stop();
    };
  }, [key]);
  const save = useCallback(
    (next: T | ((cur: T) => T)) => {
      const v = typeof next === "function" ? (next as (c: T) => T)(ref.current) : next;
      ref.current = v;
      cache.set(key, v);
      setValue(v);
      api.setSetting(key, JSON.stringify(v)).catch(() => {});
    },
    [key],
  );
  return [value, save, loaded];
}
