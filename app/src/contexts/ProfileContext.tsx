/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, type ReactNode } from "react";
import { useProfile, type UseProfileApi } from "../hooks/useProfile";

const ProfileContext = createContext<UseProfileApi | null>(null);

export function ProfileProvider({ children }: { children: ReactNode }) {
  const api = useProfile();
  return <ProfileContext.Provider value={api}>{children}</ProfileContext.Provider>;
}

export function useProfileContext(): UseProfileApi {
  const ctx = useContext(ProfileContext);
  if (!ctx) throw new Error("useProfileContext must be used within <ProfileProvider>");
  return ctx;
}
