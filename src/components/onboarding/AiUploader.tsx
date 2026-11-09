import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { analyzeOnboardingDocFn } from "@/lib/valinor.functions";
import {
 parseSheet,
 importProductos,
 importPriceList,
 importClientes,
 importLaboratorios,
 importRepresentantes,
  type ImportResult,
} from "@/lib/onboarding-import";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

import type { Item } from "./types";
/* ───────────────────────── AI Uploader ───────────────────────── */

type ExtraFill = { clave: string; valor_texto?: string; notas?: string };

type Suggestion = {
  categoria?: string;
  item_clave_sugerida?: string | null;
  confianza?: number;
  resumen?: string;
  campos?: Record<string, string>;
  texto_para_notas?: string;
  extra_fills?: ExtraFill[];
};

// Map de nombres de campo (en español, sin acentos, minúsculas) → clave del item de onboarding.
const FIELD_TO_CLAVE: Record<string, string> = {
  rfc: "rfc",
  razon_social: "razon_social",
  razonsocial: "razon_social",
  nombre: "razon_social",
  regimen_fiscal: "regimen_fiscal",
  regimen_capital: "regimen_fiscal",
  regimencapital: "regimen_fiscal",
  representante_legal: "representante_legal",
  representantelegal: "representante_legal",
};

// Campos de domicilio que se concatenan en "direccion_fiscal".
const DIRECCION_FIELDS = [
  "calle",
  "nombre_vialidad",
  "tipo_vialidad",
  "numero_exterior",
  "numero_interior",
  "colonia",
  "localidad",
  "municipio",
  "entidad_federativa",
  "estado",
  "codigo_postal",
  "cp",
];

