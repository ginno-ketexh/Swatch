import { createContext, useContext, type ReactNode } from "react";

const ImagesEnabledContext = createContext(false);

export function ImagesEnabledProvider({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  return <ImagesEnabledContext.Provider value={enabled}>{children}</ImagesEnabledContext.Provider>;
}

export function useImagesEnabled(): boolean {
  return useContext(ImagesEnabledContext);
}
