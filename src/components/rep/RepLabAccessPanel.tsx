import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getRepLabAccessFn, setRepLabAccessFn } from "@/lib/rep-lab-access.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { FlaskConical, Save } from "lucide-react";

const ALL = "__all__";

export default function RepLabAccessPanel() {
  const fetchData = useServerFn(getRepLabAccessFn);
  const save = useServerFn(setRepLabAccessFn);
  const qc = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ["rep-lab-access"],
    queryFn: () => fetchData(),
  });

  const [target, setTarget] = useState<string>(ALL);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [allLabs, setAllLabs] = useState(true);

  const reps = data?.representantes ?? [];
  const labs = data?.laboratorios ?? [];

  // Al cambiar de representante, cargar su selección actual
  useEffect(() => {
    if (!data) return;
    if (target === ALL) {
      setSelected([]);
      setAllLabs(true);
      return;
    }
    const current = data.access[target] ?? [];
    setSelected(current);
    setAllLabs(current.length === 0);
  }, [target, data]);

  const filteredLabs = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? labs.filter((l) => l.nombre?.toLowerCase().includes(q)) : labs;
  }, [labs, search]);

  const mut = useMutation({
    mutationFn: () =>
      save({
        data: {
          representante_ids: target === ALL ? reps.map((r) => r.id) : [target],
          laboratorio_ids: allLabs ? [] : selected,
        },
      }),
    onSuccess: () => {
      toast.success("Líneas de laboratorio actualizadas");
      qc.invalidateQueries({ queryKey: ["rep-lab-access"] });
      qc.invalidateQueries({ queryKey: ["my-lab-access"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Error al guardar"),
  });

  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <FlaskConical className="h-4 w-4 text-primary" />
          Líneas de laboratorio visibles por representante
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Elige qué laboratorios puede ver cada vendedor. Sin selección específica, el representante ve
          todas las líneas.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {error ? (
          <p className="text-sm text-destructive">{(error as Error).message}</p>
        ) : isLoading ? (
          <p className="text-sm text-muted-foreground">Cargando…</p>
        ) : (
          <>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Select value={target} onValueChange={setTarget}>
                <SelectTrigger className="h-10 sm:w-72">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Todos los representantes</SelectItem>
                  {reps.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.nombre}
                      {(data?.access[r.id]?.length ?? 0) > 0
                        ? ` · ${data?.access[r.id].length} líneas`
                        : " · todas"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                placeholder="Buscar laboratorio…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-10 sm:max-w-xs"
              />
              <Button
                className="h-10 sm:ml-auto"
                onClick={() => mut.mutate()}
                disabled={mut.isPending || (!allLabs && selected.length === 0)}
              >
                <Save className="mr-2 h-4 w-4" />
                Guardar
              </Button>
            </div>

            <label className="flex cursor-pointer items-center gap-2 rounded-md border p-3 text-sm">
              <Checkbox checked={allLabs} onCheckedChange={(v) => setAllLabs(Boolean(v))} />
              <span className="font-medium">Ver todas las líneas de laboratorio</span>
              {allLabs && <Badge variant="secondary">Acceso completo</Badge>}
            </label>

            {!allLabs && (
              <>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{selected.length} seleccionadas</span>
                  <Button
                    variant="link"
                    size="sm"
                    className="h-auto p-0 text-xs"
                    onClick={() => setSelected(filteredLabs.map((l) => l.id))}
                  >
                    Todas
                  </Button>
                  <Button
                    variant="link"
                    size="sm"
                    className="h-auto p-0 text-xs"
                    onClick={() => setSelected([])}
                  >
                    Ninguna
                  </Button>
                </div>
                <div className="max-h-72 space-y-1 overflow-y-auto rounded-md border p-2">
                  {filteredLabs.map((l) => (
                    <label
                      key={l.id}
                      className="flex cursor-pointer items-center gap-2 rounded px-2 py-2 text-sm hover:bg-muted"
                    >
                      <Checkbox checked={selected.includes(l.id)} onCheckedChange={() => toggle(l.id)} />
                      <span>{l.nombre}</span>
                    </label>
                  ))}
                  {filteredLabs.length === 0 && (
                    <p className="p-2 text-sm text-muted-foreground">Sin resultados</p>
                  )}
                </div>
              </>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
