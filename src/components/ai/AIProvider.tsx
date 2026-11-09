import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

const DEFAULT_STORAGE_KEY = "imv.ai.enabled";

type AIContextValue = {
  /** Effective state: false whenever the user is not allowed to use AI. */
  enabled: boolean;
  /** Whether this user may turn the AI on at all (set by an admin). */
  allowed: boolean;
  setEnabled: (v: boolean) => void;
  toggle: () => void;
};

const AIContext = createContext<AIContextValue | null>(null);

export function AIProvider({
  children,
  defaultEnabled = true,
  allowed = true,
  storageKey = DEFAULT_STORAGE_KEY,
}: {
  children: ReactNode;
  defaultEnabled?: boolean;
  allowed?: boolean;
  storageKey?: string;
}) {
  const [enabledState, setEnabledState] = useState<boolean>(defaultEnabled);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = window.localStorage.getItem(storageKey);
    if (raw === "false") setEnabledState(false);
    else if (raw === "true") setEnabledState(true);
  }, [storageKey]);

  const setEnabled = (v: boolean) => {
    if (!allowed) return;
    setEnabledState(v);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(storageKey, String(v));
    }
  };

  const enabled = allowed && enabledState;

  return (
    <AIContext.Provider value={{ enabled, allowed, setEnabled, toggle: () => setEnabled(!enabled) }}>
      {children}
    </AIContext.Provider>
  );
}

export function useAI(): AIContextValue {
  const ctx = useContext(AIContext);
  if (!ctx) return { enabled: true, allowed: true, setEnabled: () => {}, toggle: () => {} };
  return ctx;
}
