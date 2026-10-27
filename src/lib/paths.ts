/** Utilitas path yang bekerja untuk path Windows (C:\a\b) maupun Unix (/a/b). */

export function sepOf(p: string): string {
  return p.includes("\\") || /^[A-Za-z]:/.test(p) ? "\\" : "/";
}

export function trimSep(p: string): string {
  if (/^[A-Za-z]:\\?$/.test(p)) return p.slice(0, 2) + "\\";
  if (p === "/") return p;
  return p.replace(/[\\/]+$/, "");
}

export function join(dir: string, name: string): string {
  const s = sepOf(dir);
  const d = trimSep(dir);
  return d.endsWith(s) ? d + name : d + s + name;
}

export function parent(p: string): string | null {
  const t = trimSep(p);
  if (/^[A-Za-z]:\\$/.test(t) || t === "/") return null;
  const s = sepOf(t);
  const i = t.lastIndexOf(s);
  if (i < 0) return null;
  const up = t.slice(0, i);
  if (/^[A-Za-z]:$/.test(up)) return up + "\\";
  return up || "/";
}

export function basename(p: string): string {
  const t = trimSep(p);
  const s = sepOf(t);
  return t.slice(t.lastIndexOf(s) + 1) || t;
}

/** Segmen breadcrumb: [{label:"C:", path:"C:\\"}, {label:"Users", path:"C:\\Users"}, ...] */
export function crumbs(p: string): { label: string; path: string }[] {
  const t = trimSep(p);
  const s = sepOf(t);
  const out: { label: string; path: string }[] = [];
  if (s === "\\") {
    const parts = t.split("\\").filter(Boolean);
    let acc = "";
    parts.forEach((part, i) => {
      acc = i === 0 ? `${part}\\` : join(acc, part);
      out.push({ label: part, path: acc });
    });
  } else {
    out.push({ label: "/", path: "/" });
    let acc = "";
    t.split("/").filter(Boolean).forEach((part) => {
      acc += `/${part}`;
      out.push({ label: part, path: acc });
    });
  }
  return out;
}

export const metaId = (path: string) => `file:${trimSep(path).toLowerCase()}`;

export function samePath(a: string, b: string) {
  return trimSep(a).toLowerCase() === trimSep(b).toLowerCase();
}

/** Apakah `child` berada di dalam folder `dir`. */
export function isInside(child: string, dir: string) {
  const c = trimSep(child).toLowerCase();
  const d = trimSep(dir).toLowerCase();
  const s = sepOf(d);
  return c.startsWith(d.endsWith(s) ? d : d + s);
}
