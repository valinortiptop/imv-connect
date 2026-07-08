import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ArrowLeftRight, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { EmpresaSelector } from "@/components/contabilidad/EmpresaSelector";
import { useSelectedEmpresa } from "@/hooks/use-selected-empresa";
import { createTransferFn } from "@/lib/bancos.functions";

export const Route = createFileRoute("/admin/bancos/traspasos")({
  head: () => ({
    meta: [
      { title: "Traspasos — Bancos" },
      {
        name: "description",
        content: "Traspasos entre cuentas bancarias.",
      },
    ],
  }),
  component: TraspasosPage,
});

type BankAccount = { id: string; banco: string; alias: string; moneda: string };
type Transfer = {
  id: string;
  cuenta_origen_id: string;
  cuenta_destino_id: string;
  fecha: string;
  monto: number;
  referencia: string | null;
  notas: string | null;
  created_at: string;
};

function TraspasosPage() {
  const qc = useQueryClient();
  const { selected } = useSelectedEmpresa();
  const empresaId = selected?.id;
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<{
    cuenta_origen_id: string;
    cuenta_destino_id: string;
    fecha: string;
    monto: number;
    referencia: string;
    notas: string;
  }>({
    cuenta_origen_id: "",
    cuenta_destino_id: "",
    fecha: new Date().toISOString().slice(0, 10),
    monto: 0,
    referencia: "",
    notas: "",
  });

  const createFn = useServerFn(createTransferFn);

  const { data: accounts = [] } = useQuery({
    queryKey: ["bank_accounts", empresaId],
    enabled: !!empresaId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bank_accounts" as any)
        .select("id, banco, alias, moneda")
        .eq("empresa_id", empresaId!)
        .eq("activa", true)
        .order("banco");
      if (error) throw error;
      return (data ?? []) as unknown as BankAccount[];
    },
  });

  const { data: transfers = [], isLoading } = useQuery({
    queryKey: ["bank_transfers", empresaId],
    enabled: !!empresaId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bank_transfers" as any)
        .select("*")
        .eq("empresa_id", empresaId!)
        .order("fecha", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as unknown as Transfer[];
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!empresaId) throw new Error("Elige empresa");
      return await createFn({
        data: {
          empresa_id: empresaId,
          cuenta_origen_id: form.cuenta_origen_id,
          cuenta_destino_id: form.cuenta_destino_id,
          fecha: form.fecha,
          monto: Number(form.monto),
          referencia: form.referencia || undefined,
          notas: form.notas || undefined,
        },
      });
    },
    onSuccess: () => {
      toast.success("Traspaso registrado");
      qc.invalidateQueries({ queryKey: ["bank_transfers"] });
      qc.invalidateQueries({ queryKey: ["bank_movements"] });
      qc.invalidateQueries({ queryKey: ["bank_saldos"] });
      setOpen(false);
      setForm({
        cuenta_origen_id: "",
        cuenta_destino_id: "",
        fecha: new Date().toISOString().slice(0, 10),
        monto: 0,
        referencia: "",
        notas: "",
      });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      // movements with transfer_id are removed by ON DELETE via FK, but no FK
      // exists here — remove manually.
      await supabase
        .from("bank_movements" as any)
        .delete()
        .eq("transfer_id", id);
      const { error } = await supabase
        .from("bank_transfers" as any)
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Traspaso eliminado");
      qc.invalidateQueries({ queryKey: ["bank_transfers"] });
      qc.invalidateQueries({ queryKey: ["bank_movements"] });
      qc.invalidateQueries({ queryKey: ["bank_saldos"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const fmtMoney = (n: number) =>
    new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: "MXN",
    }).format(n);

  const accMap = new Map(accounts.map((a) => [a.id, a] as const));

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <ArrowLeftRight className="h-7 w-7 text-blue-600" />
          <div>
            <h1 className="text-2xl font-bold">Traspasos</h1>
            <p className="text-sm text-muted-foreground">
              Transferencias entre tus propias cuentas bancarias.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <EmpresaSelector />
          <Button
            onClick={() => setOpen(true)}
            disabled={!empresaId || accounts.length < 2}
          >
            <Plus className="h-4 w-4 mr-1" /> Nuevo traspaso
          </Button>
        </div>
      </div>

      <div className="rounded-lg border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left">
            <tr>
              <th className="p-3">Fecha</th>
              <th className="p-3">De</th>
              <th className="p-3">A</th>
              <th className="p-3 text-right">Monto</th>
              <th className="p-3">Referencia</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={6} className="p-6 text-center text-muted-foreground">
                  Cargando…
                </td>
              </tr>
            )}
            {!isLoading && transfers.length === 0 && (
              <tr>
                <td colSpan={6} className="p-6 text-center text-muted-foreground">
                  Aún no hay traspasos registrados.
                </td>
              </tr>
            )}
            {transfers.map((t) => (
              <tr key={t.id} className="border-t hover:bg-muted/30">
                <td className="p-3 whitespace-nowrap">{t.fecha}</td>
                <td className="p-3">
                  {accMap.get(t.cuenta_origen_id)?.alias ?? "—"}
                </td>
                <td className="p-3">
                  {accMap.get(t.cuenta_destino_id)?.alias ?? "—"}
                </td>
                <td className="p-3 text-right tabular-nums font-semibold">
                  {fmtMoney(Number(t.monto))}
                </td>
                <td className="p-3">{t.referencia ?? "—"}</td>
                <td className="p-3 text-right">
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => {
                      if (confirm("¿Eliminar este traspaso y sus movimientos?"))
                        deleteMutation.mutate(t.id);
                    }}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Nuevo traspaso</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <Label>Cuenta origen</Label>
              <Select
                value={form.cuenta_origen_id}
                onValueChange={(v) =>
                  setForm({ ...form, cuenta_origen_id: v })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Elige la cuenta que envía…" />
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
            <div className="col-span-2">
              <Label>Cuenta destino</Label>
              <Select
                value={form.cuenta_destino_id}
                onValueChange={(v) =>
                  setForm({ ...form, cuenta_destino_id: v })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Elige la cuenta que recibe…" />
                </SelectTrigger>
                <SelectContent>
                  {accounts
                    .filter((a) => a.id !== form.cuenta_origen_id)
                    .map((a) => (
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
                value={form.fecha}
                onChange={(e) => setForm({ ...form, fecha: e.target.value })}
              />
            </div>
            <div>
              <Label>Monto</Label>
              <Input
                type="number"
                step="0.01"
                value={form.monto}
                onChange={(e) =>
                  setForm({ ...form, monto: Number(e.target.value) })
                }
              />
            </div>
            <div className="col-span-2">
              <Label>Referencia</Label>
              <Input
                value={form.referencia}
                onChange={(e) =>
                  setForm({ ...form, referencia: e.target.value })
                }
              />
            </div>
            <div className="col-span-2">
              <Label>Notas</Label>
              <Input
                value={form.notas}
                onChange={(e) => setForm({ ...form, notas: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => createMutation.mutate()}
              disabled={
                createMutation.isPending ||
                !form.cuenta_origen_id ||
                !form.cuenta_destino_id ||
                !form.monto
              }
            >
              {createMutation.isPending ? "Registrando…" : "Registrar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
