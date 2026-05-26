/**
 * ManiobraSelfies — audit view for delivery-reveal selfies.
 *
 * Pulls every row from delivery_reveal_photos (joined to orders for
 * order code + client name + delivery date) and renders them as a grid
 * of cards. Each card shows: driver selfie thumbnail, order code,
 * driver name, timestamp, location pill, upload status pill.
 *
 * Click a card → full-size dialog with all metadata + the high-res
 * photo.
 *
 * Filters: ChronoBar (date range across taken_at) + status pills.
 *
 * Bucket is PRIVATE, so we batch-generate signed URLs per visible page
 * of photos. URLs are good for 1h.
 */

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@/lib/router-compat";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { GlowCard } from "@/components/ui/spotlight-card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ChronoBar } from "@/components/ChronoBar";
import {
  Camera, MapPin, Clock, AlertTriangle, CheckCircle2, Loader2,
  ArrowLeft, Smartphone, ShieldCheck, ShieldAlert, ImageOff, ExternalLink,
} from "lucide-react";
import { format } from "date-fns";
import { es as esLocale } from "date-fns/locale";
import { cn } from "@/lib/utils";

const BUCKET = "delivery-reveal-photos";

type UploadStatus = "uploaded" | "pending" | "failed" | "denied";

interface RevealRow {
  id: string;
  order_id: string;
  stop_index: number | null;
  signature_token: string;
  driver_name: string;
  photo_path: string | null;
  taken_at: string;
  uploaded_at: string | null;
  upload_status: UploadStatus;
  upload_attempts: number;
  lat: number | null;
  lng: number | null;
  location_accuracy_m: number | null;
  location_denied: boolean;
  camera_denied: boolean;
  device_id: string | null;
  user_agent: string | null;
  ip_address: string | null;
  created_at: string;
  // joined
  order_code: string | null;
  client_name: string | null;
  delivery_date: string | null;
}

const firstOfMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
};

const fmtStamp = (iso: string) => {
  try { return format(new Date(iso), "dd MMM yyyy · HH:mm", { locale: esLocale }); }
  catch { return iso; }
};

