// Penahan galat tampilan: bila satu halaman atau jendela gagal digambar, yang tampil adalah
// pesan dengan tombol pemulihan, bukan layar kosong. Galatnya dicatat ke log aplikasi.
import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { api } from "../lib/api";

interface Props {
  /** Nama area untuk log, mis. "halaman tasks" atau "widget". */
  where: string;
  children: ReactNode;
  /** Tampilan ringkas untuk jendela kecil (widget, sticky note). */
  compact?: boolean;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    const stack = (info.componentStack ?? "").trim().split("\n").slice(0, 4).join(" | ");
    void api.log("ERROR", `[${this.props.where}] Tampilan gagal: ${error.message}${stack ? ` · ${stack}` : ""}`);
  }

  private reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    if (this.props.compact) {
      return (
        <div className="err-box err-compact" role="alert">
          <AlertTriangle size={16} aria-hidden="true" />
          <span>Bagian ini gagal tampil.</span>
          <button className="btn btn-sm" onClick={this.reset}>
            <RotateCcw size={13} /> Coba lagi
          </button>
        </div>
      );
    }
    return (
      <div className="page">
        <div className="err-box" role="alert">
          <AlertTriangle size={20} aria-hidden="true" />
          <div>
            <h2>Halaman ini gagal ditampilkan</h2>
            <p>Data Anda aman. Coba tampilkan lagi; bila masalahnya berulang, laporkan isi pesan di bawah bersama log dari Pengaturan → Data & keamanan → Log & diagnostik.</p>
            <code className="err-msg">{error.message}</code>
            <div className="btn-row">
              <button className="btn btn-primary" onClick={this.reset}>
                <RotateCcw size={15} /> Coba lagi
              </button>
              <button className="btn" onClick={() => window.location.reload()}>
                Muat ulang aplikasi
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }
}
