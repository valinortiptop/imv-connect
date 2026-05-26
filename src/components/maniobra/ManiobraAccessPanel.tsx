/**
 * ManiobraAccessPanel
 *
 * The collapsible card in Plan mode that controls the portal gate.
 * Mirrors the existing Transportes panel pattern (toggle button in
 * the header, panel below). Lives only in Plan mode — the admin
 * tools belong with the admin's working view, not the operator views.
 *
 * Contents (top to bottom):
 *   1. Quick actions — Abrir portal + Compartir portal (relocated
 *      from the header, same actions).
 *   2. PIN de hoy — big mono digit chip with copy + countdown +
 *      "Regenerar PIN ya" red-tinted button (AlertDialog confirm).
 *   3. Dispositivos confiados — list of trusted devices with per-row
 *      "Cerrar" + a "Cerrar sesión en TODOS" nuke button.
 *
 * Brand: same `border rounded-lg p-4 bg-card space-y-3` shell as the
 * Transportes panel so the visual rhythm of Plan mode is preserved.
 */

import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  KeyRound,
  Copy,
  Check,
  Eye,
  LinkIcon,
  RefreshCw,
  Smartphone,
  ShieldOff,
  Clock,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Props {
  /** Triggered when the user clicks "Abrir portal" — defers the actual
   *  window.open to the parent so it can stay consistent with how the
   *  existing header button worked. */
  onOpenPortal: () => void;
  /** Triggered when the user clicks "Compartir portal" — defers to the
   *  parent so the existing PortalShareDialog stays mounted there. */
  onSharePortal: () => void;
}

interface GateStatus {
  current_pin: string;
  rotates_at: string;
  rotated_at: string;
}

interface DeviceRow {
  id: string;
  label: string;
  user_agent: string | null;
  created_at: string;
  last_used_at: string;
}

/** Live countdown text — recomputed every 30 s, format hh h mm min. */
function useCountdown(targetIso: string | undefined): string {
  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30 * 1000);
    return () => clearInterval(t);
  }, []);
  if (!targetIso) return "—";
  const target = new Date(targetIso).getTime();
  const ms = target - now;
  if (ms <= 0) return "rotando…";
  const mins = Math.floor(ms / 60000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h > 0) return `${h} h ${m} min`;
  return `${m} min`;
}

/** Human-readable "ago" for the device last_used_at. */
function ago(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "ahora";
  if (mins < 60) return `hace ${mins} min`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  return `hace ${d} d`;
}

