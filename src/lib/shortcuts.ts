// Ctrl+N = "item baru di halaman aktif". Tiap halaman memasang aksinya sendiri.
import { useEffect, useRef } from "react";

export function isNewShortcut(e: Pick<KeyboardEvent, "ctrlKey" | "metaKey" | "shiftKey" | "altKey" | "key">): boolean {
  return (e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "n";
}

export function useNewShortcut(run: () => void, enabled = true) {
  const ref = useRef(run);
  ref.current = run;
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (!isNewShortcut(e)) return;
      // Biarkan dialog yang sedang terbuka; jangan membuka form kedua di atasnya.
      if (document.querySelector("[role=dialog][aria-modal=true], .modal-backdrop")) return;
      e.preventDefault();
      ref.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled]);
}
