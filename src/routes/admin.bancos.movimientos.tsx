import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  ArrowUpDown,
  Plus,
  Sparkles,
  Check,
  Search,
  Trash2,
  Wand2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmpresaSelector } from "@/components/contabilidad/EmpresaSelector";
import { useSelectedEmpresa } from "@/hooks/use-selected-empresa";
import { categorizeMovementFn } from "@/lib/bancos.functions";

export const Route = createFileRoute("/admin/bancos/movimientos")({
  head: () => ({
    meta: [
      { title: "Movimientos — Bancos" },
      {
        name: "description",
        content: "Entradas y salidas de tus cuentas bancarias.",
      },
    ],
  }),
  component: MovimientosPage,
});

type Movement = {
  id: string;
  cuenta_id: string;
  fecha: string;
  tipo: string;
  monto: number;
  descripcion: string | null;
  referencia: string | null;
  contraparte: string | null;
  categoria: string | null;
  ai_categoria: string | null;
  ai_confianza: number | null;
  conciliado: boolean;
};

type Cuenta = { id: string; codigo: string; nombre: string };
type BankAccount = { id: string; alias: string; banco: string; moneda: string };

const TIPO_LABEL: Record<string, string> = {
  entrada: "Entrada",
  salida: "Salida",
  traspaso_in: "Traspaso ↓",
  traspaso_out: "Traspaso ↑",
  nomina: "Nómina",
  comision: "Comisión",
  interes: "Interés",
  ajuste: "Ajuste",
};

const CATEGORIAS = [
  "Ventas",
  "Cobranza cliente",
  "Compras / Proveedores",
  "Nómina",
  "Impuestos",
  "Comisiones bancarias",
  "Intereses",
  "Servicios",
  "Renta",
  "Transporte / Combustible",
  "Traspaso entre cuentas",
  "Devolución",
  "Otro",
];

