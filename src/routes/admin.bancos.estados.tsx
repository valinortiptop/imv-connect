import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  FileText,
  Upload,
  Trash2,
  Download,
  Loader2,
  CheckCircle2,
  AlertCircle,
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
import { EmpresaSelector } from "@/components/contabilidad/EmpresaSelector";
import { useSelectedEmpresa } from "@/hooks/use-selected-empresa";
import {
  parseStatementFn,
  deleteStatementFn,
  signStatementUrlFn,
} from "@/lib/bancos.functions";

export const Route = createFileRoute("/admin/bancos/estados")({
  head: () => ({
    meta: [
      { title: "Estados bancarios — Bancos" },
      {
        name: "description",
        content: "Sube y procesa estados de cuenta con IA.",
      },
    ],
  }),
  component: EstadosBancariosPage,
});

type BankAccount = {
  id: string;
  banco: string;
  alias: string;
  moneda: string;
};

type Statement = {
  id: string;
  cuenta_id: string | null;
  periodo: string | null;
  file_name: string;
  file_size: number | null;
  status: string;
  bank_name: string | null;
  saldo_inicial: number | null;
  saldo_final: number | null;
  total_credits: number | null;
  total_debits: number | null;
  error_message: string | null;
  created_at: string;
};

async function fileToBase64(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

function EstadosBancariosPage() {
  const qc = useQueryClient();
  const { selected } = useSelectedEmpresa();
  const empresaId = selected?.id;
  const [cuentaId, setCuentaId] = useState<string>("");
  const [uploading, setUploading] = useState(false);

  const parseStatement = useServerFn(parseStatementFn);
  const deleteStatement = useServerFn(deleteStatementFn);
  const signUrl = useServerFn(signStatementUrlFn);

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

  const { data: statements = [], isLoading } = useQuery({
    queryKey: ["bank_statements", empresaId],
    enabled: !!empresaId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bank_statements" as any)
        .select("*")
        .eq("empresa_id", empresaId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Statement[];
    },
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      if (!empresaId || !cuentaId)
        throw new Error("Elige empresa y cuenta bancaria");
      if (file.size > 25 * 1024 * 1024)
        throw new Error("Archivo demasiado grande (máx 25MB)");
      const base64 = await fileToBase64(file);
      return await parseStatement({
        data: {
          empresa_id: empresaId,
          cuenta_id: cuentaId,
          filename: file.name,
          mime: file.type || "application/octet-stream",
          base64,
        },
      });
    },
    onMutate: () => setUploading(true),
    onSettled: () => setUploading(false),
    onSuccess: (res) => {
      toast.success(res.message ?? "Procesado");
      qc.invalidateQueries({ queryKey: ["bank_statements", empresaId] });
      qc.invalidateQueries({ queryKey: ["bank_movements"] });
      qc.invalidateQueries({ queryKey: ["bank_saldos"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => await deleteStatement({ data: { id } }),
    onSuccess: () => {
      toast.success("Estado eliminado");
      qc.invalidateQueries({ queryKey: ["bank_statements", empresaId] });
      qc.invalidateQueries({ queryKey: ["bank_movements"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) uploadMutation.mutate(f);
    e.target.value = "";
  };

  const handleDownload = async (id: string) => {
    try {
      const { url, name } = await signUrl({ data: { id } });
      if (!url) throw new Error("No se pudo firmar la URL");
      const a = document.createElement("a");
      a.href = url;
      a.download = name ?? "estado.pdf";
      a.click();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const fmtMoney = (n: number | null) =>
    n == null
      ? "—"
      : new Intl.NumberFormat("es-MX", {
          style: "currency",
          currency: "MXN",
        }).format(n);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <FileText className="h-7 w-7 text-blue-600" />
          <div>
            <h1 className="text-2xl font-bold">Estados bancarios</h1>
            <p className="text-sm text-muted-foreground">
              Sube CSV/XLSX o PDF: el sistema extrae y categoriza cada
              movimiento con IA.
            </p>
          </div>
        </div>
        <EmpresaSelector />
      </div>

      <div className="rounded-lg border bg-card p-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3 items-end">
          <div>
            <Label>Cuenta bancaria</Label>
            <Select value={cuentaId} onValueChange={setCuentaId}>
              <SelectTrigger>
                <SelectValue placeholder="Elige la cuenta a la que pertenece el estado" />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.alias} — {a.banco} ({a.moneda})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="block invisible">.</Label>
            <div className="relative">
              <Input
                type="file"
                accept=".csv,.xlsx,.xls,.pdf,application/pdf,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onChange={handleFile}
                disabled={!cuentaId || uploading}
                className="cursor-pointer"
              />
            </div>
          </div>
        </div>
        {uploading && (
          <div className="flex items-center gap-2 text-sm text-blue-600">
            <Loader2 className="h-4 w-4 animate-spin" /> Procesando estado y
            categorizando movimientos con IA…
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          Formatos soportados: CSV, XLSX (extractos de BBVA, Banorte,
          Santander, Banamex…) y PDF (extracción con IA).
        </p>
      </div>

      <div className="rounded-lg border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left">
            <tr>
              <th className="p-3">Archivo</th>
              <th className="p-3">Periodo</th>
              <th className="p-3">Estado</th>
              <th className="p-3 text-right">Créditos</th>
              <th className="p-3 text-right">Débitos</th>
              <th className="p-3 text-right">Saldo final</th>
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
            {!isLoading && statements.length === 0 && (
              <tr>
                <td colSpan={7} className="p-6 text-center text-muted-foreground">
                  Aún no has subido estados de cuenta.
                </td>
              </tr>
            )}
            {statements.map((s) => (
              <tr key={s.id} className="border-t hover:bg-muted/30">
                <td className="p-3">
                  <div className="font-medium">{s.file_name}</div>
                  <div className="text-xs text-muted-foreground">
                    {s.bank_name ?? "—"} · {(s.file_size ?? 0) / 1024 | 0} KB
                  </div>
                </td>
                <td className="p-3">{s.periodo ?? "—"}</td>
                <td className="p-3">
                  {s.status === "processed" ? (
                    <Badge className="bg-green-600">
                      <CheckCircle2 className="h-3 w-3 mr-1" /> Procesado
                    </Badge>
                  ) : s.status === "processing" ? (
                    <Badge variant="secondary">
                      <Loader2 className="h-3 w-3 mr-1 animate-spin" /> En proceso
                    </Badge>
                  ) : s.status === "error" ? (
                    <Badge variant="destructive" title={s.error_message ?? ""}>
                      <AlertCircle className="h-3 w-3 mr-1" /> Error
                    </Badge>
                  ) : (
                    <Badge variant="outline">{s.status}</Badge>
                  )}
                </td>
                <td className="p-3 text-right tabular-nums text-green-700">
                  {fmtMoney(s.total_credits)}
                </td>
                <td className="p-3 text-right tabular-nums text-red-700">
                  {fmtMoney(s.total_debits)}
                </td>
                <td className="p-3 text-right tabular-nums font-semibold">
                  {fmtMoney(s.saldo_final)}
                </td>
                <td className="p-3 text-right whitespace-nowrap">
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => handleDownload(s.id)}
                    title="Descargar archivo original"
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => {
                      if (
                        confirm(
                          "¿Eliminar este estado y todos sus movimientos importados?",
                        )
                      )
                        deleteMutation.mutate(s.id);
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
    </div>
  );
}
