import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { analyzeOnboardingDocFn } from "@/lib/valinor.functions";
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
    await supabase.from("onboarding_items").update(patch).eq("id", id);
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
                  <div key={it.id} className="p-4">
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

                    {!it.requiere_archivo && (
                      <input
                        type="text"
                        placeholder="Valor / dato"
                        defaultValue={it.valor_texto ?? ""}
                        onBlur={(e) =>
                          e.target.value !== (it.valor_texto ?? "") &&
                          updateItem(it.id, { valor_texto: e.target.value })
                        }
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
      // Pre-seleccionar todos los extra_fills cuyo clave existe en el catálogo
      const validClaves = new Set(items.map((i) => i.clave));
      const sel: Record<string, boolean> = {};
      for (const ef of s?.extra_fills ?? []) {
        if (ef.clave && validClaves.has(ef.clave) && ef.clave !== s?.item_clave_sugerida) {
          sel[ef.clave] = true;
        }
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

      await onCommitted();
      setOpen(false);
      setFile(null);
      setSuggestion(null);
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