function norm(k: string): string {
  return k
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

function deriveExtrasFromCampos(
  campos: Record<string, string> | undefined,
  validClaves: Set<string>,
  excludeClave: string,
): ExtraFill[] {
  if (!campos) return [];
  const out: ExtraFill[] = [];
  const seen = new Set<string>();

  // Mapeos directos
  for (const [k, v] of Object.entries(campos)) {
    if (!v) continue;
    const nk = norm(k);
    const clave = FIELD_TO_CLAVE[nk];
    if (clave && validClaves.has(clave) && clave !== excludeClave && !seen.has(clave)) {
      seen.add(clave);
      out.push({ clave, valor_texto: String(v).trim() });
    }
  }

  // Dirección fiscal compuesta
  if (validClaves.has("direccion_fiscal") && excludeClave !== "direccion_fiscal" && !seen.has("direccion_fiscal")) {
    const parts: string[] = [];
    const getC = (key: string) => {
      for (const [k, v] of Object.entries(campos)) {
        if (norm(k) === key && v) return String(v).trim();
      }
      return null;
    };
    const tipo = getC("tipo_vialidad");
    const nombreV = getC("nombre_vialidad") ?? getC("calle");
    if (nombreV) parts.push([tipo, nombreV].filter(Boolean).join(" "));
    const numExt = getC("numero_exterior");
    if (numExt) parts.push(`No. ${numExt}`);
    const numInt = getC("numero_interior");
    if (numInt) parts.push(`Int. ${numInt}`);
    const colonia = getC("colonia");
    if (colonia) parts.push(`Col. ${colonia}`);
    const cp = getC("codigo_postal") ?? getC("cp");
    if (cp) parts.push(`CP ${cp}`);
    const mun = getC("municipio") ?? getC("localidad") ?? getC("delegacion");
    if (mun) parts.push(mun);
    const edo = getC("entidad_federativa") ?? getC("estado");
    if (edo) parts.push(edo);
    if (parts.length > 0) {
      out.push({ clave: "direccion_fiscal", valor_texto: parts.join(", ") });
    }
  }

  return out;
}

/**
 * Build a patch for `empresa_datos` from AI-extracted campos.
 * Returns null if there's nothing relevant.
 */
function buildEmpresaPatch(
  campos: Record<string, string> | undefined,
): Record<string, string> | null {
  if (!campos) return null;
  const get = (...keys: string[]) => {
    for (const [k, v] of Object.entries(campos)) {
      const nk = norm(k);
      if (keys.includes(nk) && v) return String(v).trim();
    }
    return null;
  };
  const patch: Record<string, string> = {};
  const rfc = get("rfc");
  if (rfc) patch.rfc = rfc;
  const razon = get("razon_social", "razonsocial", "nombre", "denominacion");
  if (razon) patch.razon_social = razon;
  const reg = get("regimen_fiscal", "regimencapital", "regimen_capital");
  if (reg) patch.regimen_fiscal = reg;
  const rep = get("representante_legal", "representantelegal");
  if (rep) patch.representante_legal = rep;
  const cp = get("codigo_postal", "cp");
  if (cp) patch.cp_fiscal = cp;

  // Compose direccion_fiscal
  const tipo = get("tipo_vialidad");
  const nombreV = get("nombre_vialidad", "calle");
  const numExt = get("numero_exterior");
  const numInt = get("numero_interior");
  const colonia = get("colonia");
  const mun = get("municipio", "localidad", "delegacion");
  const edo = get("entidad_federativa", "estado");
  const parts: string[] = [];
  if (nombreV) parts.push([tipo, nombreV].filter(Boolean).join(" "));
  if (numExt) parts.push(`No. ${numExt}`);
  if (numInt) parts.push(`Int. ${numInt}`);
  if (colonia) parts.push(`Col. ${colonia}`);
  if (cp) parts.push(`CP ${cp}`);
  if (mun) parts.push(mun);
  if (edo) parts.push(edo);
  if (parts.length > 0) patch.direccion_fiscal = parts.join(", ");

  return Object.keys(patch).length > 0 ? patch : null;
}

function combineExtras(
  suggestion: Suggestion | null,
  items: Item[],
  excludeClave: string,
): ExtraFill[] {
  const validClaves = new Set(items.map((i) => i.clave));
  const aiList = (suggestion?.extra_fills ?? []).filter(
    (ef) => ef.clave && validClaves.has(ef.clave) && ef.clave !== excludeClave,
  );
  const derived = deriveExtrasFromCampos(suggestion?.campos, validClaves, excludeClave);
  const byClave = new Map<string, ExtraFill>();
  for (const ef of [...aiList, ...derived]) {
    if (!byClave.has(ef.clave)) byClave.set(ef.clave, ef);
  }
  return Array.from(byClave.values());
}

export function AiUploader({
  items,
  onCommitted,
}: {
  items: Item[];
  onCommitted: () => Promise<void> | void;
}) {
  const analyze = useServerFn(analyzeOnboardingDocFn);
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [targetClave, setTargetClave] = useState<string>("");
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [extraSelected, setExtraSelected] = useState<Record<string, boolean>>({});
  const [importSummary, setImportSummary] = useState<string | null>(null);

  const handleFiles = async (f: File | null) => {
    if (!f) return;
    setError(null);
    if (f.size > 10 * 1024 * 1024) {
      setError("Archivo demasiado grande (máx 10 MB).");
      return;
    }
    setFile(f);
    setBusy(true);
    try {
      const buf = await f.arrayBuffer();
      // base64 en chunks para evitar stack overflow
      let bin = "";
      const bytes = new Uint8Array(buf);
      const CHUNK = 0x8000;
      for (let i = 0; i < bytes.length; i += CHUNK) {
        bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
      }
      const base64 = btoa(bin);
      const res = await analyze({
        data: {
          filename: f.name,
          mime: f.type || "application/octet-stream",
          base64,
        },
      });
      const s = (res.suggestion ?? null) as Suggestion | null;
      setSuggestion(s);
      setTargetClave(s?.item_clave_sugerida ?? "");
      // Pre-seleccionar todos los extras (AI + derivados de campos) válidos
      const sel: Record<string, boolean> = {};
      for (const ef of combineExtras(s, items, s?.item_clave_sugerida ?? "")) {
        sel[ef.clave] = true;
      }
      setExtraSelected(sel);
      setOpen(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const commit = async () => {
    if (!file || !targetClave) return;
    const item = items.find((i) => i.clave === targetClave);
    if (!item) {
      setError("Selecciona un item válido.");
      return;
    }
    setSaving(true);
    try {
      const path = `${item.clave}/${Date.now()}_${file.name}`;
      const up = await supabase.storage
        .from("onboarding")
        .upload(path, file, { upsert: false });
      if (up.error) throw up.error;

      const { data: u } = await supabase.auth.getUser();
      const ins = await supabase.from("onboarding_archivos").insert({
        item_id: item.id,
        storage_path: path,
        nombre_original: file.name,
        mime_type: file.type,
        size_bytes: file.size,
        uploaded_by: u.user?.id,
      });
      if (ins.error) throw ins.error;

      const camposText = suggestion?.campos
        ? Object.entries(suggestion.campos)
            .map(([k, v]) => `${k}: ${v}`)
            .join(" · ")
        : "";
      await supabase
        .from("onboarding_items")
        .update({
          estado: "entregado",
          notas:
            [item.notas, suggestion?.texto_para_notas ?? suggestion?.resumen]
              .filter(Boolean)
              .join("\n") || null,
          valor_texto: camposText || item.valor_texto,
        })
        .eq("id", item.id);

      // Aplicar pre-llenados extra a otros items (AI + derivados)
      const extras = combineExtras(suggestion, items, item.clave).filter(
        (ef) => extraSelected[ef.clave],
      );
      for (const ef of extras) {
        const target = items.find((i) => i.clave === ef.clave);
        if (!target) continue;
        const newNotas =
          [target.notas, ef.notas].filter(Boolean).join("\n") || null;
        const patch: Record<string, unknown> = {
          notas: newNotas,
          estado: ef.valor_texto ? "entregado" : target.estado,
        };
        if (ef.valor_texto && !target.requiere_archivo) {
          patch.valor_texto = ef.valor_texto;
        }
        await supabase.from("onboarding_items").update(patch).eq("id", target.id);
      }

      // Si el documento es de categoría "empresa" (p. ej. Constancia de
      // Situación Fiscal), sincronizar también la tabla `empresa_datos` para
      // que RFC, razón social, régimen y dirección queden disponibles para
      // facturación, PDFs, etc.
      const isEmpresaDoc =
        item.categoria === "empresa" || suggestion?.categoria === "empresa";
      if (isEmpresaDoc) {
        const empresaPatch = buildEmpresaPatch(suggestion?.campos);
        if (empresaPatch) {
          await supabase.from("empresa_datos").update(empresaPatch).eq("id", 1);
        }
      }

      // Si el documento es un catálogo de productos o una lista de precios
      // (XLSX/CSV) intentamos parsearlo e importarlo a las tablas de negocio.
      const isCatalogo =
        item.categoria === "catalogos" || item.clave === "catalogo_productos";
      const isPrecios =
        item.categoria === "precios" ||
        item.clave?.startsWith("lista_precios") ||
        item.clave === "precios_cliente";
      const isClientes = item.clave === "catalogo_clientes";
      const isLaboratorios = item.clave === "catalogo_laboratorios";
      const isRepresentantes = item.clave === "catalogo_representantes";
      const looksLikeSheet =
        /\.(xlsx|xls|csv)$/i.test(file.name) ||
        file.type.includes("spreadsheet") ||
        file.type.includes("excel") ||
        file.type === "text/csv";

      if (
        (isCatalogo || isPrecios || isClientes || isLaboratorios || isRepresentantes) &&
        looksLikeSheet
      ) {
        try {
          const rows = await parseSheet(file);
          let result: ImportResult | null = null;
          if (isClientes) {
            result = await importClientes(rows);
          } else if (isLaboratorios) {
            result = await importLaboratorios(rows);
          } else if (isRepresentantes) {
            result = await importRepresentantes(rows);
          } else if (isPrecios) {
            const listName = file.name.replace(/\.(xlsx|xls|csv)$/i, "");
            result = await importPriceList(listName, rows);
          } else if (isCatalogo) {
            result = await importProductos(rows);
          }
          if (result) {
            setImportSummary(
              `Importadas ${result.inserted} nuevas, ${result.updated} actualizadas` +
                (result.skipped ? `, ${result.skipped} omitidas` : "") +
                (result.errors.length
                  ? `. Errores: ${result.errors.slice(0, 3).join("; ")}${
                      result.errors.length > 3 ? "…" : ""
                    }`
                  : ""),
            );
          }
        } catch (e) {
          setImportSummary(`No se pudo importar el archivo: ${(e as Error).message}`);
        }
      }



      await onCommitted();
      setOpen(false);
      setFile(null);
      setSuggestion(null);
      setExtraSelected({});
      if (importSummary) {
        alert(importSummary);
        setImportSummary(null);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          handleFiles(e.dataTransfer.files?.[0] ?? null);
        }}
        className={`flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed px-6 py-8 text-center text-sm transition-colors ${
          drag
            ? "border-primary bg-primary/5"
            : "border-border hover:bg-accent/30"
        }`}
      >
        <input
          type="file"
          className="hidden"
          accept="application/pdf,image/*,text/plain"
          onChange={(e) => {
            handleFiles(e.target.files?.[0] ?? null);
            e.target.value = "";
          }}
        />
        <span className="font-medium">
          {busy
            ? `Analizando ${file?.name ?? ""}…`
            : "Subir o arrastrar documento (IA lo clasifica)"}
        </span>
        <span className="text-xs text-muted-foreground">
          PDF, imágenes o texto · Gemini vía Valinor decide la categoría
        </span>
        {error && <span className="mt-1 text-xs text-destructive">{error}</span>}
      </label>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Revisar clasificación IA</DialogTitle>
          </DialogHeader>

          {suggestion ? (
            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  Categoría sugerida:{" "}
                  <strong className="text-foreground">
                    {suggestion.categoria ?? "—"}
                  </strong>
                </span>
                <span>
                  Confianza:{" "}
                  <strong className="text-foreground">
                    {((suggestion.confianza ?? 0) * 100).toFixed(0)}%
                  </strong>
                </span>
              </div>

              {suggestion.resumen && (
                <p className="rounded-md bg-muted/50 p-2 text-xs">
                  {suggestion.resumen}
                </p>
              )}

              <label className="block text-xs font-medium">
                Item destino
                <select
                  value={targetClave}
                  onChange={(e) => setTargetClave(e.target.value)}
                  className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1 text-sm"
                >
                  <option value="">— Seleccionar —</option>
                  {items.map((i) => (
                    <option key={i.id} value={i.clave}>
                      [{i.categoria}] {i.titulo}
                    </option>
                  ))}
                </select>
              </label>

              {suggestion.campos &&
                Object.keys(suggestion.campos).length > 0 && (
                  <div className="rounded-md border border-border p-2 text-xs">
                    <div className="mb-1 font-semibold">Campos extraídos</div>
                    <ul className="space-y-0.5">
                      {Object.entries(suggestion.campos).map(([k, v]) => (
                        <li key={k}>
                          <span className="text-muted-foreground">{k}:</span>{" "}
                          {v}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

              {(() => {
                const extras = combineExtras(suggestion, items, targetClave);
                if (extras.length === 0) return null;
                return (
                  <div className="rounded-md border border-primary/40 bg-primary/5 p-2 text-xs">
                    <div className="mb-2 font-semibold">
                      Pre-llenar otros items con datos de este documento
                    </div>
                    <ul className="space-y-1.5">
                      {extras.map((ef) => {
                        const target = items.find((i) => i.clave === ef.clave);
                        if (!target) return null;
                        return (
                          <li key={ef.clave} className="flex items-start gap-2">
                            <input
                              type="checkbox"
                              className="mt-0.5"
                              checked={!!extraSelected[ef.clave]}
                              onChange={(e) =>
                                setExtraSelected((p) => ({
                                  ...p,
                                  [ef.clave]: e.target.checked,
                                }))
                              }
                            />
                            <div className="min-w-0 flex-1">
                              <div className="font-medium">
                                [{target.categoria}] {target.titulo}
                              </div>
                              {ef.valor_texto && (
                                <div className="text-muted-foreground">
                                  → {ef.valor_texto}
                                </div>
                              )}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })()}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No se obtuvo sugerencia. Selecciona manualmente el item.
            </p>
          )}

          {error && <p className="text-xs text-destructive">{error}</p>}

          <DialogFooter>
            <button
              onClick={() => setOpen(false)}
              className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent"
            >
              Cancelar
            </button>
            <button
              onClick={commit}
              disabled={saving || !targetClave || !file}
              className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50"
            >
              {saving ? "Guardando…" : "Adjuntar al item"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

