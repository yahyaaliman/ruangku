import { createContext, ReactNode, useContext } from "react";
import { useRecords } from "./useRecords";
import type { Item } from "./types";
import type { Member } from "./team";

const Ctx = createContext<Item<Member>[]>([]);

/** Satu langganan daftar anggota untuk seluruh jendela (dipakai avatar di daftar tugas). */
export function MembersProvider({ children }: { children: ReactNode }) {
  const m = useRecords<Member>("member");
  return <Ctx.Provider value={m.items}>{children}</Ctx.Provider>;
}

export const useMembers = () => useContext(Ctx);
