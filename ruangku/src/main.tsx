import React from "react";
import ReactDOM from "react-dom/client";
import "@fontsource-variable/plus-jakarta-sans";
import "./styles.css";
import "./widget/widget.css";
import "./tasks/tasks.css";
import "./projects/projects.css";
import "./charts/charts.css";
import "./ai/assistant.css";
import "./appearance.css";
import { lazy, Suspense } from "react";
import { api, isBreak, isCapture, isDesktop, isWidget, stickyId } from "./lib/api";
import { followTheme } from "./lib/theme";
import { followAppearance } from "./lib/appearance";

// Setiap jendela (aplikasi, widget, sticky note, catat cepat, layar istirahat) hanya memuat kodenya sendiri.
const App = lazy(() => import("./App"));
const Widget = lazy(() => import("./widget/Widget"));
const Capture = lazy(() => import("./widget/Capture"));
const Sticky = lazy(() => import("./widget/Sticky"));
const BreakScreen = lazy(() => import("./breaks/BreakScreen"));

// Galat tak tertangani dicatat ke log aplikasi (Pengaturan > Log & diagnostik).
if (isDesktop) {
  const where = isWidget ? "widget" : stickyId ? "sticky" : isCapture ? "catat-cepat" : isBreak ? "istirahat" : "utama";
  window.addEventListener("error", (e) => api.log("ERROR", `[${where}] ${e.message} @ ${e.filename}:${e.lineno}`));
  window.addEventListener("unhandledrejection", (e) => api.log("ERROR", `[${where}] ${e.reason instanceof Error ? e.reason.message : String(e.reason)}`));
}

// Jendela widget memakai halaman yang sama, tetapi tampil sebagai widget transparan.
if (isWidget || isCapture || stickyId || isBreak) document.documentElement.classList.add("is-widget");
// Tema terang/gelap pilihan pengguna (widget punya pengaturan warnanya sendiri).
if (!isWidget) {
  followTheme();
  followAppearance();
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <Suspense fallback={null}>{stickyId ? <Sticky id={stickyId} /> : isBreak ? <BreakScreen /> : isCapture ? <Capture /> : isWidget ? <Widget /> : <App />}</Suspense>
  </React.StrictMode>,
);
