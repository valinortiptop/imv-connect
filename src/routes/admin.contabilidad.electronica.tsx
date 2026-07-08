import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { FileText, Download, FileCode2, FileSpreadsheet, ShieldCheck, KeyRound, Trash2, Upload, ExternalLink, Archive, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { EmpresaSelector } from "@/components/contabilidad/EmpresaSelector";
import { useSelectedEmpresa } from "@/hooks/use-selected-empresa";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { useServerFn } from "@tanstack/react-start";
import { uploadCsd, getCsdInfo, deleteCsd, signContabilidadXml } from "@/lib/csd.functions";
import JSZip from "jszip";

export const Route = createFileRoute("/admin/contabilidad/electronica")({
  head: () => ({
    meta: [
      { title: "Contabilidad electrónica — Anexo 24 SAT" },
      { name: "description", content: "Genera Catálogo de cuentas, Balanza, Pólizas (XML SAT Anexo 24) y DIOT TXT." },
    ],
  }),
  component: ContabilidadElectronicaPage,
});

const today = new Date();
const defaultYear = today.getFullYear();
const defaultMonth = today.getMonth() + 1;

function ContabilidadElectronicaPage() {
  const { selected } = useSelectedEmpresa();
  const empresaId = selected?.id;
  const [year, setYear] = useState<number>(defaultYear);
  const [month, setMonth] = useState<number>(defaultMonth);
  const [tipoEnvio, setTipoEnvio] = useState<"N" | "C">("N"); // Normal / Complementaria
  const [tipoSolicitud, setTipoSolicitud] = useState<"AF" | "FC" | "DE" | "CO">("AF");

  const desde = `${year}-${String(month).padStart(2, "0")}-01`;
  const hastaDate = new Date(year, month, 0);
  const hasta = `${year}-${String(month).padStart(2, "0")}-${String(hastaDate.getDate()).padStart(2, "0")}`;

  const { data: empresa } = useQuery({
    queryKey: ["empresa-elec", empresaId],
    enabled: !!empresaId,
    queryFn: async () => {
      const { data, error } = await supabase.from("empresas" as any).select("*").eq("id", empresaId!).single();
      if (error) throw error;
      return data as any;
    },
  });

  const rfc = empresa?.rfc ?? "";
  const mesStr = String(month).padStart(2, "0");
  const yearStr = String(year);

  const genCatalogo = async () => {
    if (!empresaId) return toast.error("Selecciona empresa");
    if (!rfc) return toast.error("La empresa no tiene RFC");
    const { data, error } = await supabase
      .from("cuentas_contables" as any)
      .select("codigo, codigo_agrupador, nombre, nivel, naturaleza, padre_id, permite_movimientos, activa")
      .eq("empresa_id", empresaId).eq("activa", true).order("codigo");
    if (error) return toast.error(error.message);
    const rows = (data ?? []) as any[];
    const missing = rows.filter((r) => r.permite_movimientos && !r.codigo_agrupador);
    if (missing.length > 0) {
      toast.warning(`${missing.length} cuentas de movimiento no tienen código agrupador SAT`);
    }
    const xml = buildCatalogoXml(rfc, yearStr, mesStr, rows);
    download(`CatalogoCuentas_${rfc}_${yearStr}${mesStr}.xml`, xml, "application/xml");
    toast.success("Catálogo de cuentas generado");
  };

  const genBalanza = async () => {
    if (!empresaId) return toast.error("Selecciona empresa");
    if (!rfc) return toast.error("La empresa no tiene RFC");
    const { data, error } = await supabase.rpc("balanza_de_comprobacion" as any, {
      _empresa: empresaId, _desde: desde, _hasta: hasta,
    });
    if (error) return toast.error(error.message);
    const rows = (data ?? []) as any[];
    const xml = buildBalanzaXml(rfc, yearStr, mesStr, tipoEnvio, rows);
    download(`Balanza_${rfc}_${yearStr}${mesStr}_${tipoEnvio}.xml`, xml, "application/xml");
    toast.success("Balanza de comprobación generada");
  };

  const genPolizas = async () => {
    if (!empresaId) return toast.error("Selecciona empresa");
    if (!rfc) return toast.error("La empresa no tiene RFC");
    const { data: polizas, error: e1 } = await supabase
      .from("polizas" as any)
      .select("id, folio, tipo, fecha, concepto, estado")
      .eq("empresa_id", empresaId).eq("estado", "asentada")
      .gte("fecha", desde).lte("fecha", hasta).order("fecha").order("folio");
    if (e1) return toast.error(e1.message);
    const ids = (polizas ?? []).map((p: any) => p.id);
    if (ids.length === 0) {
      toast.warning("No hay pólizas asentadas en el periodo");
      return;
    }
    const { data: movs, error: e2 } = await supabase
      .from("poliza_movimientos" as any)
      .select("poliza_id, cargo, abono, concepto, uuid_cfdi, cuentas_contables!inner(codigo)")
      .in("poliza_id", ids).order("orden");
    if (e2) return toast.error(e2.message);
    const xml = buildPolizasXml(rfc, yearStr, mesStr, tipoSolicitud, polizas ?? [], movs ?? []);
    download(`Polizas_${rfc}_${yearStr}${mesStr}_${tipoSolicitud}.xml`, xml, "application/xml");
    toast.success(`Pólizas del periodo generadas (${ids.length})`);
  };

  const genDiot = async () => {
    if (!empresaId) return toast.error("Selecciona empresa");
    const { data, error } = await supabase
      .from("poliza_impuestos" as any)
      .select("tipo, tasa, base, monto, polizas!inner(empresa_id, estado, fecha)")
      .eq("polizas.empresa_id", empresaId)
      .eq("polizas.estado", "asentada")
      .gte("polizas.fecha", desde).lte("polizas.fecha", hasta);
    if (error) return toast.error(error.message);
    const rows = (data ?? []) as any[];
    const txt = buildDiotTxt(rows);
    download(`DIOT_${rfc || "SIN_RFC"}_${yearStr}${mesStr}.txt`, txt, "text/plain");
    toast.success("DIOT TXT generado (borrador — revisar RFC de proveedores)");
  };

  const meses = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
  ];

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FileText className="h-6 w-6 text-primary" /> Contabilidad electrónica
          </h1>
          <p className="text-sm text-muted-foreground">
            Exporta los archivos que el SAT requiere: Catálogo de cuentas, Balanza y Pólizas (XML Anexo 24 v1.3), y DIOT TXT.
          </p>
        </div>
        <EmpresaSelector />
      </div>

      {!empresaId ? (
        <div className="rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          Elige una empresa.
        </div>
      ) : (
        <>
          <div className="rounded-lg border border-border p-4 bg-muted/20">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <Label className="text-xs">RFC emisor</Label>
                <div className="font-mono text-sm mt-1">{rfc || <span className="text-destructive">— sin RFC —</span>}</div>
              </div>
              <div>
                <Label className="text-xs">Año</Label>
                <Input type="number" min={2015} max={2100} value={year} onChange={(e) => setYear(Number(e.target.value))} />
              </div>
              <div>
                <Label className="text-xs">Mes</Label>
                <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {meses.map((m, i) => (
                      <SelectItem key={i} value={String(i + 1)}>{String(i + 1).padStart(2, "0")} · {m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Periodo</Label>
                <div className="text-sm mt-1 font-mono">{desde} → {hasta}</div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <ExportCard
              icon={<FileCode2 className="h-5 w-5 text-primary" />}
              title="Catálogo de cuentas (XML)"
              desc="Anexo 24 §I — Estructura del catálogo con código agrupador SAT."
              norma="Anexo 24 v1.3"
              onClick={genCatalogo}
            />

            <ExportCard
              icon={<FileCode2 className="h-5 w-5 text-primary" />}
              title="Balanza de comprobación (XML)"
              desc="Saldos iniciales, cargos, abonos y saldos finales del periodo."
              norma="Anexo 24 §II"
              extra={
                <div className="mt-3">
                  <Label className="text-xs">Tipo de envío</Label>
                  <Select value={tipoEnvio} onValueChange={(v) => setTipoEnvio(v as "N" | "C")}>
                    <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="N">N — Normal</SelectItem>
                      <SelectItem value="C">C — Complementaria</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              }
              onClick={genBalanza}
            />

            <ExportCard
              icon={<FileCode2 className="h-5 w-5 text-primary" />}
              title="Pólizas del periodo (XML)"
              desc="Pólizas asentadas con transacciones a nivel cuenta de mayor."
              norma="Anexo 24 §III"
              extra={
                <div className="mt-3">
                  <Label className="text-xs">Tipo de solicitud</Label>
                  <Select value={tipoSolicitud} onValueChange={(v) => setTipoSolicitud(v as any)}>
                    <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="AF">AF — Acto de fiscalización</SelectItem>
                      <SelectItem value="FC">FC — Fiscalización compulsa</SelectItem>
                      <SelectItem value="DE">DE — Devolución</SelectItem>
                      <SelectItem value="CO">CO — Compensación</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              }
              onClick={genPolizas}
            />

            <ExportCard
              icon={<FileSpreadsheet className="h-5 w-5 text-primary" />}
              title="DIOT (TXT)"
              desc="Declaración informativa de operaciones con terceros. Formato pipe (|) para el DEM DIOT."
              norma="Art. 32 LIVA"
              onClick={genDiot}
            />
          </div>

          <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 text-sm">
            <p className="font-medium mb-1">Antes de enviar</p>
            <ul className="text-muted-foreground text-xs space-y-1 list-disc list-inside">
              <li>Verifica que todas las cuentas de movimiento tengan código agrupador SAT.</li>
              <li>El SAT valida XSD y firma con e.firma o CSD antes de aceptar el archivo.</li>
              <li>El sellado con e.firma/CSD se realiza fuera del sistema o con el próximo módulo de sellado.</li>
              <li>DIOT genera un borrador para revisión; asegúrate que los RFC de proveedores estén completos.</li>
            </ul>
          </div>
        </>
      )}
    </section>
  );
}

function ExportCard({
  icon, title, desc, norma, extra, onClick,
}: {
  icon: React.ReactNode; title: string; desc: string; norma: string;
  extra?: React.ReactNode; onClick: () => void;
}) {
  return (
    <div className="rounded-lg border border-border p-4 flex flex-col">
      <div className="flex items-start gap-3">
        <div className="rounded-md bg-primary/10 p-2">{icon}</div>
        <div className="min-w-0 flex-1">
          <div className="font-semibold">{title}</div>
          <div className="text-xs text-muted-foreground mt-0.5">{desc}</div>
          <Badge variant="outline" className="text-[10px] mt-2">{norma}</Badge>
        </div>
      </div>
      {extra}
      <div className="mt-4">
        <Button onClick={onClick} className="w-full">
          <Download className="h-4 w-4 mr-1" /> Descargar
        </Button>
      </div>
    </div>
  );
}

/* ---------------- helpers ---------------- */

function download(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function xmlEscape(s: string | null | undefined): string {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function fmt(n: any): string {
  const v = Number(n ?? 0);
  return v.toFixed(2);
}

function buildCatalogoXml(rfc: string, year: string, month: string, rows: any[]): string {
  const lines: string[] = [];
  lines.push(`<?xml version="1.0" encoding="UTF-8"?>`);
  lines.push(
    `<catalogocuentas:Catalogo xmlns:catalogocuentas="http://www.sat.gob.mx/esquemas/ContabilidadE/1_3/CatalogoCuentas" ` +
    `xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ` +
    `xsi:schemaLocation="http://www.sat.gob.mx/esquemas/ContabilidadE/1_3/CatalogoCuentas http://www.sat.gob.mx/esquemas/ContabilidadE/1_3/CatalogoCuentas/CatalogoCuentas_1_3.xsd" ` +
    `Version="1.3" RFC="${xmlEscape(rfc)}" Mes="${month}" Anio="${year}">`
  );
  // build map of code -> parent code
  const byId = new Map<string, any>();
  rows.forEach((r) => byId.set(r.id ?? r.codigo, r));
  for (const r of rows) {
    const natur = r.naturaleza === "deudora" ? "D" : "A";
    const attrs = [
      `CodAgrup="${xmlEscape(r.codigo_agrupador ?? r.codigo)}"`,
      `NumCta="${xmlEscape(r.codigo)}"`,
      `Desc="${xmlEscape(r.nombre)}"`,
      `Nivel="${r.nivel}"`,
      `Natur="${natur}"`,
    ];
    lines.push(`  <catalogocuentas:Ctas ${attrs.join(" ")}/>`);
  }
  lines.push(`</catalogocuentas:Catalogo>`);
  return lines.join("\n");
}

function buildBalanzaXml(rfc: string, year: string, month: string, tipoEnvio: string, rows: any[]): string {
  const lines: string[] = [];
  lines.push(`<?xml version="1.0" encoding="UTF-8"?>`);
  lines.push(
    `<BCE:Balanza xmlns:BCE="http://www.sat.gob.mx/esquemas/ContabilidadE/1_3/BalanzaComprobacion" ` +
    `xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ` +
    `xsi:schemaLocation="http://www.sat.gob.mx/esquemas/ContabilidadE/1_3/BalanzaComprobacion http://www.sat.gob.mx/esquemas/ContabilidadE/1_3/BalanzaComprobacion/BalanzaComprobacion_1_3.xsd" ` +
    `Version="1.3" RFC="${xmlEscape(rfc)}" Mes="${month}" Anio="${year}" TipoEnvio="${tipoEnvio}">`
  );
  for (const r of rows) {
    const attrs = [
      `NumCta="${xmlEscape(r.codigo)}"`,
      `SaldoIni="${fmt(r.saldo_inicial)}"`,
      `Debe="${fmt(r.cargos)}"`,
      `Haber="${fmt(r.abonos)}"`,
      `SaldoFin="${fmt(r.saldo_final)}"`,
    ];
    lines.push(`  <BCE:Ctas ${attrs.join(" ")}/>`);
  }
  lines.push(`</BCE:Balanza>`);
  return lines.join("\n");
}

function buildPolizasXml(
  rfc: string, year: string, month: string, tipoSolicitud: string,
  polizas: any[], movs: any[],
): string {
  const lines: string[] = [];
  lines.push(`<?xml version="1.0" encoding="UTF-8"?>`);
  lines.push(
    `<PLZ:Polizas xmlns:PLZ="http://www.sat.gob.mx/esquemas/ContabilidadE/1_3/PolizasPeriodo" ` +
    `xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ` +
    `xsi:schemaLocation="http://www.sat.gob.mx/esquemas/ContabilidadE/1_3/PolizasPeriodo http://www.sat.gob.mx/esquemas/ContabilidadE/1_3/PolizasPeriodo/PolizasPeriodo_1_3.xsd" ` +
    `Version="1.3" RFC="${xmlEscape(rfc)}" Mes="${month}" Anio="${year}" TipoSolicitud="${tipoSolicitud}">`
  );
  const byPol = new Map<string, any[]>();
  for (const m of movs) {
    const arr = byPol.get(m.poliza_id) ?? [];
    arr.push(m);
    byPol.set(m.poliza_id, arr);
  }
  for (const p of polizas) {
    const attrs = [
      `NumUnIdenPol="${xmlEscape(p.folio)}"`,
      `Fecha="${p.fecha}"`,
      `Concepto="${xmlEscape(p.concepto ?? p.folio)}"`,
    ];
    lines.push(`  <PLZ:Poliza ${attrs.join(" ")}>`);
    for (const m of byPol.get(p.id) ?? []) {
      const cta = m.cuentas_contables?.codigo ?? "";
      const tAttrs = [
        `NumCta="${xmlEscape(cta)}"`,
        `DesTrans="${xmlEscape(m.concepto ?? p.concepto ?? "")}"`,
        `Debe="${fmt(m.cargo)}"`,
        `Haber="${fmt(m.abono)}"`,
      ];
      lines.push(`    <PLZ:Transaccion ${tAttrs.join(" ")}/>`);
    }
    lines.push(`  </PLZ:Poliza>`);
  }
  lines.push(`</PLZ:Polizas>`);
  return lines.join("\n");
}

function buildDiotTxt(rows: any[]): string {
  // Aggregated by tasa — DIOT proper needs per-proveedor RFC rows.
  // Formato pipe: TipoTercero|TipoOperacion|RFC|IdFiscal|Nombre|Pais|Nacionalidad|IVA16|IVA16NoAcred|IVA8|IVA8NoAcred|IVA0|Exentos|Retenciones|...
  // Emitimos una fila resumen por tasa marcada como "05" (Global) — el usuario debe complementar con RFC por proveedor.
  const iva16 = rows.filter((r) => r.tipo === "iva_acreditable" && Number(r.tasa) === 16)
    .reduce((s, r) => s + Number(r.base), 0);
  const iva8 = rows.filter((r) => r.tipo === "iva_acreditable" && Number(r.tasa) === 8)
    .reduce((s, r) => s + Number(r.base), 0);
  const iva0 = rows.filter((r) => r.tipo === "iva_acreditable" && Number(r.tasa) === 0)
    .reduce((s, r) => s + Number(r.base), 0);
  const iva16Monto = rows.filter((r) => r.tipo === "iva_acreditable" && Number(r.tasa) === 16)
    .reduce((s, r) => s + Number(r.monto), 0);
  const iva8Monto = rows.filter((r) => r.tipo === "iva_acreditable" && Number(r.tasa) === 8)
    .reduce((s, r) => s + Number(r.monto), 0);

  // Row layout (DIOT 2024 pipe):
  // 04 = Proveedor global, 85 = Otros
  const line = [
    "04",             // Tipo de tercero (proveedor nacional)
    "85",             // Tipo de operación (otros)
    "",               // RFC proveedor (a completar por usuario)
    "",               // Número Id fiscal (extranjero)
    "PROVEEDOR GLOBAL",
    "",               // País
    "",               // Nacionalidad
    Math.round(iva16).toString(),          // Valor actos 15/16% IVA acreditable
    "0",                                    // Actos 15/16% no acreditable
    Math.round(iva8).toString(),           // Actos 8/11% IVA fronteriza
    "0",
    Math.round(iva0).toString(),           // Actos tasa 0
    "0",                                    // Actos exentos
    "0",                                    // Importación 15/16%
    "0", "0", "0", "0", "0", "0",
    Math.round(iva16Monto + iva8Monto).toString(), // IVA retenido
    "0",
  ].join("|");

  return line + "\r\n";
}
