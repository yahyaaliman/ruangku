// Memindahkan halaman (beserta subhalamannya) ke Sampah, dengan tombol Batalkan.
import { useCallback } from "react";
import { useRecords } from "../lib/useRecords";
import { makeTrash, TRASH_KIND } from "../lib/trash";
import type { Item, Note } from "../lib/types";
import { api } from "../lib/api";
import { useToast } from "../components/ui";

export function effectiveProject(notes: Item<Note>[], n: Item<Note>): string | undefined {
  let cur: Item<Note> | undefined = n;
  const seen = new Set<string>();
  while (cur && !seen.has(cur.id)) {
    if (cur.projectId) return cur.projectId;
    seen.add(cur.id);
    cur = cur.parentId ? notes.find((x) => x.id === cur!.parentId) : undefined;
  }
  return undefined;
}

export function useTrashNote() {
  const notes = useRecords<Note>("note");
  const trash = useRecords<unknown>(TRASH_KIND);
  const toast = useToast();
  return useCallback(
    async (n: Item<Note>) => {
      const entry = makeTrash(notes.items, n.id, Date.now(), effectiveProject(notes.items, n));
      if (!entry) return;
      const tid = `trash-${n.id}`;
      await trash.save(entry, tid);
      for (const it of [...entry.items].reverse()) {
        if (notes.items.find((x) => x.id === it.id)?.sticky) await api.stickyClose(it.id).catch(() => {});
        await notes.remove(it.id);
      }
      toast(`"${entry.title}" dipindahkan ke Sampah${entry.items.length > 1 ? ` beserta ${entry.items.length - 1} subhalaman` : ""}`, "info", {
        label: "Batalkan",
        run: async () => {
          for (const it of entry.items) await notes.save(it.data, it.id);
          await trash.remove(tid);
        },
      });
    },
    [notes, trash, toast],
  );
}
