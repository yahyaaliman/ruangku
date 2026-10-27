import { createContext, ReactNode, useContext } from "react";
import { ChevronDown } from "lucide-react";
import type { WidgetSection } from "../lib/types";

export const CollapseCtx = createContext<{ collapsed: WidgetSection[]; toggle: (id: WidgetSection) => void }>({ collapsed: [], toggle: () => {} });

/** Judul bagian widget yang bisa diklik untuk menciutkan/membuka bagian itu. */
export function SecTitle({ id, children, extra }: { id: WidgetSection; children: ReactNode; extra?: ReactNode }) {
  const c = useContext(CollapseCtx);
  const closed = c.collapsed.includes(id);
  return (
    <h2 className="w-sec-title">
      <button className="w-sec-btn" aria-expanded={!closed} onClick={() => c.toggle(id)} title={closed ? "Tampilkan" : "Ciutkan"}>
        <ChevronDown size={13} className={`w-sec-chev ${closed ? "closed" : ""}`} aria-hidden="true" />
        {children}
      </button>
      {extra !== undefined && extra !== "" && <span>{extra}</span>}
    </h2>
  );
}
