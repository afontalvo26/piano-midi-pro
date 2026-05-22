import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import {
  AudioProvider,
  ProfileProvider,
  ScoreProvider,
  SettingsProvider,
} from "./contexts";
import { schedulePianoPrefetch } from "./utils/prefetch";

// Register service worker for offline support — non-blocking, only in production
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* SW registration is optional — silently ignore failures (private mode, etc.) */
    });
  });
}

// Idle-prefetch piano samples so the first Play feels instant
schedulePianoPrefetch();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <SettingsProvider>
      <AudioProvider>
        <ProfileProvider>
          <ScoreProvider>
            <App />
          </ScoreProvider>
        </ProfileProvider>
      </AudioProvider>
    </SettingsProvider>
  </StrictMode>,
);
