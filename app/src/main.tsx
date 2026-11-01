import { createRoot } from "react-dom/client";
import "./index.css";
import PianoApp from "./PianoApp";

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js").catch(() => {
      // The instrument still works when offline installation is unavailable.
    });
  });
}

createRoot(document.getElementById("root")!).render(<PianoApp />);
