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

  type ImportSummary = {
    total: number;
    inserted: number;
    skippedFk: number;
    errors: { chunk: number; message: string; sample?: string }[];
  };
  const [importProgress, setImportProgress] = useState<{ done: number; total: number } | null>(null);
  const [importSummary, setImportSummary] = useState<ImportSummary | null>(null);

  const importCsv = useMutation({
    mutationFn: async ({ rows, replace }: { rows: Partial<Cuenta>[]; replace: boolean }): Promise<ImportSummary> => {
      if (!empresaId) throw new Error("Selecciona una empresa");
      if (rows.length === 0) throw new Error("El archivo no contiene filas válidas");
      setImportSummary(null);
      setImportProgress({ done: 0, total: rows.length });

      let deleteSkipped = 0;
      if (replace) {
        // Clear self-referential parent links so we can delete in any order
        await supabase.from("cuentas_contables" as any)
          .update({ padre_id: null }).eq("empresa_id", empresaId);
        // Find accounts referenced by pólizas — those cannot be deleted (FK RESTRICT)
        const { data: refs } = await supabase
          .from("poliza_movimientos" as any)
          .select("cuenta_id");
        const referencedIds = new Set<string>((refs as any[] | null)?.map((r) => r.cuenta_id) ?? []);
        const { data: allRows } = await supabase
          .from("cuentas_contables" as any)
          .select("id").eq("empresa_id", empresaId);
        const deletableIds = ((allRows as any[] | null) ?? [])
          .map((r) => r.id).filter((id) => !referencedIds.has(id));
        deleteSkipped = ((allRows as any[] | null)?.length ?? 0) - deletableIds.length;
        if (deletableIds.length > 0) {
          const { error: eDel } = await supabase
            .from("cuentas_contables" as any).delete().in("id", deletableIds);
          if (eDel) throw new Error(`No se pudo borrar el catálogo previo: ${eDel.message}`);
        }
      }
      const sorted = [...rows].sort((a, b) => (a.codigo?.length ?? 0) - (b.codigo?.length ?? 0));
      const payload = sorted.map((c) => ({
        empresa_id: empresaId,
        codigo: c.codigo,
        codigo_agrupador: c.codigo_agrupador || null,
        nombre: c.nombre,
        naturaleza: c.naturaleza ?? "deudora",
        nivel: c.nivel ?? Math.min(6, Math.max(1, (c.codigo ?? "").split(/[-.]/).filter(Boolean).length)),
        permite_movimientos: c.permite_movimientos ?? true,
        moneda: c.moneda || "MXN",
        activa: c.activa ?? true,
        saldo_inicial: c.saldo_inicial ?? 0,
      }));

      const errors: ImportSummary["errors"] = [];
      let inserted = 0;
      let skippedFk = 0;
      const chunk = 100;
      for (let i = 0; i < payload.length; i += chunk) {
        const slice = payload.slice(i, i + chunk);
        const chunkIdx = Math.floor(i / chunk) + 1;
        const { error, data } = await supabase
          .from("cuentas_contables" as any)
          .upsert(slice, { onConflict: "empresa_id,codigo" })
          .select("id");
        if (error) {
          for (const row of slice) {
            const { error: e2 } = await supabase
              .from("cuentas_contables" as any)
              .upsert(row, { onConflict: "empresa_id,codigo" });
            if (e2) {
              if ((e2 as any).code === "23503" || /foreign key|violates/i.test(e2.message)) {
                const { error: e3 } = await supabase
                  .from("cuentas_contables" as any)
                  .upsert({ ...row, codigo_agrupador: null }, { onConflict: "empresa_id,codigo" });
                if (e3) {
                  errors.push({ chunk: chunkIdx, message: e3.message, sample: row.codigo });
                } else {
                  inserted++;
                  skippedFk++;
                }
              } else {
                errors.push({ chunk: chunkIdx, message: e2.message, sample: row.codigo });
              }
            } else {
              inserted++;
            }
          }
        } else {
          inserted += (data?.length ?? slice.length);
        }
        setImportProgress({ done: Math.min(payload.length, i + chunk), total: payload.length });
      }
      return { total: payload.length, inserted, skippedFk, errors };
    },
    onSuccess: (s) => {
      setImportSummary(s);
      if (s.errors.length === 0) toast.success(`${s.inserted} cuentas importadas`);
      else toast.warning(`${s.inserted} importadas · ${s.errors.length} con errores`);
      qc.invalidateQueries({ queryKey: ["cuentas"] });
    },
    onError: (e: Error) => {
      setImportProgress(null);
      toast.error(e.message);
    },
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
            <Button variant="outline" onClick={() => setImportOpen(true)}>
              <Upload className="h-4 w-4 mr-1" /> Importar CSV
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                if (cuentas.length > 0 && !confirm("Ya existe un catálogo. ¿Cargar el catálogo SAT junto al actual? Se conservarán las cuentas propias con código distinto."))
                  return;
                seed.mutate();
              }}
              disabled={seed.isPending}
            >
              <Landmark className="h-4 w-4 mr-1" />
              {seed.isPending ? "Cargando…" : "Cargar catálogo SAT"}
            </Button>
            {cuentas.length > 0 && (
              <Button variant="ghost" onClick={exportCsv}>
                <Download className="h-4 w-4 mr-1" /> Exportar
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

          {importOpen && (
            <ImportCsvDialog
              satCodes={satCodes}
              onClose={() => { setImportOpen(false); setImportProgress(null); setImportSummary(null); }}
              hasExisting={cuentas.length > 0}
              onImport={(rows, replace) => importCsv.mutate({ rows, replace })}
              importing={importCsv.isPending}
              progress={importProgress}
              summary={importSummary}
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

// ---------- CSV Import ----------

function parseCsv(text: string, satCodes: SATCode[] = []): Partial<Cuenta>[] {
  // Split rows respecting quoted commas
  const rows: string[][] = [];
  let cur: string[] = [], field = "", inQ = false;
  const src = text.replace(/\r\n?/g, "\n");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQ) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; }
        else inQ = false;
      } else field += ch;
    } else {
      if (ch === '"') inQ = true;
      else if (ch === ",") { cur.push(field); field = ""; }
      else if (ch === "\n") { cur.push(field); rows.push(cur); cur = []; field = ""; }
      else field += ch;
    }
  }
  if (field.length || cur.length) { cur.push(field); rows.push(cur); }
  const nonEmpty = rows.filter((r) => r.some((c) => c.trim() !== ""));
  if (nonEmpty.length === 0) return [];

  // Detect header row: first row that contains a recognizable header token.
  // NetSuite exports start with a title line + blanks before headers.
  const norm = (s: string) =>
    s.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const HEADER_TOKENS = new Set([
    "codigo", "cuenta", "numero", "no. de cuenta", "no de cuenta",
    "nombre", "descripcion", "tipo", "naturaleza", "nivel",
    "saldo", "saldo inicial", "moneda", "resumen", "agrupador", "codigo agrupador",
  ]);
  let headerIdx = 0;
  for (let i = 0; i < nonEmpty.length; i++) {
    const hits = nonEmpty[i].filter((c) => HEADER_TOKENS.has(norm(c))).length;
    if (hits >= 2) { headerIdx = i; break; }
  }
  const header = nonEmpty[headerIdx].map(norm);
  const idx = (...aliases: string[]) => {
    for (const a of aliases) { const i = header.indexOf(a); if (i >= 0) return i; }
    return -1;
  };
  const iCod = idx("codigo", "numero", "cuenta", "no. de cuenta", "no de cuenta");
  // If a "numero" column exists, "cuenta" is actually the account name (NetSuite layout)
  const hasNumero = header.includes("numero");
  const iNom = hasNumero
    ? idx("cuenta", "nombre", "descripcion")
    : idx("nombre", "descripcion");
  if (iCod < 0 || iNom < 0) throw new Error("El CSV debe incluir al menos las columnas 'codigo' (o 'número') y 'nombre' (o 'cuenta')");
  const iAgr = idx("codigo agrupador", "agrupador", "sat", "codigo_sat", "codigo sat");
  const iTipo = idx("tipo", "naturaleza");
  const iNiv = idx("nivel");
  const iMov = idx("permite_movimientos", "movimientos", "detalle");
  const iResumen = idx("resumen");
  const iMon = idx("moneda");
  const iSal = idx("saldo inicial", "saldo_inicial", "saldo");

  // Map NetSuite/common tipo values to naturaleza. Anything under
  // "acreedora" side otherwise defaults to deudora (safer for asset/expense).
  const mapNaturaleza = (tipo: string, codigo: string): "deudora" | "acreedora" => {
    const t = norm(tipo);
    if (!t) {
      // Fall back to SAT numbering convention: 1/5/6/7 deudora, 2/3/4/8 acreedora
      const first = codigo.replace(/[^0-9]/g, "").charAt(0);
      if (["2", "3", "4", "8"].includes(first)) return "acreedora";
      return "deudora";
    }
    if (t.startsWith("a") || t === "c" || t === "credito" || t === "acreedora") return "acreedora";
    if (t === "deudora" || t === "d" || t === "debito") return "deudora";
    // NetSuite types
    const acreedoras = [
      "ingresos", "ingreso", "patrimonio", "capital",
      "cuentas a pagar", "cuentas por pagar", "pasivo",
      "otros pasivos corrientes", "otros pasivos", "pasivo a largo plazo",
      "tarjeta de credito", "tarjeta de crédito",
    ];
    if (acreedoras.some((k) => t.includes(k))) return "acreedora";
    return "deudora";
  };

  // Parse currency strings like "$14,800.00", "($8,293.50)", "-1234.5", "" → number.
  const parseMoney = (raw: string): number => {
    if (!raw) return 0;
    let s = raw.trim();
    if (!s) return 0;
    const neg = /^\(.*\)$/.test(s) || s.startsWith("-");
    s = s.replace(/[()$\s,]/g, "").replace(/^-/, "");
    const n = Number(s);
    if (!Number.isFinite(n)) return 0;
    return neg ? -n : n;
  };

  return nonEmpty.slice(headerIdx + 1).map((r) => {
    const codigo = (r[iCod] ?? "").trim();
    const nombre = (r[iNom] ?? "").trim();
    if (!codigo || !nombre) return null;

    const tipoRaw = iTipo >= 0 ? (r[iTipo] ?? "").trim() : "";
    // Skip NetSuite "Sin contabilización" pseudo-accounts.
    if (norm(tipoRaw).startsWith("sin contabilizacion")) return null;

    const naturaleza = mapNaturaleza(tipoRaw, codigo);
    const nivelParsed = iNiv >= 0 ? Number((r[iNiv] ?? "").trim()) : NaN;
    const nivel = Number.isFinite(nivelParsed) && nivelParsed > 0
      ? Math.min(6, Math.max(1, nivelParsed))
      : Math.min(6, Math.max(1, codigo.split(/[-.]/).filter(Boolean).length));

    let permite_movimientos: boolean;
    if (iResumen >= 0) {
      // NetSuite "Resumen" = Sí → summary/parent → NO movements
      const rv = norm(r[iResumen] ?? "");
      permite_movimientos = !(rv === "si" || rv === "sí" || rv === "yes" || rv === "true" || rv === "1");
    } else if (iMov >= 0) {
      const movRaw = norm(r[iMov] ?? "");
      permite_movimientos = movRaw === "" ? nivel >= 3 : ["1", "true", "si", "sí", "x", "y", "yes"].includes(movRaw);
    } else {
      permite_movimientos = nivel >= 3;
    }

    const saldoRaw = iSal >= 0 ? (r[iSal] ?? "") : "";
    const saldo = parseMoney(saldoRaw);

    // Derive codigo_agrupador: prefer explicit column, else prefix match against SAT catalog
    let codigo_agrupador: string | null = iAgr >= 0 ? (r[iAgr] ?? "").trim() || null : null;
    if (!codigo_agrupador && satCodes.length) {
      const digits = codigo.replace(/[^0-9]/g, "");
      // Try candidate SAT codes: 5, 4, 3, 2, 1 digits + possible ".NN" suffix
      let best: string | null = null;
      for (const s of satCodes) {
        const sDigits = s.codigo.replace(/[^0-9]/g, "");
        if (sDigits.length && digits.startsWith(sDigits)) {
          if (!best || sDigits.length > best.replace(/[^0-9]/g, "").length) best = s.codigo;
        }
      }
      codigo_agrupador = best;
    }

    return {
      codigo,
      nombre,
      codigo_agrupador,
      naturaleza,
      nivel,
      permite_movimientos,
      moneda: iMon >= 0 ? ((r[iMon] ?? "MXN").trim() || "MXN") : "MXN",
      saldo_inicial: saldo,
      activa: true,
    } as Partial<Cuenta>;
  }).filter((x): x is Partial<Cuenta> => x !== null);
}


