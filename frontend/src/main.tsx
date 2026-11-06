import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import "./i18n";
import { loadZebra, applyZebra, loadTheme, applyTheme } from "./lib/prefs";

// Apply the saved zebra striping preference before first paint.
const z = loadZebra();
applyZebra(z.color, z.intensity);

// Apply the saved theme (mode, palette, background) before first paint — avoids
// a flash of the default light/Nordic theme before the server values reconcile.
applyTheme(loadTheme());

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
