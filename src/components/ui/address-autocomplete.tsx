// AddressAutocomplete — Google Places autocomplete via Valinor proxy.
// Free-text input with a dropdown of suggestions. On select it fetches
// Place Details and emits the formatted address + lat/lng + postal code.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Loader2, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  googlePlacesAutocompleteFn,
  googlePlaceDetailsFn,
} from "@/lib/valinor.functions";

export type ResolvedAddress = {
  address: string;
  lat: number | null;
  lng: number | null;
  codigo_postal: string | null;
  place_id: string | null;
};

type Suggestion = {
  description: string;
  place_id: string;
  main?: string;
  secondary?: string;
};

function newSessionToken() {
  // Simple unique id — Google charges autocomplete sessions cheaper when
  // a single sessiontoken is reused across keystrokes + details lookup.
  return (
    Math.random().toString(36).slice(2) + Date.now().toString(36)
  );
}

function extractPostal(
  components?: Array<{ long_name: string; types: string[] }>,
): string | null {
  const c = components?.find((x) => x.types?.includes("postal_code"));
  return c?.long_name ?? null;
}

export function AddressAutocomplete({
  value,
  onChange,
  onSelect,
  placeholder = "Calle, Colonia, Ciudad",
  country = "mx",
  className,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  onSelect: (r: ResolvedAddress) => void;
  placeholder?: string;
  country?: string;
  className?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [activeIdx, setActiveIdx] = useState(-1);
  const [session, setSession] = useState<string>(() => newSessionToken());
  const wrapRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Close on outside click.
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  // Debounced fetch.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = value.trim();
    if (q.length < 3) {
      setSuggestions([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const resp = await googlePlacesAutocompleteFn({
          data: { query: q, sessiontoken: session, country, language: "es" },
        });
        const preds = (resp as { predictions?: Suggestion[] })?.predictions ?? [];
        setSuggestions(
          preds.map((p: any) => ({
            description: p.description,
            place_id: p.place_id,
            main: p.structured_formatting?.main_text,
            secondary: p.structured_formatting?.secondary_text,
          })),
        );
        setOpen(true);
        setActiveIdx(-1);
      } catch (e) {
        // Silent — autocomplete is best-effort.
        console.warn("autocomplete failed", e);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [value, session, country]);

  const pickSuggestion = async (s: Suggestion) => {
    setOpen(false);
    try {
      const resp = await googlePlaceDetailsFn({
        data: { place_id: s.place_id, sessiontoken: session, language: "es" },
      });
      const r = (resp as any)?.result;
      const formatted = r?.formatted_address ?? s.description;
      const loc = r?.geometry?.location;
      onChange(formatted);
      onSelect({
        address: formatted,
        lat: typeof loc?.lat === "number" ? loc.lat : null,
        lng: typeof loc?.lng === "number" ? loc.lng : null,
        codigo_postal: extractPostal(r?.address_components),
        place_id: r?.place_id ?? s.place_id,
      });
    } catch (e) {
      // Fallback — still emit description as the address.
      onChange(s.description);
      onSelect({
        address: s.description,
        lat: null,
        lng: null,
        codigo_postal: null,
        place_id: s.place_id,
      });
    } finally {
      // Renew the session for the next lookup.
      setSession(newSessionToken());
    }
  };

  const hint = useMemo(
    () => (loading ? "Buscando…" : value.length < 3 ? "Escribe al menos 3 caracteres" : null),
    [loading, value.length],
  );

  return (
    <div ref={wrapRef} className={cn("relative", className)}>
      <Input
        value={value}
        disabled={disabled}
        onChange={(e) => {
          onChange(e.target.value);
          if (!open) setOpen(true);
        }}
        onFocus={() => {
          if (suggestions.length > 0) setOpen(true);
        }}
        onKeyDown={(e) => {
          if (!open || suggestions.length === 0) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActiveIdx((i) => Math.min(i + 1, suggestions.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActiveIdx((i) => Math.max(i - 1, 0));
          } else if (e.key === "Enter" && activeIdx >= 0) {
            e.preventDefault();
            pickSuggestion(suggestions[activeIdx]);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        placeholder={placeholder}
        autoComplete="off"
      />
      {loading && (
        <Loader2 className="absolute right-2 top-2.5 h-4 w-4 animate-spin text-muted-foreground" />
      )}
      {open && suggestions.length > 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md max-h-72 overflow-auto">
          {suggestions.map((s, i) => (
            <button
              key={s.place_id}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pickSuggestion(s)}
              className={cn(
                "flex w-full items-start gap-2 px-3 py-2 text-left text-sm hover:bg-accent",
                i === activeIdx && "bg-accent",
              )}
            >
              <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <div className="truncate font-medium">{s.main ?? s.description}</div>
                {s.secondary && (
                  <div className="truncate text-xs text-muted-foreground">{s.secondary}</div>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
      {open && suggestions.length === 0 && hint && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover px-3 py-2 text-xs text-muted-foreground shadow-md">
          {hint}
        </div>
      )}
    </div>
  );
}

export default AddressAutocomplete;
