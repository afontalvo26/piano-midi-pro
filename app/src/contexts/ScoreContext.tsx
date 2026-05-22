import { createContext, useContext, type ReactNode } from "react";
import { useScoreReader, type UseScoreReaderApi } from "../hooks/useScoreReader";

const ScoreContext = createContext<UseScoreReaderApi | null>(null);

export function ScoreProvider({ children }: { children: ReactNode }) {
  const api = useScoreReader();
  return <ScoreContext.Provider value={api}>{children}</ScoreContext.Provider>;
}

export function useScoreContext(): UseScoreReaderApi {
  const ctx = useContext(ScoreContext);
  if (!ctx) throw new Error("useScoreContext must be used within <ScoreProvider>");
  return ctx;
}
