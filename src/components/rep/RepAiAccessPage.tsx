import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Sparkles, Search } from "lucide-react";
import { toast } from "sonner";
import { getRepAiAccessFn, setRepAiAccessFn } from "@/lib/rep-ai-access.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";

export default function RepAiAccessPage() {
  const fetchData = useServerFn(getRepAiAccessFn);
  const save = useServerFn(setRepAiAccessFn);
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [showInactive, setShowInactive] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["rep-ai-access"],
    queryFn: () => fetchData(),
  });

  const mut = useMutation({
    mutationFn: (v: { ids: string[]; allowed: boolean }) =>
      save({ data: { representante_ids: v.ids, allowed: v.allowed } }),
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: ["rep-ai-access"] });
      const prev = qc.getQueryData<any>(["rep-ai-access"]);
      if (prev) {
        const allowed = { ...prev.allowed };
        for (const id of v.ids) allowed[id] = v.allowed;
        qc.setQueryData(["rep-ai-access"], { ...prev, allowed });
      }
      return { prev };
    },
    onError: (e: any, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(["rep-ai-access"], ctx.prev);
      toast.error(e?.message ?? "No se pudo guardar");
    },
    onSuccess: (_r, v) => {
      toast.success(
        v.ids.length === 1
          ? v.allowed
            ? "IA habilitada para el representante"
            : "IA bloqueada para el representante"
          : v.allowed
            ? `IA habilitada para ${v.ids.length} representantes`
            : `IA bloqueada para ${v.ids.length} representantes`,
      );
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["rep-ai-access"] }),
  });

  const reps = data?.representantes ?? [];
  const allowed = data?.allowed ?? {};

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return reps.filter((r) => {
      if (!showInactive && r.activo === false) return false;
      if (!term) return true;
      return (
        r.nombre?.toLowerCase().includes(term) || (r.email ?? "").toLowerCase().includes(term)
      );
    });
  }, [reps, q, showInactive]);

  const enabledCount = reps.filter((r) => allowed[r.id]).length;

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4 md:p-6">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-semibold">
          <Sparkles className="h-5 w-5 text-primary" /> Asistente IA para representantes
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          La IA está apagada para todos los representantes. Elige quiénes pueden activarla desde su
          panel. Los que no estén habilitados no ven el botón de IA.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
            <span>Representantes</span>
            <Badge variant="secondary">
              {enabledCount} de {reps.length} con IA permitida
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {error ? (
            <p className="text-sm text-destructive">{(error as Error).message}</p>
          ) : isLoading ? (
            <p className="text-sm text-muted-foreground">Cargando…</p>
          ) : (
            <>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Buscar representante…"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    className="h-10 pl-9"
                  />
                </div>
                <label className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Switch checked={showInactive} onCheckedChange={setShowInactive} />
                  Mostrar inactivos
                </label>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!filtered.length || mut.isPending}
                  onClick={() => mut.mutate({ ids: filtered.map((r) => r.id), allowed: true })}
                >
                  Permitir a los {filtered.length} mostrados
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!filtered.length || mut.isPending}
                  onClick={() => mut.mutate({ ids: filtered.map((r) => r.id), allowed: false })}
                >
                  Bloquear a los {filtered.length} mostrados
                </Button>
              </div>

              <ul className="divide-y divide-border rounded-md border">
                {filtered.length === 0 && (
                  <li className="p-4 text-sm text-muted-foreground">Sin representantes.</li>
                )}
                {filtered.map((r) => {
                  const on = !!allowed[r.id];
                  return (
                    <li key={r.id} className="flex items-center justify-between gap-3 p-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-medium">{r.nombre}</span>
                          {r.activo === false && <Badge variant="outline">Inactivo</Badge>}
                        </div>
                        {r.email && (
                          <div className="truncate text-xs text-muted-foreground">{r.email}</div>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="hidden text-xs text-muted-foreground sm:inline">
                          {on ? "Puede activar IA" : "IA bloqueada"}
                        </span>
                        <Switch
                          checked={on}
                          aria-label={`Permitir IA a ${r.nombre}`}
                          onCheckedChange={(v) => mut.mutate({ ids: [r.id], allowed: v })}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