export function ManiobraAccessPanel({ onOpenPortal, onSharePortal }: Props) {
  const qc = useQueryClient();
  const [pinCopied, setPinCopied] = useState(false);
  const [confirmRotate, setConfirmRotate] = useState(false);
  const [confirmRevokeAll, setConfirmRevokeAll] = useState(false);

  const { data: gate, isLoading: gateLoading } = useQuery({
    queryKey: ["maniobra-gate-status"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("maniobra_gate_status");
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      return (row ?? null) as GateStatus | null;
    },
    // Refetch every minute so the countdown stays roughly fresh even
    // without UI interaction; midnight rotations also surface here.
    refetchInterval: 60 * 1000,
    staleTime: 30 * 1000,
  });

  const { data: devices = [], isLoading: devicesLoading } = useQuery({
    queryKey: ["maniobra-trusted-devices"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("maniobra_gate_list_devices");
      if (error) throw error;
      return (data ?? []) as DeviceRow[];
    },
    staleTime: 30 * 1000,
  });

  const rotate = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any).rpc("maniobra_gate_rotate");
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["maniobra-gate-status"] });
      toast.success("PIN regenerado");
      setConfirmRotate(false);
    },
    onError: (err: any) => toast.error("Error: " + (err.message ?? "desconocido")),
  });

  const revokeDevice = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).rpc("maniobra_gate_revoke_device", { p_id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["maniobra-trusted-devices"] });
      toast.success("Dispositivo cerrado");
    },
    onError: (err: any) => toast.error("Error: " + (err.message ?? "desconocido")),
  });

  const revokeAll = useMutation({
    mutationFn: async () => {
      const { data, error } = await (supabase as any).rpc("maniobra_gate_revoke_all_devices");
      if (error) throw error;
      return data as number;
    },
    onSuccess: (count) => {
      qc.invalidateQueries({ queryKey: ["maniobra-trusted-devices"] });
      toast.success(`${count} dispositivos cerrados`);
      setConfirmRevokeAll(false);
    },
    onError: (err: any) => toast.error("Error: " + (err.message ?? "desconocido")),
  });

  const countdown = useCountdown(gate?.rotates_at);

  const copyPin = async () => {
    if (!gate?.current_pin) return;
    try {
      await navigator.clipboard.writeText(gate.current_pin);
      setPinCopied(true);
      toast.success(`PIN copiado: ${gate.current_pin}`);
      setTimeout(() => setPinCopied(false), 2000);
    } catch {
      toast.error("No se pudo copiar — copia manualmente");
    }
  };

  return (
    <div className="border rounded-lg p-4 bg-card space-y-4">
      <div className="flex items-center gap-2">
        <KeyRound className="h-4 w-4 text-primary" />
        <h3 className="font-semibold text-sm">Acceso al portal</h3>
        <Badge variant="outline" className="text-[10px] py-0 px-1.5">
          Bloqueo diario
        </Badge>
      </div>

      {/* 1. Quick actions — Abrir / Compartir relocated from header */}
      <div className="flex items-center gap-2 flex-wrap">
        <Button variant="outline" size="sm" onClick={onOpenPortal} className="gap-1.5">
          <Eye className="h-4 w-4" />
          Abrir portal
        </Button>
        <Button variant="outline" size="sm" onClick={onSharePortal} className="gap-1.5">
          <LinkIcon className="h-4 w-4" />
          Compartir portal
        </Button>
        <span className="text-[10px] text-muted-foreground italic ml-1">
          Comparte el PIN de abajo junto con el link.
        </span>
      </div>

      {/* 2. PIN de hoy */}
      <div className="rounded-md border bg-muted/20 p-4 flex items-center gap-4 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground">
            PIN de hoy
          </div>
          {gateLoading || !gate ? (
            <Skeleton className="h-10 w-48 mt-1" />
          ) : (
            <button
              type="button"
              onClick={copyPin}
              className="mt-1 inline-flex items-center gap-3 rounded-md border bg-background px-4 py-2 hover:bg-muted/40 transition active:scale-[0.98]"
              title="Copiar PIN al portapapeles"
            >
              <span className="font-mono font-bold text-3xl tabular-nums tracking-[0.3em]">
                {gate.current_pin}
              </span>
              {pinCopied ? (
                <Check className="h-4 w-4 text-emerald-500" />
              ) : (
                <Copy className="h-4 w-4 text-muted-foreground" />
              )}
            </button>
          )}
        </div>

        <div className="text-right">
          <div className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground">
            Cambia en
          </div>
          <div className="mt-1 inline-flex items-center gap-1.5 text-sm font-semibold tabular-nums">
            <Clock className="h-3.5 w-3.5 text-muted-foreground" />
            {countdown}
          </div>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => setConfirmRotate(true)}
          disabled={rotate.isPending}
          className="gap-1.5 border-amber-500/50 text-amber-700 dark:text-amber-300 hover:bg-amber-500/10"
        >
          <RefreshCw className={cn("h-4 w-4", rotate.isPending && "animate-spin")} />
          Regenerar PIN ya
        </Button>
      </div>

      {/* 3. Dispositivos confiados */}
      <div className="rounded-md border p-3 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Smartphone className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-semibold">Dispositivos confiados</span>
            <Badge variant="outline" className="text-[10px] py-0 px-1.5">
              {devices.length}
            </Badge>
          </div>
          {devices.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConfirmRevokeAll(true)}
              disabled={revokeAll.isPending}
              className="gap-1.5 h-7 text-xs border-red-500/40 text-red-700 dark:text-red-300 hover:bg-red-500/10"
            >
              <ShieldOff className="h-3 w-3" />
              Cerrar sesión en TODOS
            </Button>
          )}
        </div>

        {devicesLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 2 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : devices.length === 0 ? (
          <div className="text-xs italic text-muted-foreground py-2 text-center">
            Sin dispositivos confiados — cada visita tendrá que capturar el PIN.
          </div>
        ) : (
          <div className="divide-y">
            {devices.map((d) => (
              <div key={d.id} className="flex items-center gap-3 py-2">
                <Smartphone className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{d.label}</div>
                  <div className="text-[10px] text-muted-foreground truncate">
                    Último uso: {ago(d.last_used_at)}
                    {d.user_agent && <> · {d.user_agent.split(/[()]/)[1] ?? ""}</>}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => revokeDevice.mutate(d.id)}
                  disabled={revokeDevice.isPending}
                  className="h-7 gap-1 text-xs text-red-600 dark:text-red-400 hover:bg-red-500/10"
                >
                  Cerrar
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Branded confirm for "Regenerar PIN ya" */}
      <AlertDialog
        open={confirmRotate}
        onOpenChange={(o) => { if (!o && !rotate.isPending) setConfirmRotate(false); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <RefreshCw className="h-5 w-5 text-amber-500" />
              Regenerar PIN ahora
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="text-sm space-y-2">
                <div>
                  Se genera un PIN nuevo al instante y el actual (<span className="font-mono font-bold">{gate?.current_pin}</span>) deja de funcionar.
                </div>
                <div className="text-muted-foreground">
                  Cualquiera que tenga el PIN viejo necesitará el nuevo para volver a entrar. Los dispositivos confiados no se ven afectados.
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={rotate.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => rotate.mutate()}
              disabled={rotate.isPending}
              className="gap-1.5 bg-amber-500 hover:bg-amber-600 text-white"
            >
              {rotate.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Sí, regenerar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Branded confirm for "Cerrar sesión en TODOS" */}
      <AlertDialog
        open={confirmRevokeAll}
        onOpenChange={(o) => { if (!o && !revokeAll.isPending) setConfirmRevokeAll(false); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <ShieldOff className="h-5 w-5 text-red-500" />
              Cerrar sesión en todos los dispositivos
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="text-sm space-y-2">
                <div>
                  Se cerrarán los <span className="font-bold tabular-nums">{devices.length}</span> dispositivo{devices.length === 1 ? "" : "s"} confiado{devices.length === 1 ? "" : "s"}. Todos volverán a pedir el PIN del día en su próxima visita.
                </div>
                <div className="text-muted-foreground">
                  Útil si pierdes la tablet de la oficina o sospechas que alguien sin autorización tiene acceso.
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={revokeAll.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => revokeAll.mutate()}
              disabled={revokeAll.isPending}
              className="gap-1.5 bg-red-500 hover:bg-red-600 text-white"
            >
              {revokeAll.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldOff className="h-4 w-4" />}
              Sí, cerrar todos
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
