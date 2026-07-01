import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import "./i18n";
import { loadZebra, applyZebra } from "./lib/prefs";

// Apply the saved zebra striping preference before first paint.
const z = loadZebra();
applyZebra(z.color, z.intensity);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
