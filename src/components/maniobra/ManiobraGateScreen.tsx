// @ts-nocheck
/**
 * ManiobraGateScreen
 *
 * Daily-rotating PIN gate that sits in front of /portalmaniobra. Until
 * the visitor enters today's PIN (or is recognized via a previously-
 * stored trust token), they see this screen and nothing else.
 *
 * Behavior:
 *   - On mount, checks localStorage for a trust token and validates it
 *     via maniobra_gate_check_token. Valid token → bypass, call
 *     `onUnlock()` immediately.
 *   - Token missing / invalid → show PIN entry screen. 4 boxes, big
 *     touch targets, mobile-friendly.
 *   - "Confiar este dispositivo" checkbox + optional device label so
 *     the admin's panel knows which is which ("Tablet warehouse").
 *   - On valid PIN: if "confiar" was ticked, store the returned token
 *     in localStorage and bypass the gate from now on (indefinite —
 *     only the admin revoking the device clears it).
 *
 * Admin / embedded views don't see this — the parent (ManiobraPortal)
 * only mounts the gate for standalone visitors.
 */

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, ShieldCheck, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "maniobra_gate_token";

interface Props {
  onUnlock: () => void;
}

export function ManiobraGateScreen({ onUnlock }: Props) {
  const [digits, setDigits] = useState<string[]>(["", "", "", ""]);
  const [trustDevice, setTrustDevice] = useState(false);
  const [deviceLabel, setDeviceLabel] = useState("");
  const [checking, setChecking] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputs = useRef<Array<HTMLInputElement | null>>([]);

  // On mount: validate any stored trust token. If good → bypass.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const stored = typeof window !== "undefined"
        ? localStorage.getItem(STORAGE_KEY)
        : null;
      if (!stored) {
        if (!cancelled) {
          setChecking(false);
          // Focus first input once we know there's no token to use.
          setTimeout(() => inputs.current[0]?.focus(), 50);
        }
        return;
      }
      try {
        const { data, error } = await (supabase as any).rpc(
          "maniobra_gate_check_token",
          { p_token: stored },
        );
        if (cancelled) return;
        if (error) {
          // Network / RPC issue — fall back to the PIN flow.
          setChecking(false);
          setTimeout(() => inputs.current[0]?.focus(), 50);
          return;
        }
        if (data === true) {
          onUnlock();
        } else {
          // Token revoked or stale — drop it so we don't try again.
          localStorage.removeItem(STORAGE_KEY);
          setChecking(false);
          setTimeout(() => inputs.current[0]?.focus(), 50);
        }
      } catch {
        if (!cancelled) {
          setChecking(false);
          setTimeout(() => inputs.current[0]?.focus(), 50);
        }
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onDigit = (i: number, v: string) => {
    // Accept only single digit; auto-advance to next box; backspace
    // moves to previous box. Paste of full PIN distributes across all.
    const clean = v.replace(/\D/g, "");
    if (clean.length > 1) {
      // Paste — fill from this index forward.
      const next = [...digits];
      for (let j = 0; j < 4; j++) next[j] = clean[j] ?? "";
      setDigits(next);
      const lastFilled = Math.min(3, clean.length - 1);
      inputs.current[lastFilled]?.focus();
      // Auto-submit when 4 digits captured via paste.
      if (clean.length >= 4) setTimeout(() => trySubmit(next.join("")), 50);
      return;
    }
    const next = [...digits];
    next[i] = clean;
    setDigits(next);
    setError(null);
    if (clean && i < 3) inputs.current[i + 1]?.focus();
    // Auto-submit on the 4th digit so the worker doesn't hunt for the
    // "Entrar" button.
    if (i === 3 && clean) setTimeout(() => trySubmit(next.join("")), 50);
  };

  const onKeyDown = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !digits[i] && i > 0) {
      inputs.current[i - 1]?.focus();
    }
  };

  const trySubmit = async (pinOverride?: string) => {
    const pin = pinOverride ?? digits.join("");
    if (pin.length !== 4) {
      setError("Captura los 4 dígitos.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const { data, error } = await (supabase as any).rpc("maniobra_gate_verify", {
        p_pin:          pin,
        p_trust_device: trustDevice,
        p_device_label: trustDevice
          ? (deviceLabel.trim() || guessDeviceLabel())
          : null,
        p_user_agent:   typeof navigator !== "undefined" ? navigator.userAgent : null,
      });
      if (error) throw error;
      if (data?.trust_token) {
        try {
          localStorage.setItem(STORAGE_KEY, data.trust_token);
        } catch {
          // ignore (Safari private mode, etc.)
        }
      }
      onUnlock();
    } catch (err: any) {
      const msg = err?.message ?? "PIN inválido";
      setError(msg.includes("PIN") ? "PIN inválido. Intenta de nuevo." : msg);
      setDigits(["", "", "", ""]);
      setTimeout(() => inputs.current[0]?.focus(), 50);
    } finally {
      setSubmitting(false);
    }
  };

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <div className="mx-auto h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center">
            <ShieldCheck className="h-7 w-7 text-primary" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Acceso al portal</h1>
          <p className="text-sm text-muted-foreground">
            Captura el PIN para continuar.
          </p>
        </div>

        <div className="space-y-3">
          {/* 4-digit PIN row — big touch targets for the warehouse phones. */}
          <div className="flex gap-2 justify-center">
            {[0, 1, 2, 3].map((i) => (
              <Input
                key={i}
                ref={(el) => (inputs.current[i] = el)}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={1}
                value={digits[i]}
                onChange={(e) => onDigit(i, e.target.value)}
                onKeyDown={(e) => onKeyDown(i, e)}
                disabled={submitting}
                className={cn(
                  "h-16 w-14 text-center text-3xl font-bold font-mono tabular-nums",
                  error && "border-red-500 focus-visible:ring-red-500/30",
                )}
              />
            ))}
          </div>

          {error && (
            <div className="flex items-center justify-center gap-2 text-sm text-red-600 dark:text-red-400">
              <AlertCircle className="h-4 w-4" />
              {error}
            </div>
          )}

          {/* Trust-device toggle. Indefinite — revoked only from admin. */}
          <div className="rounded-lg border bg-card p-3 space-y-2">
            <label className="flex items-start gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={trustDevice}
                onChange={(e) => setTrustDevice(e.target.checked)}
                disabled={submitting}
                className="mt-0.5 h-4 w-4 accent-primary"
              />
              <span className="text-sm">
                <span className="font-semibold">Confiar este dispositivo</span>
                <span className="block text-xs text-muted-foreground">
                  No te pediremos el PIN otra vez en este dispositivo hasta que el admin lo revoque.
                </span>
              </span>
            </label>
            {trustDevice && (
              <div className="pl-6">
                <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  Nombre del dispositivo (opcional)
                </Label>
                <Input
                  value={deviceLabel}
                  onChange={(e) => setDeviceLabel(e.target.value)}
                  placeholder={guessDeviceLabel()}
                  disabled={submitting}
                  className="h-9 text-sm"
                />
              </div>
            )}
          </div>

          <Button
            onClick={() => trySubmit()}
            disabled={submitting || digits.join("").length !== 4}
            className="w-full h-11 gap-1.5"
          >
            {submitting ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Verificando...</>
            ) : (
              <>Entrar al portal</>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Light heuristic for default device label — just to make the admin's
 *  device list easier to skim. The user can always override. */
function guessDeviceLabel(): string {
  if (typeof navigator === "undefined") return "Dispositivo";
  const ua = navigator.userAgent;
  if (/iPhone/i.test(ua))       return "iPhone";
  if (/iPad/i.test(ua))         return "iPad";
  if (/Android.*Mobile/i.test(ua)) return "Android (teléfono)";
  if (/Android/i.test(ua))      return "Android (tablet)";
  if (/Macintosh/i.test(ua))    return "Mac";
  if (/Windows/i.test(ua))      return "Windows";
  if (/Linux/i.test(ua))        return "Linux";
  return "Dispositivo";
}
