// Pestaña de supervisor para autorizar prospectos nuevos y asignar
// prospectos / clientes a representantes.
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  listRepsForAssignmentFn,
  listProspectsForAssignmentFn,
  listClientsForAssignmentFn,
  assignProspectToRepFn,
  assignClientToRepFn,
} from "@/lib/rep-supervisor.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { AlertTriangle, Search, UserCheck, UserPlus, Users } from "lucide-react";

const UNASSIGNED = "__none__";

export default function SupervisorAssignments() {
  const qc = useQueryClient();
  const fetchReps = useServerFn(listRepsForAssignmentFn);
  const fetchProspects = useServerFn(listProspectsForAssignmentFn);
  const fetchClients = useServerFn(listClientsForAssignmentFn);
  const assignProspect = useServerFn(assignProspectToRepFn);
  const assignClient = useServerFn(assignClientToRepFn);

  const [pSearch, setPSearch] = useState("");
  const [pScope, setPScope] = useState<"todos" | "sin_asignar" | "asignados">("sin_asignar");
  const [cSearch, setCSearch] = useState("");
  const [cScope, setCScope] = useState<"todos" | "sin_asignar" | "asignados">("sin_asignar");

  const repsQ = useQuery({
    queryKey: ["assign-reps"],
    queryFn: () => fetchReps({ data: {} as any }),
  });
  const reps: any[] = repsQ.data?.reps ?? [];

  const prospectsQ = useQuery({
    queryKey: ["assign-prospects", pSearch, pScope],
    queryFn: () => fetchProspects({ data: { search: pSearch, scope: pScope } }),
  });
  const clientsQ = useQuery({
    queryKey: ["assign-clients", cSearch, cScope],
    queryFn: () => fetchClients({ data: { search: cSearch, scope: cScope } }),
  });

  const prospectMut = useMutation({
    mutationFn: (v: { prospectId: string; repId: string | null }) =>
      assignProspect({ data: v }),
    onSuccess: () => {
      toast.success("Prospecto actualizado");
      qc.invalidateQueries({ queryKey: ["assign-prospects"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "No se pudo asignar"),
  });

  const clientMut = useMutation({
    mutationFn: (v: { clienteId: string; repId: string | null }) => assignClient({ data: v }),
    onSuccess: () => {
      toast.success("Cliente actualizado");
      qc.invalidateQueries({ queryKey: ["assign-clients"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "No se pudo asignar"),
  });

  const prospects: any[] = prospectsQ.data?.prospects ?? [];
  const clients: any[] = clientsQ.data?.clients ?? [];

  const ScopeFilter = ({
    value,
    onChange,
  }: {
    value: string;
    onChange: (v: any) => void;
  }) => (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-9 w-[180px]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="sin_asignar">Sin asignar</SelectItem>
        <SelectItem value="asignados">Ya asignados</SelectItem>
        <SelectItem value="todos">Todos</SelectItem>
      </SelectContent>
    </Select>
  );

  const RepSelect = ({
    value,
    onChange,
    disabled,
  }: {
    value: string | null;
    onChange: (repId: string | null) => void;
    disabled?: boolean;
  }) => (
    <Select
      value={value ?? UNASSIGNED}
      onValueChange={(v) => onChange(v === UNASSIGNED ? null : v)}
      disabled={disabled}
    >
      <SelectTrigger className="h-8 w-[200px] text-xs">
        <SelectValue placeholder="Asignar a…" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={UNASSIGNED}>Sin representante</SelectItem>
        {reps.map((r) => (
          <SelectItem key={r.id} value={r.id}>
            {r.nombre}
            {!r.user_id ? " (sin cuenta)" : ""}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <UserCheck className="h-4 w-4 text-primary" /> Asignaciones
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Autoriza prospectos nuevos y administra a qué representante pertenece cada prospecto o
          cliente.
        </p>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="prospectos" className="space-y-3">
          <TabsList>
            <TabsTrigger value="prospectos">
              <UserPlus className="mr-1.5 h-3.5 w-3.5" /> Prospectos
            </TabsTrigger>
            <TabsTrigger value="clientes">
              <Users className="mr-1.5 h-3.5 w-3.5" /> Clientes
            </TabsTrigger>
          </TabsList>

          <TabsContent value="prospectos" className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  value={pSearch}
                  onChange={(e) => setPSearch(e.target.value)}
                  placeholder="Buscar prospecto, contacto o teléfono…"
                  className="h-9 pl-8"
                />
              </div>
              <ScopeFilter value={pScope} onChange={setPScope} />
              <Badge variant="secondary" className="font-normal">
                {prospects.length} resultados
              </Badge>
            </div>

            {prospectsQ.isLoading && (
              <p className="text-sm text-muted-foreground">Cargando prospectos…</p>
            )}
            {prospectsQ.error && (
              <p className="text-sm text-destructive">{(prospectsQ.error as Error).message}</p>
            )}

            <div className="space-y-2">
              {prospects.map((p) => (
                <div
                  key={p.id}
                  className="flex flex-wrap items-start justify-between gap-3 rounded-md border p-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate font-medium">{p.name ?? "Prospecto"}</p>
                      {p.rep_nombre ? (
                        <Badge
                          variant="outline"
                          className="border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400"
                        >
                          <AlertTriangle className="mr-1 h-3 w-3" /> Ya asignado a {p.rep_nombre}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-muted-foreground">
                          Sin asignar
                        </Badge>
                      )}
                      {p.status && (
                        <Badge variant="secondary" className="font-normal">
                          {p.status}
                        </Badge>
                      )}
                      {p.converted_client_id && (
                        <Badge className="border-green-500/40 bg-green-500/15 text-green-700 dark:text-green-400" variant="outline">
                          Convertido
                        </Badge>
                      )}
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      {[p.contact_person, p.phone, p.direccion, p.colonia, p.municipio]
                        .filter(Boolean)
                        .join(" · ") || "Sin datos de contacto"}
                    </p>
                    {p.created_at && (
                      <p className="text-[11px] text-muted-foreground">
                        Creado {new Date(p.created_at).toLocaleDateString("es-MX")}
                        {p.source ? ` · ${p.source}` : ""}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <RepSelect
                      value={p.rep_id}
                      disabled={prospectMut.isPending}
                      onChange={(repId) =>
                        prospectMut.mutate({ prospectId: p.id, repId })
                      }
                    />
                    {p.rep_id && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => prospectMut.mutate({ prospectId: p.id, repId: null })}
                        disabled={prospectMut.isPending}
                      >
                        Liberar
                      </Button>
                    )}
                  </div>
                </div>
              ))}
              {!prospectsQ.isLoading && prospects.length === 0 && (
                <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                  No hay prospectos con este filtro.
                </p>
              )}
            </div>
          </TabsContent>

          <TabsContent value="clientes" className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  value={cSearch}
                  onChange={(e) => setCSearch(e.target.value)}
                  placeholder="Buscar cliente…"
                  className="h-9 pl-8"
                />
              </div>
              <ScopeFilter value={cScope} onChange={setCScope} />
              <Badge variant="secondary" className="font-normal">
                {clients.length} resultados
              </Badge>
            </div>

            {clientsQ.isLoading && (
              <p className="text-sm text-muted-foreground">Cargando clientes…</p>
            )}
            {clientsQ.error && (
              <p className="text-sm text-destructive">{(clientsQ.error as Error).message}</p>
            )}

            <div className="space-y-2">
              {clients.map((c) => (
                <div
                  key={c.id}
                  className="flex flex-wrap items-start justify-between gap-3 rounded-md border p-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate font-medium">
                        {c.nombre_comercial || c.razon_social || c.nickname || "Cliente"}
                      </p>
                      {c.rep_nombre ? (
                        <Badge variant="secondary" className="font-normal">
                          {c.rep_nombre}
                        </Badge>
                      ) : (
                        <Badge variant="destructive" className="font-normal">
                          Sin representante
                        </Badge>
                      )}
                    </div>
                    {c.direccion && (
                      <p className="truncate text-xs text-muted-foreground">{c.direccion}</p>
                    )}
                  </div>
                  <RepSelect
                    value={c.representante_id}
                    disabled={clientMut.isPending}
                    onChange={(repId) => clientMut.mutate({ clienteId: c.id, repId })}
                  />
                </div>
              ))}
              {!clientsQ.isLoading && clients.length === 0 && (
                <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                  No hay clientes con este filtro.
                </p>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
