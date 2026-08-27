import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

const STORAGE_KEY = "imv.ai.enabled";

type AIContextValue = {
  enabled: boolean;
  setEnabled: (v: boolean) => void;
  toggle: () => void;
};

const AIContext = createContext<AIContextValue | null>(null);

export function AIProvider({
  children,
  defaultEnabled = true,
}: {
  children: ReactNode;
  defaultEnabled?: boolean;
}) {
  const [enabled, setEnabledState] = useState<boolean>(defaultEnabled);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === "false") setEnabledState(false);
    else if (raw === "true") setEnabledState(true);
  }, []);

  const setEnabled = (v: boolean) => {
    setEnabledState(v);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, String(v));
    }
  };

  return (
    <AIContext.Provider value={{ enabled, setEnabled, toggle: () => setEnabled(!enabled) }}>
      {children}
    </AIContext.Provider>
  );
}

export function useAI(): AIContextValue {
  const ctx = useContext(AIContext);
  if (!ctx) return { enabled: true, setEnabled: () => {}, toggle: () => {} };
  return ctx;
}