function MovimientosPage() {
  const qc = useQueryClient();
  const { selected } = useSelectedEmpresa();
  const empresaId = selected?.id;
  const [cuentaId, setCuentaId] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Partial<Movement> | null>(null);
  const categorizeFn = useServerFn(categorizeMovementFn);

  const { data: accounts = [] } = useQuery({
    queryKey: ["bank_accounts", empresaId],
    enabled: !!empresaId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bank_accounts" as any)
        .select("id, banco, alias, moneda")
        .eq("empresa_id", empresaId!)
        .order("banco");
      if (error) throw error;
      return (data ?? []) as unknown as BankAccount[];
    },
  });

  const { data: cuentas = [] } = useQuery({
    queryKey: ["cuentas_contables_lite", empresaId],
    enabled: !!empresaId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cuentas_contables" as any)
        .select("id, codigo, nombre")
        .eq("empresa_id", empresaId!)
        .eq("activa", true)
        .order("codigo");
      if (error) throw error;
      return (data ?? []) as unknown as Cuenta[];
    },
  });

  const { data: movements = [], isLoading } = useQuery({
    queryKey: ["bank_movements", empresaId, cuentaId],
    enabled: !!empresaId,
    queryFn: async () => {
      let q = supabase
        .from("bank_movements" as any)
        .select("*")
        .eq("empresa_id", empresaId!)
        .order("fecha", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(500);
      if (cuentaId !== "all") q = q.eq("cuenta_id", cuentaId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as Movement[];
    },
  });

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return movements;
    return movements.filter(
      (m) =>
        (m.descripcion ?? "").toLowerCase().includes(s) ||
        (m.contraparte ?? "").toLowerCase().includes(s) ||
        (m.referencia ?? "").toLowerCase().includes(s) ||
        (m.categoria ?? "").toLowerCase().includes(s),
    );
  }, [movements, search]);

  const cuentasMap = useMemo(() => {
    const m = new Map<string, Cuenta>();
    cuentas.forEach((c) => m.set(c.id, c));
    return m;
  }, [cuentas]);

  const accountsMap = useMemo(() => {
    const m = new Map<string, BankAccount>();
    accounts.forEach((a) => m.set(a.id, a));
    return m;
  }, [accounts]);

  const saveMutation = useMutation({
    mutationFn: async (row: Partial<Movement>) => {
      if (!empresaId) throw new Error("Elige empresa");
      const payload: any = {
        empresa_id: empresaId,
        cuenta_id: row.cuenta_id,
        fecha: row.fecha,
        tipo: row.tipo,
        monto: Number(row.monto ?? 0),
        descripcion: row.descripcion || null,
        referencia: row.referencia || null,
        contraparte: row.contraparte || null,
        categoria: row.categoria || null,
        ai_categoria: row.ai_categoria || null,
        conciliado: row.conciliado ?? false,
      };
      if (!payload.cuenta_id || !payload.fecha || !payload.tipo || !payload.monto)
        throw new Error("Faltan campos requeridos");
      if (row.id) {
        const { error } = await supabase
          .from("bank_movements" as any)
          .update(payload)
          .eq("id", row.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("bank_movements" as any)
          .insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Movimiento guardado");
      qc.invalidateQueries({ queryKey: ["bank_movements"] });
      qc.invalidateQueries({ queryKey: ["bank_saldos"] });
      setEditing(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("bank_movements" as any)
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Movimiento eliminado");
      qc.invalidateQueries({ queryKey: ["bank_movements"] });
      qc.invalidateQueries({ queryKey: ["bank_saldos"] });
    },
  });

  const conciliarMutation = useMutation({
    mutationFn: async (m: Movement) => {
      const { error } = await supabase
        .from("bank_movements" as any)
        .update({
          conciliado: !m.conciliado,
          conciliado_at: !m.conciliado ? new Date().toISOString() : null,
        })
        .eq("id", m.id);
      if (error) throw error;
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["bank_movements"] }),
  });

  const recategorizeMutation = useMutation({
    mutationFn: async (id: string) =>
      await categorizeFn({ data: { movement_id: id } }),
    onSuccess: () => {
      toast.success("Recategorizado con IA");
      qc.invalidateQueries({ queryKey: ["bank_movements"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const fmtMoney = (n: number, tipo: string) => {
    const isIn = ["entrada", "traspaso_in", "interes"].includes(tipo);
    const sign = isIn ? 1 : -1;
    const s = new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: "MXN",
    }).format(sign * Math.abs(Number(n)));
    return s;
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <ArrowUpDown className="h-7 w-7 text-blue-600" />
          <div>
            <h1 className="text-2xl font-bold">Entradas y salidas</h1>
            <p className="text-sm text-muted-foreground">
              Movimientos bancarios con categoría contable sugerida por IA.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <EmpresaSelector />
          <Button
            onClick={() =>
              setEditing({
                fecha: new Date().toISOString().slice(0, 10),
                tipo: "salida",
                monto: 0,
                conciliado: false,
              })
            }
            disabled={!empresaId || accounts.length === 0}
          >
            <Plus className="h-4 w-4 mr-1" /> Nuevo movimiento
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <Select value={cuentaId} onValueChange={setCuentaId}>
          <SelectTrigger className="w-72">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las cuentas</SelectItem>
            {accounts.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.alias} — {a.banco}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="relative flex-1 max-w-md">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Buscar descripción, contraparte, referencia…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="rounded-lg border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left">
            <tr>
              <th className="p-3">Fecha</th>
              <th className="p-3">Cuenta</th>
              <th className="p-3">Descripción</th>
              <th className="p-3">Categoría / Cuenta contable</th>
              <th className="p-3 text-right">Monto</th>
              <th className="p-3">Conciliado</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={7} className="p-6 text-center text-muted-foreground">
                  Cargando…
                </td>
              </tr>
            )}
            {!isLoading && filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="p-6 text-center text-muted-foreground">
                  No hay movimientos.
                </td>
              </tr>
            )}
            {filtered.map((m) => {
              const acc = accountsMap.get(m.cuenta_id);
              const cta = m.ai_categoria ? cuentasMap.get(m.ai_categoria) : null;
              const isIn = ["entrada", "traspaso_in", "interes"].includes(m.tipo);
              return (
                <tr key={m.id} className="border-t hover:bg-muted/30">
                  <td className="p-3 whitespace-nowrap">{m.fecha}</td>
                  <td className="p-3 text-xs">
                    {acc ? `${acc.alias}` : "—"}
                    <div className="text-muted-foreground">
                      {TIPO_LABEL[m.tipo] ?? m.tipo}
                    </div>
                  </td>
                  <td className="p-3">
                    <div className="font-medium">{m.descripcion ?? "—"}</div>
                    <div className="text-xs text-muted-foreground">
                      {m.contraparte ?? ""}{" "}
                      {m.referencia ? `· ref ${m.referencia}` : ""}
                    </div>
                  </td>
                  <td className="p-3">
                    <div className="flex items-center gap-1">
                      <span className="text-sm">{m.categoria ?? "—"}</span>
                      {m.ai_confianza != null && m.ai_confianza > 0 && (
                        <Badge
                          variant="outline"
                          className="text-[10px] px-1.5"
                          title={`Confianza IA ${(m.ai_confianza * 100).toFixed(0)}%`}
                        >
                          <Sparkles className="h-2.5 w-2.5 mr-0.5" />
                          {(m.ai_confianza * 100).toFixed(0)}%
                        </Badge>
                      )}
                    </div>
                    {cta && (
                      <div className="text-xs text-muted-foreground">
                        {cta.codigo} — {cta.nombre}
                      </div>
                    )}
                  </td>
                  <td
                    className={`p-3 text-right tabular-nums font-medium ${isIn ? "text-green-700" : "text-red-700"}`}
                  >
                    {fmtMoney(m.monto, m.tipo)}
                  </td>
                  <td className="p-3">
                    <Button
                      size="sm"
                      variant={m.conciliado ? "default" : "outline"}
                      onClick={() => conciliarMutation.mutate(m)}
                    >
                      <Check className="h-3 w-3 mr-1" />
                      {m.conciliado ? "Sí" : "No"}
                    </Button>
                  </td>
                  <td className="p-3 text-right whitespace-nowrap">
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => recategorizeMutation.mutate(m.id)}
                      title="Recategorizar con IA"
                      disabled={recategorizeMutation.isPending}
                    >
                      <Wand2 className="h-4 w-4 text-purple-600" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => setEditing(m)}
                    >
                      <Pencil2 />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => {
                        if (confirm("¿Eliminar este movimiento?"))
                          deleteMutation.mutate(m.id);
                      }}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editing?.id ? "Editar movimiento" : "Nuevo movimiento"}
            </DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Cuenta bancaria</Label>
              <Select
                value={editing?.cuenta_id ?? ""}
                onValueChange={(v) =>
                  setEditing({ ...editing!, cuenta_id: v })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona…" />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.alias} — {a.banco}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Fecha</Label>
              <Input
                type="date"
                value={editing?.fecha ?? ""}
                onChange={(e) =>
                  setEditing({ ...editing!, fecha: e.target.value })
                }
              />
            </div>
            <div>
              <Label>Tipo</Label>
              <Select
                value={editing?.tipo ?? "salida"}
                onValueChange={(v) => setEditing({ ...editing!, tipo: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(TIPO_LABEL).map(([k, v]) => (
                    <SelectItem key={k} value={k}>
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Monto (positivo)</Label>
              <Input
                type="number"
                step="0.01"
                value={editing?.monto ?? 0}
                onChange={(e) =>
                  setEditing({
                    ...editing!,
                    monto: Number(e.target.value),
                  })
                }
              />
            </div>
            <div className="col-span-2">
              <Label>Descripción</Label>
              <Input
                value={editing?.descripcion ?? ""}
                onChange={(e) =>
                  setEditing({ ...editing!, descripcion: e.target.value })
                }
              />
            </div>
            <div>
              <Label>Contraparte</Label>
              <Input
                value={editing?.contraparte ?? ""}
                onChange={(e) =>
                  setEditing({ ...editing!, contraparte: e.target.value })
                }
              />
            </div>
            <div>
              <Label>Referencia</Label>
              <Input
                value={editing?.referencia ?? ""}
                onChange={(e) =>
                  setEditing({ ...editing!, referencia: e.target.value })
                }
              />
            </div>
            <div>
              <Label>Categoría</Label>
              <Select
                value={editing?.categoria ?? ""}
                onValueChange={(v) =>
                  setEditing({ ...editing!, categoria: v })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Categoría…" />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIAS.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Cuenta contable</Label>
              <Select
                value={editing?.ai_categoria ?? "none"}
                onValueChange={(v) =>
                  setEditing({
                    ...editing!,
                    ai_categoria: v === "none" ? null : v,
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="(sin cuenta)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">(sin cuenta)</SelectItem>
                  {cuentas.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.codigo} — {c.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(null)}>
              Cancelar
            </Button>
            <Button
              onClick={() => editing && saveMutation.mutate(editing)}
              disabled={saveMutation.isPending}
            >
              {saveMutation.isPending ? "Guardando…" : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Pencil2() {
  return (
    <svg
      className="h-4 w-4"
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
    </svg>
  );
}
