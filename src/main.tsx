import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Capacitor } from "@capacitor/core";
import { StatusBar, Style } from "@capacitor/status-bar";
import "./index.css";
import App from "./App.tsx";
import { startTelemetry } from "./lib/telemetry";
import { followSystemTextSize } from "./lib/textSize";

async function initNativeShell() {
  if (!Capacitor.isNativePlatform()) return;

  try {
    await StatusBar.setStyle({ style: Style.Dark });
    await StatusBar.setBackgroundColor({ color: "#14100e" });
  } catch {
    /* status bar plugin unavailable in browser */
  }
}

void initNativeShell();
startTelemetry();
followSystemTextSize();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