export default function ManiobraSelfies() {
  const [dateFrom, setDateFrom] = useState<string>(firstOfMonth());
  const [dateTo, setDateTo] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<"all" | UploadStatus>("all");
  const [selected, setSelected] = useState<RevealRow | null>(null);

  // Pull rows in range. We pull the whole period in one query — the
  // table is small enough that this is fine for years before we'd need
  // pagination.
  const { data: rows = [], isLoading, error } = useQuery({
    queryKey: ["reveal-selfies", dateFrom, dateTo],
    queryFn: async () => {
      let q = (supabase as any)
        .from("delivery_reveal_photos")
        .select(`
          id, order_id, stop_index, signature_token, driver_name, photo_path,
          taken_at, uploaded_at, upload_status, upload_attempts,
          lat, lng, location_accuracy_m, location_denied, camera_denied,
          device_id, user_agent, ip_address, created_at,
          orders!inner ( order_code, delivery_date, clients ( name, company ) )
        `)
        .order("taken_at", { ascending: false });

      if (dateFrom) q = q.gte("taken_at", dateFrom + "T00:00:00");
      if (dateTo)   q = q.lte("taken_at", dateTo   + "T23:59:59");

      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []).map((r: any): RevealRow => ({
        id: r.id,
        order_id: r.order_id,
        stop_index: r.stop_index,
        signature_token: r.signature_token,
        driver_name: r.driver_name,
        photo_path: r.photo_path,
        taken_at: r.taken_at,
        uploaded_at: r.uploaded_at,
        upload_status: r.upload_status,
        upload_attempts: r.upload_attempts,
        lat: r.lat,
        lng: r.lng,
        location_accuracy_m: r.location_accuracy_m,
        location_denied: r.location_denied,
        camera_denied: r.camera_denied,
        device_id: r.device_id,
        user_agent: r.user_agent,
        ip_address: r.ip_address,
        created_at: r.created_at,
        order_code: r.orders?.order_code ?? null,
        client_name: r.orders?.clients?.company ?? r.orders?.clients?.name ?? null,
        delivery_date: r.orders?.delivery_date ?? null,
      }));
    },
    staleTime: 30 * 1000,
  });

  // Apply status filter client-side (so the count badges always reflect
  // the full range, not the filtered subset).
  const filtered = useMemo(() => {
    if (statusFilter === "all") return rows;
    return rows.filter((r) => r.upload_status === statusFilter);
  }, [rows, statusFilter]);

  // Batch-sign all visible photo URLs (1h expiry).
  const photoPaths = useMemo(() =>
    filtered.map((r) => r.photo_path).filter((p): p is string => !!p),
    [filtered],
  );

  const { data: signedUrlMap = {} } = useQuery<Record<string, string>>({
    queryKey: ["reveal-signed-urls", photoPaths.join("|")],
    queryFn: async () => {
      if (photoPaths.length === 0) return {};
      const { data, error } = await supabase.storage
        .from(BUCKET)
        .createSignedUrls(photoPaths, 60 * 60);
      if (error) throw error;
      const map: Record<string, string> = {};
      for (const d of data ?? []) {
        if (d.path && d.signedUrl) map[d.path] = d.signedUrl;
      }
      return map;
    },
    enabled: photoPaths.length > 0,
    staleTime: 30 * 60 * 1000,
  });

  // Counts for the status pills.
  const counts = useMemo(() => {
    const out = { all: rows.length, uploaded: 0, pending: 0, failed: 0, denied: 0 };
    for (const r of rows) out[r.upload_status]++;
    return out;
  }, [rows]);

  // KPIs at the top.
  const kpis = useMemo(() => {
    const total = rows.length;
    const uploaded = counts.uploaded;
    const compliance = total > 0 ? Math.round((uploaded / total) * 100) : 0;
    const issues = counts.failed + counts.denied + counts.pending;
    return { total, uploaded, compliance, issues, denied: counts.denied };
  }, [rows, counts]);

  return (
    <div className="flex-1 flex flex-col gap-4 p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Button variant="ghost" size="icon" asChild className="-ml-2">
            <Link to="/maniobra"><ArrowLeft className="h-4 w-4" /></Link>
          </Button>
          <div className="min-w-0">
            <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2 truncate">
              <ShieldCheck className="h-5 w-5 text-blue-500 shrink-0" />
              Selfies de entrega
            </h1>
            <p className="text-xs text-muted-foreground">
              Quién reveló el total al cliente, cuándo y dónde.
            </p>
          </div>
        </div>
        <ChronoBar
          dateFrom={dateFrom}
          dateTo={dateTo}
          onChange={(f, t) => { setDateFrom(f); setDateTo(t); }}
          allTimeFrom=""
          compact
        />
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <GlowCard>
          <div className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <Camera className="h-3.5 w-3.5" /> Selfies totales
            </div>
            <div className="text-2xl font-bold tabular-nums">{kpis.total}</div>
            <div className="text-[10px] text-muted-foreground mt-0.5">en este rango</div>
          </div>
        </GlowCard>
        <GlowCard>
          <div className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <CheckCircle2 className="h-3.5 w-3.5" /> Cumplimiento
            </div>
            <div className={cn(
              "text-2xl font-bold tabular-nums",
              kpis.compliance >= 90 ? "text-emerald-500"
                : kpis.compliance >= 70 ? "text-amber-500"
                : "text-red-500",
            )}>
              {kpis.compliance}%
            </div>
            <div className="text-[10px] text-muted-foreground mt-0.5">subieron correctamente</div>
          </div>
        </GlowCard>
        <GlowCard>
          <div className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <ShieldAlert className="h-3.5 w-3.5" /> Cámara denegada
            </div>
            <div className={cn(
              "text-2xl font-bold tabular-nums",
              kpis.denied === 0 ? "text-emerald-500" : "text-amber-500",
            )}>
              {kpis.denied}
            </div>
            <div className="text-[10px] text-muted-foreground mt-0.5">
              {kpis.denied === 0 ? "Todos colaboraron" : "Investigar"}
            </div>
          </div>
        </GlowCard>
        <GlowCard>
          <div className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <AlertTriangle className="h-3.5 w-3.5" /> Sin subir / fallidos
            </div>
            <div className={cn(
              "text-2xl font-bold tabular-nums",
              kpis.issues === 0 ? "text-emerald-500" : "text-amber-500",
            )}>
              {counts.pending + counts.failed}
            </div>
            <div className="text-[10px] text-muted-foreground mt-0.5">
              {counts.pending} pendientes · {counts.failed} fallidos
            </div>
          </div>
        </GlowCard>
      </div>

      {/* Status filter pills */}
      <div className="inline-flex rounded-lg border bg-muted p-0.5 flex-wrap w-fit">
        <FilterPill active={statusFilter === "all"} onClick={() => setStatusFilter("all")} label="Todos" count={counts.all} />
        <FilterPill active={statusFilter === "uploaded"} onClick={() => setStatusFilter("uploaded")} label="Subidos" count={counts.uploaded} color="emerald" />
        <FilterPill active={statusFilter === "pending"} onClick={() => setStatusFilter("pending")} label="Pendientes" count={counts.pending} color="amber" />
        <FilterPill active={statusFilter === "denied"} onClick={() => setStatusFilter("denied")} label="Cámara denegada" count={counts.denied} color="amber" />
        <FilterPill active={statusFilter === "failed"} onClick={() => setStatusFilter("failed")} label="Fallidos" count={counts.failed} color="red" />
      </div>

      {/* Body */}
      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="aspect-[3/4] w-full" />)}
        </div>
      ) : error ? (
        <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-6 text-center">
          <AlertTriangle className="h-8 w-8 text-red-500 mx-auto mb-2" />
          <p className="text-sm text-red-600 dark:text-red-400">
            No se pudieron cargar las selfies: {(error as Error).message}
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center">
          <Camera className="h-10 w-10 mx-auto opacity-30 mb-2" />
          <p className="text-sm text-muted-foreground">
            {rows.length === 0
              ? "Aún no hay selfies registradas en este rango."
              : "Ningún registro coincide con el filtro."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          {filtered.map((r) => (
            <SelfieCard
              key={r.id}
              row={r}
              signedUrl={r.photo_path ? signedUrlMap[r.photo_path] : undefined}
              onClick={() => setSelected(r)}
            />
          ))}
        </div>
      )}

      {/* Detail dialog */}
      <SelfieDetailDialog
        row={selected}
        signedUrl={selected?.photo_path ? signedUrlMap[selected.photo_path] : undefined}
        onClose={() => setSelected(null)}
      />
    </div>
  );
}

