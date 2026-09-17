import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { getGrant } from "./landing/gate";

// Gate de acceso: la consola solo abre para visitantes que pasaron por el
// formulario o la clave del landing. Sin concesión → de vuelta al brief.
if (!getGrant()) {
  window.location.replace("./");
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);

// Service worker: solo en producción (en dev interferiría con HMR)
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {
      /* offline no disponible: la app funciona igualmente */
    });
  });
}
