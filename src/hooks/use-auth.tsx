import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "admin" | "representante" | "ventas" | "almacen" | "logistica" | "contabilidad" | "viewer";

function applyRolePayload(
  data: unknown,
  setRole: (role: AppRole | null) => void,
  setApproved: (approved: boolean) => void,
) {
  if (!data) return false;
  if (typeof data === "string") {
    setRole(data as AppRole);
    setApproved(true);
    return true;
  }
  if (typeof data === "object" && "role" in data) {
    const obj = data as { role?: AppRole; approved?: boolean | null };
    setRole(obj.role ?? null);
    setApproved(obj.approved ?? false);
    return true;
  }
  return false;
}

interface AuthState {
  session: Session | null;
  user: User | null;
  role: AppRole | null;
  approved: boolean;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  retryRole: () => Promise<void>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [approved, setApproved] = useState(false);
  const [loading, setLoading] = useState(true);

  // Single source of truth: onAuthStateChange
  useEffect(() => {
    // Safety net
    const timeout = setTimeout(() => setLoading(false), 5000);

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, s) => {
        // Token refreshes happen periodically (and on tab focus). The user
        // is the same, only the JWT timestamps change. Don't propagate a new
        // session reference downstream — that would re-fire every effect
        // depending on `session` (e.g. usePermissions), which used to flash
        // the loading spinner and unmount the page tree on every tab return.
        if (event === "TOKEN_REFRESHED") {
          setSession((prev) => {
            if (prev && s && prev.user.id === s.user.id) {
              return prev; // keep the same reference
            }
            return s;
          });
          return;
        }

        // Update session synchronously first
        setSession(s);

        if (s) {
          // Defer role fetch to avoid Supabase lock contention
          setTimeout(async () => {
            try {
              const { data, error } = await supabase.rpc("get_my_role");
              if (!error && data) {
                if (applyRolePayload(data, setRole, setApproved)) {
                  setLoading(false);
                  clearTimeout(timeout);
                  return;
                }
              }
              // Fallback: direct query
              const { data: row } = await supabase
                .from("user_roles")
                .select("role, approved")
                .eq("user_id", s.user.id)
                .single();
              if (row) {
                setRole(row.role as AppRole);
                setApproved(row.approved ?? false);
              }
            } catch (err) {
              console.error("[auth] role fetch error:", err);
            }
            setLoading(false);
            clearTimeout(timeout);
          }, 0);

          // Clean URL hash after OAuth
          if (window.location.hash.includes("access_token")) {
            window.history.replaceState(null, "", window.location.pathname || "/");
          }
        } else if (event === "SIGNED_OUT") {
          setRole(null);
          setApproved(false);
          setLoading(false);
          clearTimeout(timeout);
        }
        // Ignore null session from failed token refresh (keep existing state)
      }
    );

    return () => {
      clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, []);

  const signInWithGoogle = async () => {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: window.location.origin,
        queryParams: { prompt: "select_account" },
      },
    });
  };

  const signOut = async () => {
    try { await supabase.auth.signOut(); } catch {}
    // Clear localStorage as backup
    try {
      Object.keys(localStorage)
        .filter((k) => k.startsWith("sb-"))
        .forEach((k) => localStorage.removeItem(k));
    } catch {}
    window.location.href = "/login";
  };

  const retryRole = async () => {
    setLoading(true);
    try {
      // Refresh token first
      const { data: { session: s } } = await supabase.auth.refreshSession();
      if (s) {
        setSession(s);
        const { data } = await supabase.rpc("get_my_role");
        if (data) applyRolePayload(data, setRole, setApproved);
      }
    } catch (err) {
      console.error("[auth] retry error:", err);
    }
    setLoading(false);
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        role,
        approved,
        loading,
        signInWithGoogle,
        signOut,
        retryRole,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    // Fallback when AuthProvider is not mounted (dev/admin standalone)
    return {
      session: null,
      user: null,
      role: "admin" as AppRole,
      approved: true,
      loading: false,
      signInWithGoogle: async () => {},
      signOut: async () => {},
      retryRole: async () => {},
    };
  }
  return ctx;
}