/* ── Card ───────────────────────────────────────────────────────────── */

function SelfieCard({
  row, signedUrl, onClick,
}: {
  row: RevealRow;
  signedUrl: string | undefined;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="group relative aspect-[3/4] w-full rounded-lg overflow-hidden border bg-card hover:ring-2 hover:ring-blue-500/40 transition text-left"
    >
      {signedUrl ? (
        <img
          src={signedUrl}
          alt={`Selfie ${row.driver_name}`}
          className="absolute inset-0 w-full h-full object-cover"
          loading="lazy"
        />
      ) : row.camera_denied ? (
        <div className="absolute inset-0 grid place-items-center bg-amber-500/10">
          <div className="text-center p-3">
            <ShieldAlert className="h-8 w-8 text-amber-500 mx-auto mb-1" />
            <p className="text-[10px] uppercase tracking-wider text-amber-600 dark:text-amber-400">
              Sin foto
            </p>
          </div>
        </div>
      ) : (
        <div className="absolute inset-0 grid place-items-center bg-muted">
          <div className="text-center p-3">
            {row.upload_status === "pending"
              ? <Loader2 className="h-7 w-7 text-muted-foreground/60 mx-auto mb-1 animate-spin" />
              : <ImageOff className="h-7 w-7 text-muted-foreground/40 mx-auto mb-1" />
            }
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
              {row.upload_status === "pending" ? "Subiendo" : "Sin foto"}
            </p>
          </div>
        </div>
      )}

      {/* Status pill (top-right) */}
      <div className="absolute top-1.5 right-1.5">
        <StatusPill status={row.upload_status} />
      </div>

      {/* Footer band — driver + order */}
      <div className="absolute left-0 right-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent px-2.5 py-2 text-white">
        <p className="text-[10px] font-mono text-blue-300 truncate">
          {row.order_code ?? "—"}
          {row.stop_index ? ` · Parada ${row.stop_index}` : ""}
        </p>
        <p className="text-sm font-semibold truncate">{row.driver_name}</p>
        <p className="text-[10px] opacity-80">{fmtStamp(row.taken_at)}</p>
      </div>
    </button>
  );
}

