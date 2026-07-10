import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Banknote,
  Plus,
  Trash2,
  Pencil,
  Building2,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { EmpresaSelector } from "@/components/contabilidad/EmpresaSelector";
import { useSelectedEmpresa } from "@/hooks/use-selected-empresa";
import { PageHeader } from "@/components/ui/page-header";
import { ResponsiveTable, type ResponsiveColumn } from "@/components/ui/responsive-table";

export const Route = createFileRoute("/admin/bancos/")({
  head: () => ({
    meta: [
      { title: "Cuentas bancarias — Bancos" },
      {
        name: "description",
        content: "Administra tus cuentas bancarias y saldos.",
      },
    ],
  }),
  component: BancosIndex,
});

type BankAccount = {
  id: string;
  empresa_id: string;
  banco: string;
  alias: string;
  moneda: string;
  clabe: string | null;
  numero_cuenta: string | null;
  saldo_inicial: number;
  cuenta_contable_id: string | null;
  activa: boolean;
  notas: string | null;
};

const fmtMoney = (n: number, moneda = "MXN") =>
  new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: moneda,
    maximumFractionDigits: 2,
  }).format(n);

function BancosIndex() {
  const qc = useQueryClient();
  const { selected } = useSelectedEmpresa();
  const empresaId = selected?.id;
  const [editing, setEditing] = useState<Partial<BankAccount> | null>(null);

  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ["bank_accounts", empresaId],
    enabled: !!empresaId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bank_accounts" as any)
        .select("*")
        .eq("empresa_id", empresaId!)
        .order("banco");
      if (error) throw error;
      return (data ?? []) as unknown as BankAccount[];
    },
  });

  const { data: saldos = {} } = useQuery({
    queryKey: ["bank_saldos", empresaId, accounts.map((a) => a.id).join(",")],
    enabled: accounts.length > 0,
    queryFn: async () => {
      const result: Record<string, number> = {};
      await Promise.all(
        accounts.map(async (a) => {
          const { data } = await supabase.rpc("bank_account_saldo" as any, {
            _cuenta: a.id,
          });
          result[a.id] = Number(data ?? a.saldo_inicial);
        }),
      );
      return result;
    },
  });

  const { data: cuentasContables = [] } = useQuery({
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
      return (data ?? []) as unknown as Array<{
        id: string;
        codigo: string;
        nombre: string;
      }>;
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (row: Partial<BankAccount>) => {
      if (!empresaId) throw new Error("Elige una empresa");
      const payload = {
        empresa_id: empresaId,
        banco: (row.banco ?? "").trim(),
        alias: (row.alias ?? "").trim(),
        moneda: row.moneda ?? "MXN",
        clabe: row.clabe?.trim() || null,
        numero_cuenta: row.numero_cuenta?.trim() || null,
        saldo_inicial: Number(row.saldo_inicial ?? 0),
        cuenta_contable_id: row.cuenta_contable_id || null,
        activa: row.activa ?? true,
        notas: row.notas?.trim() || null,
      };
      if (!payload.banco || !payload.alias)
        throw new Error("Banco y alias son requeridos");
      if (row.id) {
        const { error } = await supabase
          .from("bank_accounts" as any)
          .update(payload as any)
          .eq("id", row.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("bank_accounts" as any)
          .insert(payload as any);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Cuenta guardada");
      qc.invalidateQueries({ queryKey: ["bank_accounts", empresaId] });
      qc.invalidateQueries({ queryKey: ["bank_saldos"] });
      setEditing(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("bank_accounts" as any)
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Cuenta eliminada");
      qc.invalidateQueries({ queryKey: ["bank_accounts", empresaId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const totalPorMoneda = useMemo(() => {
    const out: Record<string, number> = {};
    for (const a of accounts) {
      out[a.moneda] = (out[a.moneda] ?? 0) + (saldos[a.id] ?? a.saldo_inicial);
    }
    return out;
  }, [accounts, saldos]);

  const columns: ResponsiveColumn<BankAccount>[] = [
    {
      key: "alias",
      label: "Banco / Alias",
      primary: true,
      render: (a) => (
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <div className="truncate font-medium">{a.alias}</div>
            <div className="truncate text-xs text-muted-foreground">{a.banco}</div>
          </div>
        </div>
      ),
    },
    {
      key: "clabe",
      label: "CLABE / Cuenta",
      className: "font-mono text-xs break-all",
      render: (a) => a.clabe ?? a.numero_cuenta ?? "—",
    },
    { key: "moneda", label: "Moneda", render: (a) => a.moneda },
    {
      key: "saldo_inicial",
      label: "Saldo inicial",
      className: "text-right tabular-nums",
      render: (a) => fmtMoney(a.saldo_inicial, a.moneda),
    },
    {
      key: "saldo_actual",
      label: "Saldo actual",
      className: "text-right tabular-nums font-semibold",
      render: (a) => fmtMoney(saldos[a.id] ?? a.saldo_inicial, a.moneda),
    },
    {
      key: "estado",
      label: "Estado",
      render: (a) =>
        a.activa ? <Badge variant="default">Activa</Badge> : <Badge variant="secondary">Inactiva</Badge>,
    },
  ];

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title={
          <span className="inline-flex items-center gap-2">
            <Banknote className="h-6 w-6 shrink-0 text-blue-600" />
            <span className="truncate">Cuentas bancarias</span>
          </span>
        }
        description="Administra tus cuentas y consulta saldos actuales."
        actions={
          <>
            <EmpresaSelector />
            <Button
              onClick={() => setEditing({ moneda: "MXN", saldo_inicial: 0, activa: true })}
              disabled={!empresaId}
            >
              <Plus className="h-4 w-4 mr-1" /> Nueva cuenta
            </Button>
          </>
        }
      />

      {!empresaId ? (
        <p className="text-muted-foreground">
          Elige una empresa para ver sus cuentas bancarias.
        </p>
      ) : (
        <>
          {Object.keys(totalPorMoneda).length > 0 && (
            <div className="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-4">
              {Object.entries(totalPorMoneda).map(([m, v]) => (
                <div
                  key={m}
                  className="flex items-center gap-3 rounded-lg border bg-card p-3 sm:p-4"
                >
                  <Wallet className="h-6 w-6 shrink-0 text-blue-600 sm:h-8 sm:w-8" />
                  <div className="min-w-0">
                    <div className="text-[10px] uppercase text-muted-foreground sm:text-xs">
                      Total {m}
                    </div>
                    <div className="truncate text-base font-bold sm:text-xl">
                      {fmtMoney(v, m)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {isLoading ? (
            <p className="text-sm text-muted-foreground">Cargando…</p>
          ) : (
            <ResponsiveTable
              columns={columns}
              data={accounts}
              rowKey={(a) => a.id}
              empty="No hay cuentas registradas todavía."
              renderActions={(a) => (
                <>
                  <Button size="sm" variant="ghost" onClick={() => setEditing(a)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      if (confirm(`¿Eliminar cuenta "${a.alias}"?`))
                        deleteMutation.mutate(a.id);
                    }}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </>
              )}
            />
          )}
        </>
      )}

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editing?.id ? "Editar cuenta bancaria" : "Nueva cuenta bancaria"}
            </DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label>Banco</Label>
              <Input
                value={editing?.banco ?? ""}
                onChange={(e) =>
                  setEditing({ ...editing!, banco: e.target.value })
                }
                placeholder="BBVA, Banorte, Santander…"
              />
            </div>
            <div>
              <Label>Alias</Label>
              <Input
                value={editing?.alias ?? ""}
                onChange={(e) =>
                  setEditing({ ...editing!, alias: e.target.value })
                }
                placeholder="Ej. Cheques MXN"
              />
            </div>
            <div>
              <Label>CLABE</Label>
              <Input
                value={editing?.clabe ?? ""}
                onChange={(e) =>
                  setEditing({ ...editing!, clabe: e.target.value })
                }
                maxLength={18}
              />
            </div>
            <div>
              <Label>Número de cuenta</Label>
              <Input
                value={editing?.numero_cuenta ?? ""}
                onChange={(e) =>
                  setEditing({ ...editing!, numero_cuenta: e.target.value })
                }
              />
            </div>
            <div>
              <Label>Moneda</Label>
              <Select
                value={editing?.moneda ?? "MXN"}
                onValueChange={(v) => setEditing({ ...editing!, moneda: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="MXN">MXN — Pesos</SelectItem>
                  <SelectItem value="USD">USD — Dólares</SelectItem>
                  <SelectItem value="EUR">EUR — Euros</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Saldo inicial</Label>
              <Input
                type="number"
                step="0.01"
                value={editing?.saldo_inicial ?? 0}
                onChange={(e) =>
                  setEditing({
                    ...editing!,
                    saldo_inicial: Number(e.target.value),
                  })
                }
              />
            </div>
            <div className="col-span-2">
              <Label>Cuenta contable</Label>
              <Select
                value={editing?.cuenta_contable_id ?? "none"}
                onValueChange={(v) =>
                  setEditing({
                    ...editing!,
                    cuenta_contable_id: v === "none" ? null : v,
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="(sin ligar)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">(sin ligar)</SelectItem>
                  {cuentasContables.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.codigo} — {c.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2">
              <Label>Notas</Label>
              <Input
                value={editing?.notas ?? ""}
                onChange={(e) =>
                  setEditing({ ...editing!, notas: e.target.value })
                }
              />
            </div>
            <div className="flex items-center gap-2 col-span-2">
              <Switch
                checked={editing?.activa ?? true}
                onCheckedChange={(v) =>
                  setEditing({ ...editing!, activa: v })
                }
              />
              <Label>Cuenta activa</Label>
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
