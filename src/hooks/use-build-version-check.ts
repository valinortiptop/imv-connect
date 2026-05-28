import { useEffect, useRef } from "react";

/**
 * Polls the app's index.html and reloads the page when the deployed build
 * changes. This way users keep their tabs open without needing a manual
 * hard refresh after we ship.
 *
 * Strategy: fetch `/` with cache: 'no-store', extract the hashed script
 * filenames from the HTML, and hash them into a fingerprint. When the
 * fingerprint changes vs. the one captured on first load, reload.
 */
export function useBuildVersionCheck(intervalMs = 60_000) {
  const initialFingerprint = useRef<string | null>(null);
  const reloading = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const computeFingerprint = async (): Promise<string | null> => {
      try {
        const res = await fetch(window.location.origin + "/", {
          cache: "no-store",
          headers: { "cache-control": "no-cache" },
        });
        if (!res.ok) return null;
        const html = await res.text();
        // Capture all hashed asset references (Vite emits /assets/*.[hash].js|css)
        const matches = html.match(/\/assets\/[A-Za-z0-9._-]+\.(?:js|css)/g) ?? [];
        if (matches.length === 0) return null;
        return matches.sort().join("|");
      } catch {
        return null;
      }
    };

    const check = async () => {
      if (reloading.current) return;
      const fp = await computeFingerprint();
      if (!fp) return;
      if (initialFingerprint.current === null) {
        initialFingerprint.current = fp;
        return;
      }
      if (fp !== initialFingerprint.current) {
        reloading.current = true;
        // Soft reload — bypass HTTP cache
        window.location.reload();
      }
    };

    // First check captures baseline
    void check();

    const interval = window.setInterval(check, intervalMs);
    const onFocus = () => void check();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") void check();
    });

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [intervalMs]);
}
