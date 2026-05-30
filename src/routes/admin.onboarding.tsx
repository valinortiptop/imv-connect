import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
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

export const Route = createFileRoute("/admin/onboarding")({
  component: OnboardingPage,
});

type Item = {
  id: string;
  categoria: string;
  clave: string;
  titulo: string;
  descripcion: string | null;
  requerido: boolean;
  requiere_archivo: boolean;
  estado: "pendiente" | "en_proceso" | "entregado" | "no_aplica";
  notas: string | null;
  valor_texto: string | null;
  orden: number;
};

type Archivo = {
  id: string;
  item_id: string;
  storage_path: string;
  nombre_original: string;
  size_bytes: number | null;
  uploaded_at: string;
};

const CAT_LABEL: Record<string, string> = {
  empresa: "Datos de empresa",
  documentos_legales: "Documentos legales",
  catalogos: "Catálogos",
  precios: "Precios",
  promociones: "Promociones",
  branding: "Branding y diseño",
  integraciones: "Integraciones (NetSuite, Resend, Twilio)",
  comunicaciones: "Plantillas de comunicación",
  otros: "Otros",
};

const ESTADO_COLOR: Record<string, string> = {
  pendiente: "bg-muted text-muted-foreground",
  en_proceso: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400",
  entregado: "bg-green-500/15 text-green-700 dark:text-green-400",
  no_aplica: "bg-gray-500/15 text-gray-600",
};

function OnboardingPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [archivos, setArchivos] = useState<Archivo[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");

  const load = async () => {
    setLoading(true);
    const [a, b] = await Promise.all([
      supabase.from("onboarding_items").select("*").order("categoria").order("orden"),
      supabase.from("onboarding_archivos").select("*").order("uploaded_at", { ascending: false }),
    ]);
    setItems((a.data as Item[]) ?? []);
    setArchivos((b.data as Archivo[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const grouped = useMemo(() => {
    const g: Record<string, Item[]> = {};
    for (const it of items) {
      if (filter !== "all" && it.categoria !== filter) continue;
      (g[it.categoria] ??= []).push(it);
    }
    return g;
  }, [items, filter]);

  const stats = useMemo(() => {
    const req = items.filter((i) => i.requerido && i.estado !== "no_aplica");
    const done = req.filter((i) => i.estado === "entregado").length;
    return { total: req.length, done, pct: req.length ? Math.round((done / req.length) * 100) : 0 };
  }, [items]);

  const updateItem = async (id: string, patch: Partial<Item>) => {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
    const { error, data } = await supabase
      .from("onboarding_items")
      .update(patch)
      .eq("id", id)
      .select("id");
    if (error) {
      alert("No se pudo guardar: " + error.message);
      await load();
    } else if (!data || data.length === 0) {
      alert("No se pudo guardar (sin permisos). Pide a un admin que te asigne permisos de edición.");
      await load();
    }
  };

  const uploadFile = async (item: Item, file: File) => {
    const path = `${item.clave}/${Date.now()}_${file.name}`;
    const up = await supabase.storage.from("onboarding").upload(path, file, { upsert: false });
    if (up.error) {
      alert("Error al subir: " + up.error.message);
      return;
    }
    const { data: u } = await supabase.auth.getUser();
    await supabase.from("onboarding_archivos").insert({
      item_id: item.id,
      storage_path: path,
      nombre_original: file.name,
      mime_type: file.type,
      size_bytes: file.size,
      uploaded_by: u.user?.id,
    });
    await updateItem(item.id, { estado: "entregado" });
    await load();
  };

  const downloadFile = async (a: Archivo) => {
    const { data, error } = await supabase.storage
      .from("onboarding")
      .createSignedUrl(a.storage_path, 60);
    if (error || !data) return alert("Error: " + error?.message);
    window.open(data.signedUrl, "_blank");
  };

  const deleteFile = async (a: Archivo) => {
    if (!confirm("¿Eliminar archivo?")) return;
    await supabase.storage.from("onboarding").remove([a.storage_path]);
    await supabase.from("onboarding_archivos").delete().eq("id", a.id);
    await load();
  };

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Onboarding IMV</h1>
          <p className="text-sm text-muted-foreground">
            Checklist de información, archivos y credenciales que necesitamos del cliente para
            arrancar la operación.
          </p>
        </div>
        <div className="rounded-lg border border-border p-4 text-right">
          <div className="text-xs text-muted-foreground">Avance requeridos</div>
          <div className="text-2xl font-bold">
            {stats.done}/{stats.total}
          </div>
          <div className="mt-2 h-2 w-40 overflow-hidden rounded-full bg-muted">
            <div className="h-full bg-primary" style={{ width: `${stats.pct}%` }} />
          </div>
        </div>
      </header>

      <AiUploader items={items} onCommitted={load} />



      <div className="flex flex-wrap gap-2">
        <FilterBtn active={filter === "all"} onClick={() => setFilter("all")}>
          Todos
        </FilterBtn>
        {Object.keys(CAT_LABEL).map((c) => (
          <FilterBtn key={c} active={filter === c} onClick={() => setFilter(c)}>
            {CAT_LABEL[c]}
          </FilterBtn>
        ))}
      </div>

      {loading ? (
        <p className="text-muted-foreground">Cargando…</p>
      ) : (
        Object.entries(grouped).map(([cat, list]) => (
          <section key={cat} className="rounded-xl border border-border">
            <h2 className="border-b border-border bg-muted/40 px-4 py-2 text-sm font-semibold">
              {CAT_LABEL[cat] ?? cat}
            </h2>
            <div className="divide-y divide-border">
              {list.map((it) => {
                const files = archivos.filter((a) => a.item_id === it.id);
                return (
                  <div key={it.id} className={`p-4 ${it.estado === "entregado" ? "bg-green-500/10 dark:bg-green-500/5" : ""}`}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{it.titulo}</span>
                          {it.requerido && (
                            <span className="rounded bg-red-500/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-red-600">
                              Requerido
                            </span>
                          )}
                          <span
                            className={`rounded px-2 py-0.5 text-[10px] font-semibold uppercase ${ESTADO_COLOR[it.estado]}`}
                          >
                            {it.estado.replace("_", " ")}
                          </span>
                        </div>
                        {it.descripcion && (
                          <p className="mt-1 text-xs text-muted-foreground">{it.descripcion}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <label className="cursor-pointer rounded-md border border-input bg-background px-2 py-1 text-xs hover:bg-muted">
                          + Subir
                          <input
                            type="file"
                            className="hidden"
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f) uploadFile(it, f);
                              e.target.value = "";
                            }}
                          />
                        </label>
                        <select
                          value={it.estado}
                          onChange={(e) => updateItem(it.id, { estado: e.target.value as Item["estado"] })}
                          className="rounded-md border border-input bg-background px-2 py-1 text-xs"
                        >
                          <option value="pendiente">Pendiente</option>
                          <option value="en_proceso">En proceso</option>
                          <option value="entregado">Entregado</option>
                          <option value="no_aplica">No aplica</option>
                        </select>
                      </div>
                    </div>

                    {!it.requiere_archivo && (
                      <input
                        type="text"
                        placeholder="Valor / dato"
                        defaultValue={it.valor_texto ?? ""}
                        onBlur={(e) => {
                          const v = e.target.value;
                          if (v !== (it.valor_texto ?? "")) {
                            const patch: Partial<Item> = { valor_texto: v };
                            if (v.trim() && it.estado !== "entregado" && it.estado !== "no_aplica") {
                              patch.estado = "entregado";
                            } else if (!v.trim() && it.estado === "entregado") {
                              patch.estado = "pendiente";
                            }
                            updateItem(it.id, patch);
                          }
                        }}
                        className="mt-3 w-full rounded-md border border-input bg-background px-2 py-1 text-sm"
                      />
                    )}

                    {it.requiere_archivo && (
                      <div className="mt-3">
                        <input
                          type="file"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) uploadFile(it, f);
                            e.target.value = "";
                          }}
                          className="text-xs"
                        />
                        {files.length > 0 && (
                          <ul className="mt-2 space-y-1">
                            {files.map((a) => (
                              <li
                                key={a.id}
                                className="flex items-center justify-between rounded border border-border px-2 py-1 text-xs"
                              >
                                <span className="truncate">{a.nombre_original}</span>
                                <span className="flex gap-2">
                                  <button
                                    onClick={() => downloadFile(a)}
                                    className="text-primary hover:underline"
                                  >
                                    Ver
                                  </button>
                                  <button
                                    onClick={() => deleteFile(a)}
                                    className="text-red-600 hover:underline"
                                  >
                                    Eliminar
                                  </button>
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}

                    <textarea
                      placeholder="Notas"
                      defaultValue={it.notas ?? ""}
                      onBlur={(e) =>
                        e.target.value !== (it.notas ?? "") &&
                        updateItem(it.id, { notas: e.target.value })
                      }
                      className="mt-2 w-full rounded-md border border-input bg-background px-2 py-1 text-xs"
                      rows={1}
                    />
                  </div>
                );
              })}
            </div>
          </section>
        ))
      )}
    </div>
  );
}

function FilterBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-md border px-3 py-1 text-xs transition-colors ${
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border text-muted-foreground hover:bg-accent"
      }`}
    >
      {children}
    </button>
  );
}

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

function AiUploader({
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

