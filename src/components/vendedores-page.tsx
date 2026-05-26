// @ts-nocheck
import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AnimatedGridPattern } from "@/components/ui/animated-grid-pattern";
import {
  Plus, Pencil, Trash2, UserSquare2, Mail, Phone, Percent,
  Users, ShoppingCart, DollarSign, Search,
} from "lucide-react";

interface Representante {
  id: string;
  user_id: string | null;
  nombre: string;
  email: string | null;
  telefono: string | null;
  comision_default_pct: number;
  activo: boolean;
  notas: string | null;
  created_at: string;
  updated_at: string;
}

const mxn = new Intl.NumberFormat("es-MX", {
  style: "currency", currency: "MXN", maximumFractionDigits: 0,
});

const EMPTY: Partial<Representante> = {
  nombre: "", email: "", telefono: "",
  comision_default_pct: 5, activo: true, notas: "",
};

export default function VendedoresPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [editing, setEditing] = useState<Partial<Representante> | null>(null);
  const [toDelete, setToDelete] = useState<Representante | null>(null);

  /* ── Queries ── */
  const { data: reps = [], isLoading } = useQuery({
    queryKey: ["representantes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("representantes").select("*").order("nombre");
      if (error) throw error;
      return data as Representante[];
    },
  });

  const { data: clientes = [] } = useQuery({
    queryKey: ["clientes-by-rep"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clientes").select("id, representante_id");
      if (error) throw error;
      return (data as any[]) ?? [];
    },
  });

  const { data: pedidos = [] } = useQuery({
    queryKey: ["pedidos-by-rep"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pedidos")
        .select("id, representante_id, subtotal, comision_monto, total");
      if (error) throw error;
      return (data as any[]) ?? [];
    },
  });

  /* ── Aggregates per rep ── */
  const stats = useMemo(() => {
    const m = new Map<string, { clientes: number; pedidos: number; ventas: number; comision: number }>();
    for (const r of reps) m.set(r.id, { clientes: 0, pedidos: 0, ventas: 0, comision: 0 });
    for (const c of clientes) {
      if (c.representante_id && m.has(c.representante_id))
        m.get(c.representante_id)!.clientes++;
    }
    for (const p of pedidos) {
      if (p.representante_id && m.has(p.representante_id)) {
        const s = m.get(p.representante_id)!;
        s.pedidos++;
        s.ventas += Number(p.total ?? p.subtotal ?? 0);
        s.comision += Number(p.comision_monto ?? 0);
      }
    }
    return m;
  }, [reps, clientes, pedidos]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return reps.filter((r) => {
      if (!showInactive && !r.activo) return false;
      if (!q) return true;
      return (
        r.nombre.toLowerCase().includes(q) ||
        (r.email ?? "").toLowerCase().includes(q) ||
        (r.telefono ?? "").toLowerCase().includes(q)
      );
    });
  }, [reps, search, showInactive]);

  const totals = useMemo(() => {
    let clientesTotal = 0, ventas = 0, comision = 0, activos = 0;
    for (const r of reps) {
      if (r.activo) activos++;
      const s = stats.get(r.id);
      if (s) { clientesTotal += s.clientes; ventas += s.ventas; comision += s.comision; }
    }
    return { reps: reps.length, activos, clientes: clientesTotal, ventas, comision };
  }, [reps, stats]);

  /* ── Mutations ── */
  const upsert = useMutation({
    mutationFn: async (r: Partial<Representante>) => {
      const payload: any = {
        nombre: r.nombre?.trim(),
        email: r.email?.trim() || null,
        telefono: r.telefono?.trim() || null,
        comision_default_pct: Number(r.comision_default_pct ?? 0),
        activo: !!r.activo,
        notas: r.notas?.trim() || null,
      };
      if (r.id) {
        const { error } = await supabase
          .from("representantes").update(payload).eq("id", r.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("representantes").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["representantes"] });
      setEditing(null);
      toast({ title: "Vendedor guardado" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("representantes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["representantes"] });
      setToDelete(null);
      toast({ title: "Vendedor eliminado" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  /* ── Render ── */
  return (
    <div className="relative min-h-screen">
      <AnimatedGridPattern className="opacity-20 [mask-image:radial-gradient(600px_circle_at_center,white,transparent)]" />
      <div className="relative z-10 max-w-7xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <UserSquare2 className="h-7 w-7" /> Vendedores
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Gestiona representantes de venta, sus clientes asignados y comisiones.
            </p>
          </div>
          <Button onClick={() => setEditing({ ...EMPTY })}>
            <Plus className="h-4 w-4 mr-2" /> Nuevo vendedor
          </Button>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard icon={<UserSquare2 className="h-4 w-4" />} label="Vendedores activos"
            value={`${totals.activos} / ${totals.reps}`} />
          <StatCard icon={<Users className="h-4 w-4" />} label="Clientes asignados"
            value={String(totals.clientes)} />
          <StatCard icon={<ShoppingCart className="h-4 w-4" />} label="Ventas (todos)"
            value={mxn.format(totals.ventas)} />
          <StatCard icon={<DollarSign className="h-4 w-4" />} label="Comisiones generadas"
            value={mxn.format(totals.comision)} />
        </div>

        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center justify-between">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nombre, email o teléfono…"
              value={search} onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={showInactive} onCheckedChange={setShowInactive} />
            Mostrar inactivos
          </label>
        </div>

        {/* Table */}
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Contacto</TableHead>
                  <TableHead className="text-right">Comisión</TableHead>
                  <TableHead className="text-right">Clientes</TableHead>
                  <TableHead className="text-right">Pedidos</TableHead>
                  <TableHead className="text-right">Ventas</TableHead>
                  <TableHead className="text-right">Comisión $</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="w-[100px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && (
                  Array.from({ length: 4 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 9 }).map((__, j) => (
                        <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                )}
                {!isLoading && filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center text-muted-foreground py-10">
                      {reps.length === 0
                        ? "Aún no hay vendedores. Crea el primero."
                        : "No hay vendedores que coincidan con el filtro."}
                    </TableCell>
                  </TableRow>
                )}
                {!isLoading && filtered.map((r) => {
                  const s = stats.get(r.id) ?? { clientes: 0, pedidos: 0, ventas: 0, comision: 0 };
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.nombre}</TableCell>
                      <TableCell>
                        <div className="text-xs text-muted-foreground space-y-0.5">
                          {r.email && <div className="flex items-center gap-1"><Mail className="h-3 w-3" />{r.email}</div>}
                          {r.telefono && <div className="flex items-center gap-1"><Phone className="h-3 w-3" />{r.telefono}</div>}
                          {!r.email && !r.telefono && <span>—</span>}
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        <span className="inline-flex items-center gap-1">
                          {Number(r.comision_default_pct).toFixed(1)}<Percent className="h-3 w-3" />
                        </span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{s.clientes}</TableCell>
                      <TableCell className="text-right tabular-nums">{s.pedidos}</TableCell>
                      <TableCell className="text-right tabular-nums">{mxn.format(s.ventas)}</TableCell>
                      <TableCell className="text-right tabular-nums">{mxn.format(s.comision)}</TableCell>
                      <TableCell>
                        <Badge variant={r.activo ? "default" : "secondary"}>
                          {r.activo ? "Activo" : "Inactivo"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 justify-end">
                          <Button size="icon" variant="ghost" onClick={() => setEditing(r)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button size="icon" variant="ghost" onClick={() => setToDelete(r)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* Edit dialog */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Editar vendedor" : "Nuevo vendedor"}</DialogTitle>
            <DialogDescription>
              Los datos se guardan en la tabla <code>representantes</code>.
            </DialogDescription>
          </DialogHeader>
          {editing && (
            <div className="space-y-3">
              <Field label="Nombre *">
                <Input value={editing.nombre ?? ""} onChange={(e) =>
                  setEditing({ ...editing, nombre: e.target.value })} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Email">
                  <Input type="email" value={editing.email ?? ""} onChange={(e) =>
                    setEditing({ ...editing, email: e.target.value })} />
                </Field>
                <Field label="Teléfono">
                  <Input value={editing.telefono ?? ""} onChange={(e) =>
                    setEditing({ ...editing, telefono: e.target.value })} />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3 items-end">
                <Field label="Comisión default (%)">
                  <Input type="number" step="0.1" min="0" max="100"
                    value={editing.comision_default_pct ?? 0}
                    onChange={(e) => setEditing({ ...editing, comision_default_pct: Number(e.target.value) })} />
                </Field>
                <label className="flex items-center gap-2 text-sm pb-2">
                  <Switch checked={!!editing.activo}
                    onCheckedChange={(v) => setEditing({ ...editing, activo: v })} />
                  Activo
                </label>
              </div>
              <Field label="Notas">
                <Textarea rows={3} value={editing.notas ?? ""} onChange={(e) =>
                  setEditing({ ...editing, notas: e.target.value })} />
              </Field>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button
              disabled={!editing?.nombre?.trim() || upsert.isPending}
              onClick={() => upsert.mutate(editing!)}
            >
              {upsert.isPending ? "Guardando…" : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Eliminar vendedor</DialogTitle>
            <DialogDescription>
              ¿Eliminar a <b>{toDelete?.nombre}</b>? Esta acción no se puede deshacer.
              Los pedidos y clientes asignados conservarán el registro pero quedarán sin vendedor.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setToDelete(null)}>Cancelar</Button>
            <Button variant="destructive"
              disabled={remove.isPending}
              onClick={() => toDelete && remove.mutate(toDelete.id)}>
              {remove.isPending ? "Eliminando…" : "Eliminar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-2">
          {icon}{label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold tabular-nums">{value}</div>
      </CardContent>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}