function ImportCsvDialog({
  onClose, onImport, hasExisting, importing, satCodes, progress, summary,
}: {
  onClose: () => void;
  onImport: (rows: Partial<Cuenta>[], replace: boolean) => void;
  hasExisting: boolean;
  importing: boolean;
  satCodes: SATCode[];
  progress: { done: number; total: number } | null;
  summary: {
    total: number; inserted: number; skippedFk: number;
    errors: { chunk: number; message: string; sample?: string }[];
  } | null;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Partial<Cuenta>[]>([]);
  const [replace, setReplace] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = async (f: File) => {
    setFile(f); setError(null);
    try {
      const text = await f.text();
      const rows = parseCsv(text, satCodes);
      if (rows.length === 0) throw new Error("No se encontraron filas válidas");
      setPreview(rows);
    } catch (e: any) {
      setError(e.message); setPreview([]);
    }
  };

  const withAgrupador = preview.filter((c) => c.codigo_agrupador).length;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Importar catálogo propio (CSV)</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 pt-2 text-sm">
          <div className="rounded-md border border-dashed border-border bg-muted/20 p-3 text-xs text-muted-foreground">
            <p className="font-medium text-foreground mb-1">Formatos soportados</p>
            <p className="mb-1">
              <b>Estándar:</b> <code className="font-mono text-[11px]">codigo, nombre, codigo_agrupador, naturaleza, nivel, permite_movimientos, moneda, saldo_inicial</code>
            </p>
            <p className="mb-1">
              <b>NetSuite (Plan de cuentas):</b> se detectan automáticamente <code>Número</code>, <code>Cuenta</code>, <code>Tipo</code>, <code>Resumen</code>, <code>Moneda</code> y <code>Saldo</code>. El preámbulo del archivo se ignora.
            </p>
            <p className="mt-2">Sólo el código y el nombre son obligatorios. Se hace upsert por código. Importes válidos: <code>$1,234.00</code> o <code>($8,293.50)</code> para negativos.</p>
          </div>

          <div>
            <Label className="text-xs">Archivo CSV</Label>
            <Input
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
            />
          </div>

          {error && (
            <p className="rounded-md border border-destructive bg-destructive/10 p-2 text-xs text-destructive">{error}</p>
          )}

          {preview.length > 0 && (
            <div className="rounded-md border border-border overflow-hidden">
              <div className="bg-muted/30 px-3 py-1.5 text-xs font-medium flex items-center justify-between">
                <span>Vista previa — {preview.length} cuentas</span>
                <span className="text-[10px] font-normal text-muted-foreground">
                  Agrupador SAT: {withAgrupador}/{preview.length}
                </span>
              </div>
              <div className="max-h-64 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="bg-muted/20 text-[10px] uppercase text-muted-foreground">
                    <tr>
                      <th className="text-left px-2 py-1">Código</th>
                      <th className="text-left px-2 py-1">Agrupador</th>
                      <th className="text-left px-2 py-1">Nombre</th>
                      <th className="text-left px-2 py-1">Nat.</th>
                      <th className="text-center px-2 py-1">Nivel</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.slice(0, 50).map((c, i) => (
                      <tr key={i} className="border-t border-border">
                        <td className="px-2 py-1 font-mono">{c.codigo}</td>
                        <td className="px-2 py-1 font-mono text-muted-foreground">{c.codigo_agrupador ?? "—"}</td>
                        <td className="px-2 py-1">{c.nombre}</td>
                        <td className="px-2 py-1">{c.naturaleza}</td>
                        <td className="px-2 py-1 text-center">{c.nivel}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {preview.length > 50 && (
                  <div className="px-2 py-1 text-[10px] text-muted-foreground bg-muted/10">
                    …y {preview.length - 50} más
                  </div>
                )}
              </div>
            </div>
          )}

          {hasExisting && !summary && (
            <label className="flex items-center gap-2 rounded-md border border-border bg-muted/10 p-2 text-xs">
              <Switch checked={replace} onCheckedChange={setReplace} disabled={importing} />
              <span>
                <b>Reemplazar catálogo actual</b> — borra todas las cuentas existentes de esta empresa antes de importar.
                {replace && <span className="text-destructive"> Esta acción es destructiva.</span>}
              </span>
            </label>
          )}

          {progress && importing && (
            <div className="rounded-md border border-border bg-muted/10 p-3 space-y-1">
              <div className="flex justify-between text-xs">
                <span className="font-medium">Importando…</span>
                <span className="text-muted-foreground">{progress.done}/{progress.total}</span>
              </div>
              <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-primary transition-all"
                  style={{ width: `${Math.min(100, (progress.done / Math.max(1, progress.total)) * 100)}%` }}
                />
              </div>
            </div>
          )}

          {summary && !importing && (
            <div className="rounded-md border border-border bg-muted/10 p-3 space-y-2 text-xs">
              <div className="font-medium text-foreground text-sm">Resumen de la importación</div>
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded border border-border p-2">
                  <div className="text-[10px] text-muted-foreground uppercase">Total</div>
                  <div className="text-lg font-semibold">{summary.total}</div>
                </div>
                <div className="rounded border border-emerald-500/40 bg-emerald-500/5 p-2">
                  <div className="text-[10px] text-emerald-600 uppercase">Insertadas</div>
                  <div className="text-lg font-semibold text-emerald-600">{summary.inserted}</div>
                </div>
                <div className="rounded border border-destructive/40 bg-destructive/5 p-2">
                  <div className="text-[10px] text-destructive uppercase">Con error</div>
                  <div className="text-lg font-semibold text-destructive">{summary.errors.length}</div>
                </div>
              </div>
              {summary.skippedFk > 0 && (
                <p className="text-muted-foreground">
                  ⚠️ {summary.skippedFk} cuenta(s) importadas sin código agrupador SAT (no se encontró un código válido).
                </p>
              )}
              {summary.errors.length > 0 && (
                <div className="max-h-40 overflow-y-auto rounded border border-destructive/30 bg-destructive/5 p-2 space-y-1">
                  {summary.errors.slice(0, 20).map((e, i) => (
                    <div key={i} className="font-mono text-[10px] text-destructive">
                      {e.sample && <b>{e.sample}: </b>}{e.message}
                    </div>
                  ))}
                  {summary.errors.length > 20 && (
                    <div className="text-[10px] text-muted-foreground">…y {summary.errors.length - 20} más</div>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose} disabled={importing}>
              {summary ? "Cerrar" : "Cancelar"}
            </Button>
            {!summary && (
              <Button
                disabled={!file || preview.length === 0 || importing}
                onClick={() => {
                  if (replace && !confirm("Se eliminarán TODAS las cuentas actuales de esta empresa. ¿Continuar?")) return;
                  onImport(preview, replace);
                }}
              >
                {importing ? "Importando…" : `Importar ${preview.length || ""}`}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
