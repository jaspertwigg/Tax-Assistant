import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter } from "react-router-dom";
import App from "./App";
import { migrateToAustralia } from "./lib/data";
import "./styles.css";

migrateToAustralia().catch(() => undefined);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>,
);

// Ask the browser not to clear this app's storage when the phone is low on space.
navigator.storage?.persist?.().catch(() => undefined);

// Cache the app itself so it opens without signal.
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => undefined));
}
