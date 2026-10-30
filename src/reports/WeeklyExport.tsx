import { useState } from "react";
import { Download } from "lucide-react";
import { api, errorText, saveBinaryFile } from "../lib/api";
import { dateKey } from "../lib/date";
import { dataOf, type Item, type KeyResult, type Kpi, type KpiEntry, type Objective } from "../lib/types";
import { useScope } from "../lib/scope";
import { Field, Modal, useToast } from "../components/ui";
import { reportExcel, reportPdf, weeklyReport, weekRange } from "./weekly";

export function WeeklyExport() {
  const [open, setOpen] = useState(false);
  const [day, setDay] = useState(dateKey());
  const [busy, setBusy] = useState(false);
  const scope = useScope(), toast = useToast();
  async function run(format: "pdf" | "xlsx") {
    setBusy(true);
    try {
      const load = async <T,>(kind: string): Promise<Item<T>[]> => (await api.list(kind)).filter(r => !r.deleted).map(r => ({ ...dataOf<T>(r.data), id: r.id, updatedAt: r.updatedAt }));
      const [o, kr, k, e] = await Promise.all([load<Objective>("objective"), load<KeyResult>("keyresult"), load<Kpi>("kpi"), load<KpiEntry>("kpientry")]);
      const report = weeklyReport(day, scope.current?.name || "Semua proyek", o.filter(v => scope.match(v.projectId)), kr, k.filter(v => scope.match(v.projectId)), e);
      const bytes = await (format === "pdf" ? reportPdf(report) : reportExcel(report));
      const saved = await saveBinaryFile("Simpan laporan mingguan", `Ruangku-mingguan-${weekRange(day).dates[0]}.${format}`, bytes, format === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", format);
      if (saved) { toast("Laporan mingguan disimpan."); setOpen(false); }
    } catch (e) { toast(errorText(e), "error"); } finally { setBusy(false); }
  }
  return <><button className="btn" onClick={() => setOpen(true)}><Download size={16} /> Laporan mingguan</button>{open && <Modal title="Ekspor OKR & KPI mingguan" onClose={() => { if (!busy) setOpen(false); }} footer={<><button className="btn" disabled={busy || !day} onClick={() => run("pdf")}>Simpan PDF</button><button className="btn btn-primary" disabled={busy || !day} onClick={() => run("xlsx")}>{busy ? "Menyiapkan…" : "Simpan Excel"}</button></>}><Field label="Pilih tanggal dalam minggu laporan" hint="Laporan mencakup Senin sampai Minggu, mengikuti lingkup proyek yang sedang dipilih."><input type="date" value={day} onChange={e => setDay(e.target.value)} max={dateKey()} /></Field><p className="field-hint">Riwayat OKR yang tidak tersedia ditandai kosong. Nilai KPI yang belum diisi tidak dianggap nol.</p></Modal>}</>;
}
