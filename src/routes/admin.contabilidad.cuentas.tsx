import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { BookText, Plus, Trash2, Search, Check, X, Upload, Download, Landmark } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { EmpresaSelector } from "@/components/contabilidad/EmpresaSelector";
import { useSelectedEmpresa } from "@/hooks/use-selected-empresa";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/admin/contabilidad/cuentas")({
  head: () => ({
    meta: [
      { title: "Catálogo de cuentas — Contabilidad" },
      { name: "description", content: "Plan de cuentas con código agrupador SAT (Anexo 24)." },
    ],
  }),
  component: CuentasPage,
});

type Cuenta = {
  id: string;
  empresa_id: string;
  codigo: string;
  codigo_agrupador: string | null;
  nombre: string;
  naturaleza: "deudora" | "acreedora";
  nivel: number;
  padre_id: string | null;
  permite_movimientos: boolean;
  moneda: string;
  activa: boolean;
  saldo_inicial: number;
};

type SATCode = { codigo: string; nombre: string; nivel: number; naturaleza: "deudora" | "acreedora" };

function CuentasPage() {
  const qc = useQueryClient();
  const { selected } = useSelectedEmpresa();
  const empresaId = selected?.id;
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Partial<Cuenta> | null>(null);

  const { data: cuentas = [], isLoading } = useQuery({
    queryKey: ["cuentas", empresaId],
    enabled: !!empresaId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cuentas_contables" as any)
        .select("*")
        .eq("empresa_id", empresaId!)
        .order("codigo");
      if (error) throw error;
      return (data ?? []) as unknown as Cuenta[];
    },
  });

  const { data: satCodes = [] } = useQuery({
    queryKey: ["sat-codigo-agrupador"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sat_codigo_agrupador" as any)
        .select("codigo, nombre, nivel, naturaleza")
        .order("codigo");
      if (error) throw error;
      return (data ?? []) as unknown as SATCode[];
    },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return cuentas;
    return cuentas.filter((c) =>
      c.codigo.toLowerCase().includes(q) ||
      c.nombre.toLowerCase().includes(q) ||
      (c.codigo_agrupador ?? "").toLowerCase().includes(q)
    );
  }, [cuentas, search]);

  const seed = useMutation({
    mutationFn: async () => {
      if (!empresaId) throw new Error("Selecciona una empresa");
      const { error } = await supabase.rpc("seed_cuentas_empresa" as any, { _empresa: empresaId });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Catálogo SAT cargado"); qc.invalidateQueries({ queryKey: ["cuentas"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const save = useMutation({
    mutationFn: async (c: Partial<Cuenta>) => {
      if (!empresaId) throw new Error("Selecciona una empresa");
      const payload: any = {
        empresa_id: empresaId,
        codigo: c.codigo,
        codigo_agrupador: c.codigo_agrupador || null,
        nombre: c.nombre,
        naturaleza: c.naturaleza,
        nivel: c.nivel ?? 3,
        padre_id: c.padre_id || null,
        permite_movimientos: c.permite_movimientos ?? true,
        moneda: c.moneda || "MXN",
        activa: c.activa ?? true,
        saldo_inicial: c.saldo_inicial ?? 0,
      };
      if (c.id) {
        const { error } = await supabase.from("cuentas_contables" as any).update(payload).eq("id", c.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("cuentas_contables" as any).insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Cuenta guardada");
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["cuentas"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("cuentas_contables" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Cuenta eliminada"); qc.invalidateQueries({ queryKey: ["cuentas"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const importCsv = useMutation({
    mutationFn: async ({ rows, replace }: { rows: Partial<Cuenta>[]; replace: boolean }) => {
      if (!empresaId) throw new Error("Selecciona una empresa");
      if (rows.length === 0) throw new Error("El archivo no contiene filas válidas");
      if (replace) {
        const { error: eDel } = await supabase
          .from("cuentas_contables" as any).delete().eq("empresa_id", empresaId);
        if (eDel) throw eDel;
      }
      // Insert padres antes que hijos: ordenar por longitud de código
      const sorted = [...rows].sort((a, b) => (a.codigo?.length ?? 0) - (b.codigo?.length ?? 0));
      const payload = sorted.map((c) => ({
        empresa_id: empresaId,
        codigo: c.codigo,
        codigo_agrupador: c.codigo_agrupador || null,
        nombre: c.nombre,
        naturaleza: c.naturaleza ?? "deudora",
        nivel: c.nivel ?? Math.min(6, Math.max(1, (c.codigo ?? "").replace(/[^0-9]/g, "").length <= 3 ? ((c.codigo?.split("-").length ?? 1) + ((c.codigo ?? "").length >= 3 ? 1 : 0)) : 3)),
        permite_movimientos: c.permite_movimientos ?? true,
        moneda: c.moneda || "MXN",
        activa: c.activa ?? true,
        saldo_inicial: c.saldo_inicial ?? 0,
      }));
      // Insertar en lotes
      const chunk = 200;
      for (let i = 0; i < payload.length; i += chunk) {
        const { error } = await supabase
          .from("cuentas_contables" as any)
          .upsert(payload.slice(i, i + chunk), { onConflict: "empresa_id,codigo" });
        if (error) throw error;
      }
      return payload.length;
    },
    onSuccess: (n) => { toast.success(`${n} cuentas importadas`); qc.invalidateQueries({ queryKey: ["cuentas"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const [importOpen, setImportOpen] = useState(false);

  const exportCsv = () => {
    const header = "codigo,codigo_agrupador,nombre,naturaleza,nivel,permite_movimientos,moneda,saldo_inicial";
    const esc = (s: any) => {
      const str = s == null ? "" : String(s);
      return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
    };
    const body = cuentas.map((c) => [
      c.codigo, c.codigo_agrupador ?? "", c.nombre, c.naturaleza, c.nivel,
      c.permite_movimientos ? "1" : "0", c.moneda ?? "MXN", c.saldo_inicial ?? 0,
    ].map(esc).join(",")).join("\n");
    const blob = new Blob([header + "\n" + body], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `catalogo_cuentas_${new Date().toISOString().slice(0,10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BookText className="h-6 w-6 text-primary" /> Catálogo de cuentas
          </h1>
          <p className="text-sm text-muted-foreground">
            Plan de cuentas con código agrupador oficial SAT (Anexo 24). Nivel ≥ 3 se puede usar en pólizas.
          </p>
        </div>
        <EmpresaSelector />
      </div>

      {!empresaId ? (
        <div className="rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          Elige una empresa para ver su catálogo.
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[240px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por código, nombre o agrupador…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8"
              />
            </div>
            <Button onClick={() => setEditing({ naturaleza: "deudora", nivel: 3, permite_movimientos: true, activa: true, moneda: "MXN" })}>
              <Plus className="h-4 w-4 mr-1" /> Nueva cuenta
            </Button>
            {cuentas.length === 0 && (
              <Button variant="outline" onClick={() => seed.mutate()} disabled={seed.isPending}>
                {seed.isPending ? "Cargando…" : "Cargar catálogo SAT"}
              </Button>
            )}
          </div>

          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="text-left px-3 py-2 w-28">Código</th>
                  <th className="text-left px-3 py-2 w-24">Agrupador</th>
                  <th className="text-left px-3 py-2">Nombre</th>
                  <th className="text-left px-3 py-2 w-24">Naturaleza</th>
                  <th className="text-center px-3 py-2 w-16">Nivel</th>
                  <th className="text-center px-3 py-2 w-24">Movs.</th>
                  <th className="w-20"></th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">Cargando…</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">
                    Sin cuentas. Usa "Cargar catálogo SAT" para arrancar con el plan estándar.
                  </td></tr>
                ) : filtered.map((c) => (
                  <tr key={c.id} className="border-t border-border hover:bg-muted/20 cursor-pointer" onClick={() => setEditing(c)}>
                    <td className="px-3 py-2 font-mono text-xs">{c.codigo}</td>
                    <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{c.codigo_agrupador ?? "—"}</td>
                    <td className="px-3 py-2">{c.nombre}</td>
                    <td className="px-3 py-2">
                      <Badge variant="outline" className="text-[10px]">{c.naturaleza}</Badge>
                    </td>
                    <td className="px-3 py-2 text-center">{c.nivel}</td>
                    <td className="px-3 py-2 text-center">
                      {c.permite_movimientos ? <Check className="h-4 w-4 text-emerald-500 mx-auto" /> : <X className="h-4 w-4 text-muted-foreground mx-auto" />}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Button
                        size="icon" variant="ghost" className="h-7 w-7 text-destructive"
                        onClick={(e) => { e.stopPropagation(); if (confirm(`¿Eliminar ${c.codigo}?`)) remove.mutate(c.id); }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {editing && (
            <CuentaDialog
              value={editing}
              cuentas={cuentas}
              satCodes={satCodes}
              onClose={() => setEditing(null)}
              onSave={(v) => save.mutate(v)}
              saving={save.isPending}
            />
          )}
        </>
      )}
    </section>
  );
}

function CuentaDialog({
  value, cuentas, satCodes, onClose, onSave, saving,
}: {
  value: Partial<Cuenta>;
  cuentas: Cuenta[];
  satCodes: SATCode[];
  onClose: () => void;
  onSave: (v: Partial<Cuenta>) => void;
  saving: boolean;
}) {
  const [v, setV] = useState<Partial<Cuenta>>(value);
  const set = <K extends keyof Cuenta>(k: K, val: Cuenta[K] | null) =>
    setV((prev) => ({ ...prev, [k]: val as any }));

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{v.id ? "Editar cuenta" : "Nueva cuenta"}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => { e.preventDefault(); onSave(v); }}
          className="space-y-3 pt-2"
        >
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Código *</Label>
              <Input required value={v.codigo ?? ""} onChange={(e) => set("codigo", e.target.value)} className="font-mono" />
            </div>
            <div>
              <Label className="text-xs">Nivel *</Label>
              <Input type="number" min={1} max={6} required value={v.nivel ?? 3} onChange={(e) => set("nivel", Number(e.target.value))} />
            </div>
          </div>
          <div>
            <Label className="text-xs">Nombre *</Label>
            <Input required value={v.nombre ?? ""} onChange={(e) => set("nombre", e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Naturaleza *</Label>
              <Select value={v.naturaleza ?? "deudora"} onValueChange={(val) => set("naturaleza", val as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="deudora">Deudora</SelectItem>
                  <SelectItem value="acreedora">Acreedora</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Código agrupador SAT</Label>
              <Select value={v.codigo_agrupador ?? "__none__"} onValueChange={(val) => set("codigo_agrupador", val === "__none__" ? null : val)}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent className="max-h-[300px]">
                  <SelectItem value="__none__">— sin agrupador —</SelectItem>
                  {satCodes.map((s) => (
                    <SelectItem key={s.codigo} value={s.codigo}>
                      {s.codigo} — {s.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label className="text-xs">Cuenta padre</Label>
            <Select value={v.padre_id ?? "__none__"} onValueChange={(val) => set("padre_id", val === "__none__" ? null : val)}>
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent className="max-h-[300px]">
                <SelectItem value="__none__">— sin padre —</SelectItem>
                {cuentas.filter((c) => c.id !== v.id).map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.codigo} · {c.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Saldo inicial</Label>
            <Input type="number" step="0.01" value={v.saldo_inicial ?? 0} onChange={(e) => set("saldo_inicial", Number(e.target.value))} />
          </div>
          <div className="flex flex-wrap items-center gap-4 rounded-md border border-border bg-muted/20 p-2">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <Switch checked={v.permite_movimientos ?? true} onCheckedChange={(c) => set("permite_movimientos", c)} />
              Permite movimientos
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <Switch checked={v.activa ?? true} onCheckedChange={(c) => set("activa", c)} />
              Activa
            </label>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={saving}>{saving ? "Guardando…" : "Guardar"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
