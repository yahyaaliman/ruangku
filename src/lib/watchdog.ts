// Pengawas respons backend. Perintah di QUICK_COMMANDS biasanya selesai dalam beberapa milidetik;
// bila salah satunya tertahan lebih dari STALL_MS, Ruangku kemungkinan macet. Antarmuka lalu
// menampilkan petunjuk pemulihan alih-alih halaman kosong tanpa penjelasan.

export const QUICK_COMMANDS = new Set([
  "records_list",
  "records_count",
  "records_changed_since",
  "record_save",
  "record_delete",
  "setting_get",
  "setting_set",
  "sync_status",
  "widget_config",
  "break_status",
  "sticky_list",
]);

export const STALL_MS = 8000;

type Listener = (stalled: boolean) => void;

const pending = new Map<number, number>();
const listeners = new Set<Listener>();
let seq = 0;
let stalled = false;
let timer: ReturnType<typeof setInterval> | null = null;

function check(now = Date.now()) {
  let oldest = Infinity;
  for (const t of pending.values()) oldest = Math.min(oldest, t);
  const next = now - oldest > STALL_MS;
  if (next !== stalled) {
    stalled = next;
    for (const l of listeners) l(stalled);
  }
  if (!pending.size && timer) {
    clearInterval(timer);
    timer = null;
  }
}

/** Catat perintah yang sedang berjalan; hasil dan galatnya diteruskan apa adanya. */
export function track<T>(cmd: string, p: Promise<T>): Promise<T> {
  if (!QUICK_COMMANDS.has(cmd)) return p;
  const id = ++seq;
  pending.set(id, Date.now());
  if (!timer) timer = setInterval(() => check(), 1000);
  const done = () => {
    pending.delete(id);
    check();
  };
  p.then(done, done);
  return p;
}

export const isStalled = () => stalled;

export function onStall(l: Listener): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** Hanya untuk uji. */
export function _resetWatchdog() {
  pending.clear();
  listeners.clear();
  stalled = false;
  if (timer) clearInterval(timer);
  timer = null;
}
