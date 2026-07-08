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
  const qc = useQueryClient();
  const [year, setYear] = useState<number>(defaultYear);
  const [month, setMonth] = useState<number>(defaultMonth);
  const [tipoEnvio, setTipoEnvio] = useState<"N" | "C">("N");
  const [tipoSolicitud, setTipoSolicitud] = useState<"AF" | "FC" | "DE" | "CO">("AF");
  const [signOpen, setSignOpen] = useState<null | "cat" | "bal" | "pol" | "zip">(null);
  const [passphrase, setPassphrase] = useState("");
  const [signing, setSigning] = useState(false);

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

  // ------- CSD info -------
  const getCsdInfoFn = useServerFn(getCsdInfo);
  const signFn = useServerFn(signContabilidadXml);
  const { data: csdInfo } = useQuery({
    queryKey: ["csd-info", empresaId],
    enabled: !!empresaId,
    queryFn: async () => (empresaId ? await getCsdInfoFn({ data: { empresaId } }) : null),
  });

  // ------- Build XML helpers (data-driven, no side effects) -------
  const buildCatalogoData = async (): Promise<string> => {
    const { data, error } = await supabase
      .from("cuentas_contables" as any)
      .select("codigo, codigo_agrupador, nombre, nivel, naturaleza, padre_id, permite_movimientos, activa")
      .eq("empresa_id", empresaId!).eq("activa", true).order("codigo");
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as any[];
    const missing = rows.filter((r) => r.permite_movimientos && !r.codigo_agrupador);
    if (missing.length > 0) toast.warning(`${missing.length} cuentas de movimiento no tienen código agrupador SAT`);
    return buildCatalogoXml(rfc, yearStr, mesStr, rows);
  };

  const buildBalanzaData = async (): Promise<string> => {
    const { data, error } = await supabase.rpc("balanza_de_comprobacion" as any, {
      _empresa: empresaId!, _desde: desde, _hasta: hasta,
    });
    if (error) throw new Error(error.message);
    return buildBalanzaXml(rfc, yearStr, mesStr, tipoEnvio, (data ?? []) as any[]);
  };

  const buildPolizasData = async (): Promise<string | null> => {
    const { data: polizas, error: e1 } = await supabase
      .from("polizas" as any)
      .select("id, folio, tipo, fecha, concepto, estado")
      .eq("empresa_id", empresaId!).eq("estado", "asentada")
      .gte("fecha", desde).lte("fecha", hasta).order("fecha").order("folio");
    if (e1) throw new Error(e1.message);
    const ids = (polizas ?? []).map((p: any) => p.id);
    if (ids.length === 0) return null;
    const { data: movs, error: e2 } = await supabase
      .from("poliza_movimientos" as any)
      .select("poliza_id, cargo, abono, concepto, uuid_cfdi, cuentas_contables!inner(codigo)")
      .in("poliza_id", ids).order("orden");
    if (e2) throw new Error(e2.message);
    return buildPolizasXml(rfc, yearStr, mesStr, tipoSolicitud, polizas ?? [], movs ?? []);
  };

  const buildDiotData = async (): Promise<{ txt: string; warn?: string }> => {
    // 1) Pólizas asentadas del periodo con sus impuestos acreditables
    const { data: polizas, error: eP } = await supabase
      .from("polizas" as any)
      .select("id, poliza_impuestos(tipo, tasa, base, monto)")
      .eq("empresa_id", empresaId!)
      .eq("estado", "asentada")
      .gte("fecha", desde).lte("fecha", hasta);
    if (eP) throw new Error(eP.message);
    const polizaIds = (polizas ?? []).map((p: any) => p.id);
    if (polizaIds.length === 0) return { txt: "", warn: "Sin pólizas en el periodo" };

    // 2) Ligar cada póliza a un proveedor vía poliza_movimientos.oc_id
    const { data: movs, error: eM } = await supabase
      .from("poliza_movimientos" as any)
      .select("poliza_id, oc_id")
      .in("poliza_id", polizaIds).not("oc_id", "is", null);
    if (eM) throw new Error(eM.message);
    const ocIds = Array.from(new Set((movs ?? []).map((m: any) => m.oc_id).filter(Boolean)));

    let ocMap = new Map<string, string>(); // oc_id -> laboratorio_id
    let provMap = new Map<string, any>(); // laboratorio_id -> proveedor row
    if (ocIds.length) {
      const { data: ocs, error: eO } = await supabase
        .from("ordenes_compra" as any).select("id, laboratorio_id").in("id", ocIds);
      if (eO) throw new Error(eO.message);
      (ocs ?? []).forEach((o: any) => o.laboratorio_id && ocMap.set(o.id, o.laboratorio_id));
      const labIds = Array.from(new Set([...ocMap.values()]));
      if (labIds.length) {
        const { data: labs, error: eL } = await supabase
          .from("laboratorios" as any)
          .select("id, nombre, rfc, tipo_tercero, tipo_operacion, pais, nacionalidad, id_fiscal_extranjero")
          .in("id", labIds);
        if (eL) throw new Error(eL.message);
        (labs ?? []).forEach((l: any) => provMap.set(l.id, l));
      }
    }

    // poliza_id -> laboratorio_id (primera OC encontrada)
    const polToLab = new Map<string, string>();
    (movs ?? []).forEach((m: any) => {
      if (polToLab.has(m.poliza_id)) return;
      const lab = ocMap.get(m.oc_id);
      if (lab) polToLab.set(m.poliza_id, lab);
    });

    // 3) Agregar por proveedor (con RFC) — sin proveedor va a "PROVEEDOR GLOBAL" (15)
    type Agg = { base16: number; base8: number; base0: number; retIva: number };
    const perProv = new Map<string, Agg>(); // key = laboratorio_id | "__global__"
    for (const p of (polizas ?? []) as any[]) {
      const key = polToLab.get(p.id) ?? "__global__";
      const a = perProv.get(key) ?? { base16: 0, base8: 0, base0: 0, retIva: 0 };
      for (const t of (p.poliza_impuestos ?? [])) {
        const tasa = Number(t.tasa);
        const base = Number(t.base) || 0;
        const monto = Number(t.monto) || 0;
        if (t.tipo === "iva_acreditable") {
          if (tasa === 16) a.base16 += base;
          else if (tasa === 8) a.base8 += base;
          else if (tasa === 0) a.base0 += base;
        } else if (t.tipo === "iva_retenido") {
          a.retIva += monto;
        }
      }
      perProv.set(key, a);
    }

    // 4) Emitir renglones DIOT
    const lines: string[] = [];
    let missingRfc = 0;
    for (const [labId, a] of perProv) {
      if (a.base16 === 0 && a.base8 === 0 && a.base0 === 0 && a.retIva === 0) continue;
      const prov = labId === "__global__" ? null : provMap.get(labId);
      const rfc = (prov?.rfc ?? "").trim().toUpperCase();
      if (!rfc && labId !== "__global__") missingRfc++;
      lines.push(diotLine({
        tipoTercero: rfc ? (prov?.tipo_tercero ?? "04") : "15",
        tipoOperacion: prov?.tipo_operacion ?? "85",
        rfc,
        idFiscal: prov?.id_fiscal_extranjero ?? "",
        nombre: prov?.nombre ?? "",
        pais: prov?.pais ?? "",
        nacionalidad: prov?.nacionalidad ?? "",
        base16: a.base16, base8: a.base8, base0: a.base0, retIva: a.retIva,
      }));
    }
    const warn = missingRfc > 0
      ? `${missingRfc} proveedor(es) sin RFC — captúralos en Proveedores > Datos fiscales`
      : undefined;
    return { txt: lines.join("\r\n") + (lines.length ? "\r\n" : ""), warn };
  };

  // ------- Download (sin sello) -------
  const genCatalogo = async () => {
    if (!empresaId) return toast.error("Selecciona empresa");
    if (!rfc) return toast.error("La empresa no tiene RFC");
    try {
      const xml = await buildCatalogoData();
      download(`CatalogoCuentas_${rfc}_${yearStr}${mesStr}.xml`, xml, "application/xml");
      toast.success("Catálogo de cuentas generado (sin sello)");
    } catch (e: any) { toast.error(e.message); }
  };

  const genBalanza = async () => {
    if (!empresaId) return toast.error("Selecciona empresa");
    if (!rfc) return toast.error("La empresa no tiene RFC");
    try {
      const xml = await buildBalanzaData();
      download(`Balanza_${rfc}_${yearStr}${mesStr}_${tipoEnvio}.xml`, xml, "application/xml");
      toast.success("Balanza generada (sin sello)");
    } catch (e: any) { toast.error(e.message); }
  };

  const genPolizas = async () => {
    if (!empresaId) return toast.error("Selecciona empresa");
    if (!rfc) return toast.error("La empresa no tiene RFC");
    try {
      const xml = await buildPolizasData();
      if (!xml) return toast.warning("No hay pólizas asentadas en el periodo");
      download(`Polizas_${rfc}_${yearStr}${mesStr}_${tipoSolicitud}.xml`, xml, "application/xml");
      toast.success("Pólizas generadas (sin sello)");
    } catch (e: any) { toast.error(e.message); }
  };

  const genDiot = async () => {
    if (!empresaId) return toast.error("Selecciona empresa");
    try {
      const txt = await buildDiotData();
      download(`DIOT_${rfc || "SIN_RFC"}_${yearStr}${mesStr}.txt`, txt, "text/plain");
      toast.success("DIOT TXT generado (borrador — revisar RFC de proveedores)");
    } catch (e: any) { toast.error(e.message); }
  };

  // ------- Sign flow -------
  const openSign = (which: "cat" | "bal" | "pol" | "zip") => {
    if (!empresaId) return toast.error("Selecciona empresa");
    if (!csdInfo) return toast.error("Sube primero el CSD de la empresa");
    setPassphrase("");
    setSignOpen(which);
  };

  const doSign = async () => {
    if (!signOpen || !empresaId) return;
    if (!passphrase.trim()) return toast.error("Captura la contraseña del .key");
    setSigning(true);
    try {
      if (signOpen === "cat") {
        const xml = await buildCatalogoData();
        const r = await signFn({ data: { empresaId, xml, passphrase } });
        download(`CatalogoCuentas_${rfc}_${yearStr}${mesStr}.xml`, r.xml, "application/xml");
        toast.success("Catálogo sellado ✓");
      } else if (signOpen === "bal") {
        const xml = await buildBalanzaData();
        const r = await signFn({ data: { empresaId, xml, passphrase } });
        download(`Balanza_${rfc}_${yearStr}${mesStr}_${tipoEnvio}.xml`, r.xml, "application/xml");
        toast.success("Balanza sellada ✓");
      } else if (signOpen === "pol") {
        const xml = await buildPolizasData();
        if (!xml) { toast.warning("Sin pólizas asentadas"); setSigning(false); setSignOpen(null); return; }
        const r = await signFn({ data: { empresaId, xml, passphrase } });
        download(`Polizas_${rfc}_${yearStr}${mesStr}_${tipoSolicitud}.xml`, r.xml, "application/xml");
        toast.success("Pólizas selladas ✓");
      } else if (signOpen === "zip") {
        // Empaqueta Catálogo + Balanza (y Pólizas si hay), todos sellados
        const zip = new JSZip();
        const [catXml, balXml, polXml] = await Promise.all([
          buildCatalogoData(),
          buildBalanzaData(),
          buildPolizasData().catch(() => null),
        ]);
        const catSigned = await signFn({ data: { empresaId, xml: catXml, passphrase } });
        zip.file(`${rfc}${yearStr}${mesStr}CT.xml`, catSigned.xml);
        const balSigned = await signFn({ data: { empresaId, xml: balXml, passphrase } });
        zip.file(`${rfc}${yearStr}${mesStr}B${tipoEnvio}.xml`, balSigned.xml);
        if (polXml) {
          const polSigned = await signFn({ data: { empresaId, xml: polXml, passphrase } });
          zip.file(`${rfc}${yearStr}${mesStr}PL.xml`, polSigned.xml);
        }
        const blob = await zip.generateAsync({ type: "blob" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = `ContabilidadElectronica_${rfc}_${yearStr}${mesStr}.zip`;
        a.click(); URL.revokeObjectURL(url);
        toast.success("ZIP para SAT generado — abre el Buzón Tributario para subirlo");
      }
      setSignOpen(null);
      setPassphrase("");
    } catch (e: any) {
      toast.error(e.message ?? "Error al sellar");
    } finally {
      setSigning(false);
    }
  };

  const openBuzon = () => {
    window.open("https://contabilidadelectronica.sat.gob.mx/", "_blank", "noopener,noreferrer");
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

          {/* Sección CSD */}
          <CsdSection empresaId={empresaId} csdInfo={csdInfo} onChanged={() => qc.invalidateQueries({ queryKey: ["csd-info", empresaId] })} />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <ExportCard
              icon={<FileCode2 className="h-5 w-5 text-primary" />}
              title="Catálogo de cuentas (XML)"
              desc="Anexo 24 §I — Estructura del catálogo con código agrupador SAT."
              norma="Anexo 24 v1.3"
              onDownload={genCatalogo}
              onSign={() => openSign("cat")}
              canSign={!!csdInfo}
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
              onDownload={genBalanza}
              onSign={() => openSign("bal")}
              canSign={!!csdInfo}
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
              onDownload={genPolizas}
              onSign={() => openSign("pol")}
              canSign={!!csdInfo}
            />

            <ExportCard
              icon={<FileSpreadsheet className="h-5 w-5 text-primary" />}
              title="DIOT (TXT)"
              desc="Declaración informativa de operaciones con terceros. Formato pipe (|) para el DEM DIOT."
              norma="Art. 32 LIVA"
              onDownload={genDiot}
            />
          </div>

          {/* Envío al Buzón Tributario */}
          <div className="rounded-lg border-2 border-primary/40 bg-primary/5 p-4">
            <div className="flex items-start gap-3">
              <div className="rounded-md bg-primary/10 p-2"><Archive className="h-5 w-5 text-primary" /></div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold">Enviar al Buzón Tributario</div>
                <p className="text-xs text-muted-foreground mt-1">
                  Sellamos Catálogo + Balanza (+ Pólizas si hay) con tu CSD y armamos un ZIP con los nombres de archivo exigidos por el SAT
                  (<span className="font-mono">RFC+AAAAMM+Tipo.xml</span>). Después abrimos el portal oficial para que subas el ZIP.
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  El SAT no ofrece un API público para envío directo — la carga se hace en su portal autenticado con RFC+contraseña o e.firma.
                </p>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button onClick={() => openSign("zip")} disabled={!csdInfo}>
                <ShieldCheck className="h-4 w-4 mr-1" /> Sellar y armar ZIP
              </Button>
              <Button variant="outline" onClick={openBuzon}>
                <ExternalLink className="h-4 w-4 mr-1" /> Abrir portal SAT
              </Button>
            </div>
            {!csdInfo && (
              <p className="text-xs text-destructive mt-2">Sube el CSD arriba para habilitar el sellado.</p>
            )}
          </div>

          <div className="rounded-lg border border-border p-4 text-xs text-muted-foreground space-y-1">
            <p className="font-medium text-foreground text-sm mb-1">Notas</p>
            <ul className="list-disc list-inside space-y-1">
              <li>Verifica que todas las cuentas de movimiento tengan código agrupador SAT antes de sellar.</li>
              <li>El sellado usa el <strong>CSD</strong> (no la e.firma) — es lo que exige el Anexo 24.</li>
              <li>La contraseña del <span className="font-mono">.key</span> no se guarda: se pide cada vez que sellas.</li>
              <li>DIOT genera un borrador — completa los RFC de proveedores antes de enviarla.</li>
            </ul>
          </div>
        </>
      )}

      {/* Modal de contraseña para sellar */}
      <Dialog open={!!signOpen} onOpenChange={(o) => { if (!o) { setSignOpen(null); setPassphrase(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><KeyRound className="h-5 w-5" /> Contraseña del CSD</DialogTitle>
            <DialogDescription>
              Captura la contraseña de la llave privada (.key) del CSD. La contraseña no se guarda — solo se usa para esta operación.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label className="text-xs">Contraseña del .key</Label>
            <Input
              type="password"
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              autoFocus
              onKeyDown={(e) => { if (e.key === "Enter" && !signing) doSign(); }}
              placeholder="••••••••"
            />
            {csdInfo && (
              <div className="text-xs text-muted-foreground pt-1">
                CSD activo: <span className="font-mono">{csdInfo.no_certificado}</span> ·
                RFC <span className="font-mono">{csdInfo.rfc}</span> ·
                vence {new Date(csdInfo.valid_to).toLocaleDateString("es-MX")}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSignOpen(null)} disabled={signing}>Cancelar</Button>
            <Button onClick={doSign} disabled={signing || !passphrase.trim()}>
              {signing ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Sellando…</> : <><ShieldCheck className="h-4 w-4 mr-1" /> Sellar</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

/* --------------- CSD Section --------------- */

function CsdSection({
  empresaId, csdInfo, onChanged,
}: {
  empresaId: string;
  csdInfo: any;
  onChanged: () => void;
}) {
  const [cerFile, setCerFile] = useState<File | null>(null);
  const [keyFile, setKeyFile] = useState<File | null>(null);
  const [pw, setPw] = useState("");
  const [uploading, setUploading] = useState(false);
  const uploadFn = useServerFn(uploadCsd);
  const deleteFn = useServerFn(deleteCsd);

  const onUpload = async () => {
    if (!cerFile || !keyFile) return toast.error("Selecciona .cer y .key");
    if (!pw.trim()) return toast.error("Captura la contraseña del .key");
    setUploading(true);
    try {
      const cerB64 = await fileToBase64(cerFile);
      const keyB64 = await fileToBase64(keyFile);
      const r = await uploadFn({ data: { empresaId, cerBase64: cerB64, keyBase64: keyB64, passphrase: pw } });
      toast.success(`CSD registrado (${r.rfc} · ${r.noCertificado})`);
      setCerFile(null); setKeyFile(null); setPw("");
      onChanged();
    } catch (e: any) {
      toast.error(e.message ?? "No se pudo registrar el CSD");
    } finally {
      setUploading(false);
    }
  };

  const onDelete = async () => {
    if (!confirm("¿Quitar el CSD de esta empresa?")) return;
    try {
      await deleteFn({ data: { empresaId } });
      toast.success("CSD eliminado");
      onChanged();
    } catch (e: any) { toast.error(e.message); }
  };

  const vencido = csdInfo && new Date(csdInfo.valid_to) < new Date();

  return (
    <div className="rounded-lg border border-border p-4">
      <div className="flex items-center gap-2 mb-3">
        <ShieldCheck className={`h-5 w-5 ${csdInfo ? (vencido ? "text-destructive" : "text-emerald-600") : "text-muted-foreground"}`} />
        <h2 className="font-semibold">Certificado de Sello Digital (CSD)</h2>
        {csdInfo && !vencido && <Badge variant="outline" className="text-emerald-700 border-emerald-500/30">Activo</Badge>}
        {vencido && <Badge variant="destructive">Vencido</Badge>}
      </div>

      {csdInfo ? (
        <div className="space-y-2 text-sm">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            <div><Label className="text-[10px] uppercase text-muted-foreground">RFC</Label><div className="font-mono">{csdInfo.rfc}</div></div>
            <div><Label className="text-[10px] uppercase text-muted-foreground">No. certificado</Label><div className="font-mono truncate">{csdInfo.no_certificado}</div></div>
            <div><Label className="text-[10px] uppercase text-muted-foreground">Vigente desde</Label><div>{new Date(csdInfo.valid_from).toLocaleDateString("es-MX")}</div></div>
            <div><Label className="text-[10px] uppercase text-muted-foreground">Vence</Label><div className={vencido ? "text-destructive font-medium" : ""}>{new Date(csdInfo.valid_to).toLocaleDateString("es-MX")}</div></div>
          </div>
          <div className="pt-2">
            <Button variant="outline" size="sm" onClick={onDelete}>
              <Trash2 className="h-4 w-4 mr-1" /> Quitar CSD
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Sube el .cer y .key de tu CSD (no e.firma). Se guardan cifrados en storage privado. La contraseña del .key no se guarda.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <Label className="text-xs">Archivo .cer</Label>
              <Input type="file" accept=".cer" onChange={(e) => setCerFile(e.target.files?.[0] ?? null)} />
            </div>
            <div>
              <Label className="text-xs">Archivo .key</Label>
              <Input type="file" accept=".key" onChange={(e) => setKeyFile(e.target.files?.[0] ?? null)} />
            </div>
            <div>
              <Label className="text-xs">Contraseña del .key</Label>
              <Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="••••••••" />
            </div>
          </div>
          <Button onClick={onUpload} disabled={uploading || !cerFile || !keyFile || !pw}>
            {uploading ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Validando…</> : <><Upload className="h-4 w-4 mr-1" /> Registrar CSD</>}
          </Button>
        </div>
      )}
    </div>
  );
}

async function fileToBase64(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function ExportCard({
  icon, title, desc, norma, extra, onDownload, onSign, canSign,
}: {
  icon: React.ReactNode; title: string; desc: string; norma: string;
  extra?: React.ReactNode;
  onDownload: () => void | Promise<unknown>;
  onSign?: () => void;
  canSign?: boolean;
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
      <div className="mt-4 flex gap-2">
        <Button variant="outline" onClick={() => onDownload()} className="flex-1">
          <Download className="h-4 w-4 mr-1" /> Sin sellar
        </Button>
        {onSign && (
          <Button onClick={onSign} disabled={!canSign} className="flex-1">
            <ShieldCheck className="h-4 w-4 mr-1" /> Sellar
          </Button>
        )}
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