/* ── Detail dialog ──────────────────────────────────────────────────── */

function SelfieDetailDialog({
  row, signedUrl, onClose,
}: {
  row: RevealRow | null;
  signedUrl: string | undefined;
  onClose: () => void;
}) {
  if (!row) return null;

  const mapsUrl = (row.lat != null && row.lng != null)
    ? `https://www.google.com/maps?q=${row.lat},${row.lng}`
    : null;

  return (
    <Dialog open={!!row} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-4xl w-[95vw] p-0 overflow-hidden">
        <DialogHeader className="px-5 pt-5 pb-3 border-b">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Camera className="h-4 w-4 text-blue-500" />
            <span className="font-mono text-blue-500">{row.order_code ?? "—"}</span>
            {row.stop_index ? <span className="text-muted-foreground">· Parada {row.stop_index}</span> : null}
          </DialogTitle>
        </DialogHeader>

        <div className="grid md:grid-cols-2 gap-0">
          {/* Photo */}
          <div className="bg-black aspect-square md:aspect-auto md:min-h-[480px] relative">
            {signedUrl ? (
              <img
                src={signedUrl}
                alt={`Selfie ${row.driver_name}`}
                className="absolute inset-0 w-full h-full object-contain"
              />
            ) : row.camera_denied ? (
              <div className="absolute inset-0 grid place-items-center text-amber-300">
                <div className="text-center">
                  <ShieldAlert className="h-12 w-12 mx-auto mb-2" />
                  <p className="text-sm font-semibold">Cámara denegada</p>
                  <p className="text-xs opacity-70 mt-1">No se capturó foto</p>
                </div>
              </div>
            ) : (
              <div className="absolute inset-0 grid place-items-center text-white/60">
                <ImageOff className="h-12 w-12" />
              </div>
            )}
          </div>

          {/* Metadata */}
          <div className="p-5 space-y-4 text-sm">
            <Field label="Repartidor / cargador">
              <p className="text-lg font-semibold">{row.driver_name}</p>
            </Field>

            <Field label="Cliente">
              <p>{row.client_name ?? "—"}</p>
            </Field>

            <Field label="Tomada">
              <p className="flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                {fmtStamp(row.taken_at)}
              </p>
              {row.delivery_date && (
                <p className="text-xs text-muted-foreground">
                  Entrega programada: {fmtStamp(row.delivery_date + "T12:00:00")}
                </p>
              )}
            </Field>

            <Field label="Ubicación">
              {row.lat != null && row.lng != null ? (
                <div className="space-y-1">
                  <p className="flex items-center gap-1.5 text-xs font-mono">
                    <MapPin className="h-3.5 w-3.5 text-emerald-500" />
                    {row.lat.toFixed(6)}, {row.lng.toFixed(6)}
                    {row.location_accuracy_m && (
                      <span className="text-muted-foreground">
                        · ±{Math.round(row.location_accuracy_m)}m
                      </span>
                    )}
                  </p>
                  {mapsUrl && (
                    <a
                      href={mapsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-500 hover:underline inline-flex items-center gap-1"
                    >
                      Abrir en Google Maps <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              ) : row.location_denied ? (
                <p className="text-xs text-amber-500">Ubicación denegada por el dispositivo</p>
              ) : (
                <p className="text-xs text-muted-foreground">Sin ubicación</p>
              )}
            </Field>

            <Field label="Estado">
              <div className="flex items-center gap-2">
                <StatusPill status={row.upload_status} />
                {row.upload_attempts > 1 && (
                  <span className="text-xs text-muted-foreground">
                    {row.upload_attempts} intentos
                  </span>
                )}
              </div>
              {row.uploaded_at && (
                <p className="text-xs text-muted-foreground mt-1">
                  Subida: {fmtStamp(row.uploaded_at)}
                </p>
              )}
            </Field>

            <Field label="Dispositivo">
              <div className="text-xs space-y-0.5 text-muted-foreground">
                {row.device_id && (
                  <p className="flex items-center gap-1.5">
                    <Smartphone className="h-3 w-3" />
                    <span className="font-mono">{row.device_id.slice(0, 8)}…</span>
                  </p>
                )}
                {row.ip_address && <p>IP: <span className="font-mono">{row.ip_address}</span></p>}
                {row.user_agent && (
                  <p className="truncate" title={row.user_agent}>
                    {parseUA(row.user_agent)}
                  </p>
                )}
              </div>
            </Field>

            <div className="pt-2 border-t flex items-center justify-between gap-2">
              <Button variant="outline" size="sm" asChild>
                <Link to={`/orders?q=${encodeURIComponent(row.order_code ?? "")}`}>
                  Ver pedido
                </Link>
              </Button>
              <Button variant="ghost" size="sm" onClick={onClose}>Cerrar</Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ── Subcomponents ──────────────────────────────────────────────────── */

function FilterPill({
  active, onClick, label, count, color,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
  color?: "emerald" | "amber" | "red";
}) {
  const colorCls =
    color === "emerald" ? "data-[active=true]:text-emerald-600 dark:data-[active=true]:text-emerald-400"
    : color === "amber" ? "data-[active=true]:text-amber-600 dark:data-[active=true]:text-amber-400"
    : color === "red" ? "data-[active=true]:text-red-600 dark:data-[active=true]:text-red-400"
    : "";
  return (
    <button
      onClick={onClick}
      data-active={active}
      className={cn(
        "px-3 py-1.5 rounded-md text-xs font-medium transition",
        "data-[active=false]:text-muted-foreground data-[active=false]:hover:text-foreground",
        "data-[active=true]:bg-background data-[active=true]:shadow-sm",
        colorCls,
      )}
    >
      {label}
      <span className="ml-1.5 opacity-60 tabular-nums">{count}</span>
    </button>
  );
}

function StatusPill({ status }: { status: UploadStatus }) {
  if (status === "uploaded") {
    return (
      <Badge variant="outline" className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/40 gap-1 text-[10px]">
        <CheckCircle2 className="h-3 w-3" /> Subida
      </Badge>
    );
  }
  if (status === "pending") {
    return (
      <Badge variant="outline" className="bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/40 gap-1 text-[10px]">
        <Loader2 className="h-3 w-3 animate-spin" /> Subiendo
      </Badge>
    );
  }
  if (status === "denied") {
    return (
      <Badge variant="outline" className="bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/40 gap-1 text-[10px]">
        <ShieldAlert className="h-3 w-3" /> Cámara denegada
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/40 gap-1 text-[10px]">
      <AlertTriangle className="h-3 w-3" /> Fallida
    </Badge>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{label}</p>
      {children}
    </div>
  );
}

function parseUA(ua: string): string {
  if (/iPhone/.test(ua)) return "iPhone";
  if (/iPad/.test(ua)) return "iPad";
  if (/Android/.test(ua)) return "Android";
  if (/Mac OS/.test(ua)) return "Mac";
  if (/Windows/.test(ua)) return "Windows";
  return ua.split(" ")[0];
}
