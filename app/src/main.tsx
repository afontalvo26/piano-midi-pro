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
import { PlayerProvider } from "./music/PlayerContext";
import { initLibraryStore } from "./music/libraryStore";

// Hydrate the player's catalogue/playlists/likes before the first paint so the
// library does not flash an empty state. localStorage-only and synchronous.
initLibraryStore();

// Register service worker for offline support — non-blocking, only in production
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* SW registration is optional — silently ignore failures (private mode, etc.) */
    });
  });
}

// NOTE: schedulePianoPrefetch() used to run here to warm the Salamander samples
// for the AudioProvider engine. That engine is currently unreachable — nothing
// consumes `useAudioContext()`, so `useAudioEngine().initializeAudio` is never
// called and its Tone.Sampler is never built. The prefetch was therefore
// downloading ~6.6 MB across 30 requests on every cold start for samples that
// no code path plays (App.tsx renders piano through VelocityPiano, which
// streams @audio-samples from jsDelivr instead).
//
// Re-add the call below if/when the AudioProvider engine is wired up again:
//   import { schedulePianoPrefetch } from "./utils/prefetch";
//   schedulePianoPrefetch();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <SettingsProvider>
      <AudioProvider>
        <ProfileProvider>
          <ScoreProvider>
            <PlayerProvider>
              <App />
            </PlayerProvider>
          </ScoreProvider>
        </ProfileProvider>
      </AudioProvider>
    </SettingsProvider>
  </StrictMode>,
);
