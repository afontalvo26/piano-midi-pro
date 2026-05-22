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
