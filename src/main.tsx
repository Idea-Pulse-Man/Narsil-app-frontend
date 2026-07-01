import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Capacitor } from "@capacitor/core";
import { StatusBar, Style } from "@capacitor/status-bar";
import { feedArtworks } from "@/data";
import "./index.css";
import App from "./App.tsx";

async function initNativeShell() {
  if (!Capacitor.isNativePlatform()) return;

  try {
    await StatusBar.setStyle({ style: Style.Dark });
    await StatusBar.setBackgroundColor({ color: "#0a0a0b" });
  } catch {
    /* status bar plugin unavailable in browser */
  }
}

const preload = document.createElement("link");
preload.rel = "preload";
preload.as = "image";
preload.href = feedArtworks[0].image;
document.head.appendChild(preload);

void initNativeShell();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
