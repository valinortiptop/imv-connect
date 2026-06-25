// @ts-nocheck
// Excel importer for clients — AI maps columns, then forward-geocodes
// addresses via Google Maps (Valinor proxy) to capture lat/lng + CP.
import React, { useMemo, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  FileSpreadsheet,
  Upload,
  Sparkles,
  MapPin,
  Loader2,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { aiChatFn, googleGeocodeFn } from "@/lib/valinor.functions";
import { stripVmPrefix, hadVmPrefix, GENERIC_RFC } from "@/lib/vm-client";

type Status = "new" | "update" | "unchanged" | "error";

type ImportRow = {
  name: string;
  company: string;
  nickname: string;
  phone: string;
  email: string;
  rfc: string;
  razon_social: string;
  address: string;
  codigo_postal: string;
  payment_method: string;
  payment_terms: number | null;
  client_type: "mayoreo" | "menudeo";
  lat: number | null;
  lng: number | null;
  google_place_id: string | null;
  representante_nombre: string;
  representante_id?: string | null;
  status: Status;
  existing_id?: string | null;
  diff_fields?: string[];
  errorMsg?: string;
};

// "Amaya, Marisol" -> "Marisol Amaya"; "Marisol Amaya" stays as is.
const normalizeRepName = (raw: string) => {
  const s = (raw || "").replace(/\s+/g, " ").trim();
  if (!s) return "";
  if (s.includes(",")) {
    const [last, first] = s.split(",", 2).map((t) => t.trim());
    if (first && last) return `${first} ${last}`;
  }
  return s;
};
const repKey = (s: string) =>
  (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ").trim();


const norm = (v: unknown) =>
  v == null || v === "" ? null : typeof v === "string" ? v.trim() : v;

/**
 * In this Excel the "Dirección de envío" column is dumped as
 * "<NOMBRE CLIENTE> <NOMBRE CLIENTE REPETIDO> <DIRECCIÓN REAL>".
 * Strip any leading repetition of the client name / company / razón social
 * so we keep only the actual street address before geocoding.
 */
const stripNamePrefix = (address: string, ...names: string[]) => {
  let out = (address || "").replace(/\s+/g, " ").trim();
  if (!out) return out;
  const candidates = names
    .map((n) => (n || "").replace(/\s+/g, " ").trim())
    .filter((n) => n.length >= 3)
    .sort((a, b) => b.length - a.length);

  // Repeatedly peel off any leading occurrence of a name token.
  for (let pass = 0; pass < 6; pass++) {
    let changed = false;
    for (const n of candidates) {
      const re = new RegExp(
        "^(?:" + n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ")[\\s,:-]*",
        "i",
      );
      if (re.test(out)) {
        out = out.replace(re, "").trim();
        changed = true;
      }
    }
    if (!changed) break;
  }

  // Drop a leading street-type keyword that lost its name (e.g. "VETERINARIA …").
  // Only strip the very first word when it's a known business prefix AND
  // the next token looks like another name (all caps) — keeps real
  // street-type words like CALLE / AVENIDA intact.
  const businessLead = /^(VETERINARIA|VETERINARIO|HOSPITAL|CLINICA|CLÍNICA|CONSULTORIO|FARMACIA|PET'?S?\s+HOME|PETSHOP|PET\s+SHOP|SERVICIO\s+MEDICO|SERVICIO\s+MÉDICO|ANIMAL\s+ZOO|CANNYS|LATIDO\s+ANIMAL|AGROPECUARIA|HAPPY\s+PETSAVE|CONSULTOR)\s+/i;
  if (businessLead.test(out) && /^[A-ZÁÉÍÓÚÑ\s]{6,}/.test(out)) {
    out = out.replace(businessLead, "").trim();
  }
  return out;
};

export function ClientsImportDialog({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => void;
}) {
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [parsing, setParsing] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [geocoding, setGeocoding] = useState(false);
  const [geoProgress, setGeoProgress] = useState({ done: 0, total: 0 });
  const [saving, setSaving] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    setParsing(true);
    try {
      const XLSX = await import("xlsx-js-style");
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const json: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet, {
        defval: "",
      });
      if (json.length === 0) {
        toast.error("El Excel está vacío");
        return;
      }

      // Existing clients (for new vs update detection) — read from base table.
      // Generic SAT RFC ("público en general / venta mostrador") must NOT be
      // used as a match key, otherwise hundreds of unrelated clients collapse
      // into one row.
      const GENERIC_RFCS = new Set(["XAXX010101000", "XEXX010101000"]);
      const normKey = (s: string | null | undefined) =>
        (s ?? "")
          .toString()
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/[^a-z0-9]+/g, " ")
          .trim();
      const normPhone = (s: string | null | undefined) =>
        (s ?? "").toString().replace(/\D+/g, "").slice(-10);

      const existingList: any[] = [];
      // Paginate to bypass the 1000-row default limit.
      for (let from = 0; ; from += 1000) {
        const { data, error } = await supabase
          .from("clientes")
          .select(
            "id, razon_social, nombre_comercial, company, phone, telefono, rfc, direccion, codigo_postal, payment_method, client_type",
          )
          .range(from, from + 999);
        if (error) throw error;
        if (!data || data.length === 0) break;
        existingList.push(...data);
        if (data.length < 1000) break;
      }
      const byRfc = new Map<string, any>();
      const byName = new Map<string, any>();
      const byPhone = new Map<string, any>();
      for (const c of existingList) {
        if (c.rfc && !GENERIC_RFCS.has(String(c.rfc).toUpperCase()))
          byRfc.set(String(c.rfc).toUpperCase().trim(), c);
        const nk = normKey(c.razon_social) || normKey(c.nombre_comercial) || normKey(c.company);
        if (nk) byName.set(nk, c);
        const pk = normPhone(c.phone) || normPhone(c.telefono);
        if (pk && pk.length === 10) byPhone.set(pk, c);
      }

      const diffRow = (
        r: Omit<ImportRow, "status" | "existing_id" | "diff_fields" | "errorMsg">,
      ): { status: Status; existing_id?: string; diff_fields?: string[] } => {
        const rfcUp = r.rfc ? r.rfc.toUpperCase().trim() : "";
        const useRfc = rfcUp && !GENERIC_RFCS.has(rfcUp);
        const nk = normKey(r.name) || normKey(r.company) || normKey(r.razon_social);
        const pk = normPhone(r.phone);
        const match =
          (useRfc && byRfc.get(rfcUp)) ||
          (nk && byName.get(nk)) ||
          (pk.length === 10 && byPhone.get(pk)) ||
          null;
        if (!match) return { status: "new" };
        const diff: string[] = [];
        const matchName = match.razon_social ?? match.nombre_comercial ?? match.company;
        const matchPhone = match.phone ?? match.telefono;
        if (r.name && norm(r.name) !== norm(matchName)) diff.push("nombre");
        if (r.company && norm(r.company) !== norm(match.company)) diff.push("empresa");
        if (r.phone && norm(r.phone) !== norm(matchPhone)) diff.push("teléfono");
        if (r.rfc && norm(r.rfc) !== norm(match.rfc)) diff.push("rfc");
        if (r.razon_social && norm(r.razon_social) !== norm(match.razon_social))
          diff.push("razón social");
        if (r.address && norm(r.address) !== norm(match.direccion))
          diff.push("dirección");
        if (r.codigo_postal && norm(r.codigo_postal) !== norm(match.codigo_postal))
          diff.push("CP");
        if (r.payment_method && norm(r.payment_method) !== norm(match.payment_method))
          diff.push("método pago");
        if (r.client_type && norm(r.client_type) !== norm(match.client_type))
          diff.push("tipo");
        return diff.length > 0
          ? { status: "update", existing_id: match.id, diff_fields: diff }
          : { status: "unchanged", existing_id: match.id };
      };


      // Ask the AI to normalize each row.
      setAnalyzing(true);
      const headers = Object.keys(json[0] ?? {});
      const sampleRows = json.slice(0, 1500);
      const system = `Eres un asistente que normaliza un catálogo de clientes (distribuidor farmacéutico veterinario en México) desde un Excel.
Devuelves SOLO JSON válido, sin markdown.
Para cada fila identifica los campos canónicos:
- name (nombre del cliente o razón social abreviada — obligatorio)
- company (nombre comercial / empresa, puede ser igual a name)
- nickname (apodo / nombre corto si existe)
- phone (string)
- email (string)
- rfc (string en mayúsculas, sin espacios)
- razon_social (razón social completa)
- address (dirección de UNA sola línea: calle, número, colonia, ciudad, estado).
  IMPORTANTE: en este Excel la columna "Dirección de envío" suele venir como
  "<NOMBRE_CLIENTE> <NOMBRE_CLIENTE_REPETIDO> <DIRECCIÓN_REAL>". Debes
  ELIMINAR cualquier prefijo que sea el nombre del cliente, la razón social,
  el nombre comercial o palabras tipo "VETERINARIA X", "HOSPITAL Y",
  "FARMACIA Z", "PET'S HOME", etc., y devolver SOLO la dirección real
  (calle, número, colonia, municipio, estado). Prefiere "Dirección de envío"
  sobre "Dirección de facturación" si ambas existen.
- codigo_postal (5 dígitos)
- payment_method (uno de: "credito", "contado", "Transferencia", "Depósito", "Efectivo")
- payment_terms (días de crédito como número entero, ej. 30; 0 si es contado)
- client_type ("mayoreo" si tiene crédito o RFC empresarial, "menudeo" si es contado/persona física)
- representante_nombre (vendedor / representante de ventas asignado al cliente; si viene como "Apellido, Nombre" devuelve "Nombre Apellido"; si no aparece devuelve "")
Si un campo no aparece, devuelve "" o null.
Responde con: {"rows":[{...}, ...]} en el MISMO ORDEN y MISMA CANTIDAD que la entrada.`;
      const userMsg = JSON.stringify({ headers, rows: sampleRows });

      let aiRows: any[] | null = null;
      try {
        const resp = await aiChatFn({
          data: {
            model: "gpt-4o-mini",
            temperature: 0,
            messages: [
              { role: "system", content: system },
              { role: "user", content: userMsg },
            ],
          },
        });
        const content =
          (resp as any)?.content ??
          (resp as any)?.choices?.[0]?.message?.content ??
          "";
        const cleaned = String(content)
          .replace(/^```json\s*/i, "")
          .replace(/^```\s*/i, "")
          .replace(/```$/i, "")
          .trim();
        const parsedJson = JSON.parse(cleaned);
        aiRows = Array.isArray(parsedJson?.rows) ? parsedJson.rows : null;
      } catch (e) {
        console.warn("AI mapping failed, falling back to heuristics", e);
      }

      const get = (r: Record<string, unknown>, ...keys: string[]) => {
        for (const k of keys) {
          for (const real of Object.keys(r)) {
            if (real.toLowerCase().trim() === k.toLowerCase())
              return String(r[real] ?? "").trim();
          }
        }
        return "";
      };

      const heuristicRow = (r: Record<string, unknown>) => ({
        name: get(r, "nombre", "name", "cliente", "razon social", "razón social"),
        company: get(r, "empresa", "company", "nombre comercial"),
        nickname: get(r, "apodo", "alias", "nickname"),
        phone: get(r, "telefono", "teléfono", "phone", "celular"),
        email: get(r, "email", "correo"),
        rfc: get(r, "rfc"),
        razon_social: get(r, "razon social", "razón social", "razon_social"),
        address: get(r, "direccion de envio", "dirección de envío", "direccion envio", "dirección envío", "direccion", "dirección", "address", "domicilio", "direccion de facturacion", "dirección de facturación"),
        codigo_postal: get(r, "cp", "codigo postal", "código postal", "codigo_postal", "zip"),
        payment_method: get(r, "metodo de pago", "método de pago", "payment_method", "forma de pago"),
        payment_terms_str: get(r, "credito", "crédito", "dias credito", "días crédito", "payment_terms", "plazo"),
        client_type: get(r, "tipo", "client_type", "tipo cliente").toLowerCase(),
        representante_nombre: get(r, "representante de ventas", "representante", "vendedor", "asesor", "ejecutivo"),
      });

      const built: ImportRow[] = json.map((raw, i) => {
        const ai = aiRows?.[i] ?? null;
        const h = heuristicRow(raw);
        const pick = (a: any, b: any) =>
          a != null && String(a).trim() !== "" ? String(a).trim() : String(b ?? "").trim();
        const rawName = pick(ai?.name, h.name);
        const rawCompany = pick(ai?.company, h.company);
        const rawRazon = pick(ai?.razon_social, h.razon_social);
        // VM detection: strip the "VM " prefix from name/company/razón social
        // and force the generic SAT RFC for these "Venta Mostrador" clients.
        const wasVm =
          hadVmPrefix(rawName) || hadVmPrefix(rawCompany) || hadVmPrefix(rawRazon);
        const name = stripVmPrefix(rawName) || rawName;
        const company = stripVmPrefix(rawCompany) || rawCompany;
        const razon_social = stripVmPrefix(rawRazon) || rawRazon;
        const nickname = pick(ai?.nickname, h.nickname);
        const phone = pick(ai?.phone, h.phone);
        const email = pick(ai?.email, h.email);
        const rfcInput = pick(ai?.rfc, h.rfc).toUpperCase();
        const rfc = rfcInput || (wasVm ? GENERIC_RFC : "");
        const rawAddress = pick(ai?.address, h.address);
        const address = stripNamePrefix(rawAddress, name, company, razon_social, nickname);
        const codigo_postal = pick(ai?.codigo_postal, h.codigo_postal);
        const pm = pick(ai?.payment_method, h.payment_method);
        const termsRaw = ai?.payment_terms ?? Number(h.payment_terms_str) ?? null;
        const payment_terms =
          termsRaw == null || termsRaw === "" || Number.isNaN(Number(termsRaw))
            ? null
            : Math.max(0, Math.round(Number(termsRaw)));
        const ctRaw = String(ai?.client_type ?? h.client_type ?? "").toLowerCase();
        const client_type: "mayoreo" | "menudeo" =
          ctRaw === "mayoreo" || ctRaw === "menudeo"
            ? (ctRaw as any)
            : pm.toLowerCase().includes("credito") || (payment_terms ?? 0) > 0
              ? "mayoreo"
              : "menudeo";

        const representante_nombre = normalizeRepName(pick(ai?.representante_nombre, h.representante_nombre));

        const baseRow = {
          name,
          company,
          nickname,
          phone,
          email,
          rfc,
          razon_social,
          address,
          codigo_postal,
          payment_method: pm || (client_type === "mayoreo" ? "credito" : "contado"),
          payment_terms,
          client_type,
          lat: null as number | null,
          lng: null as number | null,
          google_place_id: null as string | null,
          representante_nombre,
          representante_id: null as string | null,
        };
        if (!name) {
          return {
            ...baseRow,
            status: "error" as Status,
            errorMsg: `Fila ${i + 2}: falta nombre`,
          };
        }
        return { ...baseRow, ...diffRow(baseRow) } as ImportRow;
      });

      // Ensure representantes exist for every distinct name found and stamp ids onto rows.
      const uniqueRepNames = Array.from(
        new Set(built.map((r) => r.representante_nombre).filter(Boolean)),
      );
      if (uniqueRepNames.length > 0) {
        const { data: existingReps } = await supabase
          .from("representantes")
          .select("id, nombre");
        const repIdByKey = new Map<string, string>();
        for (const r of existingReps ?? []) {
          repIdByKey.set(repKey(r.nombre), r.id);
        }
        const missing = uniqueRepNames.filter((n) => !repIdByKey.has(repKey(n)));
        if (missing.length > 0) {
          const { data: newReps, error: repErr } = await supabase
            .from("representantes")
            .insert(missing.map((nombre) => ({ nombre, activo: true })))
            .select("id, nombre");
          if (repErr) console.warn("repr insert failed", repErr);
          for (const r of newReps ?? []) repIdByKey.set(repKey(r.nombre), r.id);
        }
        for (const row of built) {
          if (row.representante_nombre) {
            row.representante_id = repIdByKey.get(repKey(row.representante_nombre)) ?? null;
          }
        }
      }


      setRows(built);
      if (aiRows) toast.success(`Excel analizado con IA — ${built.length} filas`);
      else toast.info(`Excel procesado con heurística — ${built.length} filas`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setParsing(false);
      setAnalyzing(false);
    }
  };

  const runGeocode = async () => {
    const candidates = rows
      .map((r, i) => ({ r, i }))
      .filter(
        ({ r }) =>
          r.status !== "error" &&
          r.address &&
          r.address.length > 5 &&
          (r.lat == null || r.lng == null),
      );
    if (candidates.length === 0) {
      toast.info("No hay direcciones por geocodificar");
      return;
    }
    setGeocoding(true);
    setGeoProgress({ done: 0, total: candidates.length });
    const next = [...rows];
    let done = 0;
    // Run in small batches of 5 in parallel to be polite to the API.
    const batchSize = 5;
    for (let i = 0; i < candidates.length; i += batchSize) {
      const batch = candidates.slice(i, i + batchSize);
      await Promise.all(
        batch.map(async ({ r, i: idx }) => {
          try {
            const resp = await googleGeocodeFn({
              data: { address: r.address, region: "mx", language: "es" },
            });
            const top = (resp as any)?.results?.[0];
            if (top) {
              const loc = top.geometry?.location;
              const cp = top.address_components?.find((c: any) =>
                c.types?.includes("postal_code"),
              )?.long_name;
              next[idx] = {
                ...next[idx],
                lat: typeof loc?.lat === "number" ? loc.lat : null,
                lng: typeof loc?.lng === "number" ? loc.lng : null,
                google_place_id: top.place_id ?? null,
                codigo_postal: next[idx].codigo_postal || cp || "",
                address: top.formatted_address || next[idx].address,
              };
            }
          } catch (e) {
            // skip — leave row as-is
          } finally {
            done++;
            setGeoProgress({ done, total: candidates.length });
          }
        }),
      );
      setRows([...next]);
    }
    setGeocoding(false);
    const geocoded = next.filter((r) => r.lat != null && r.lng != null).length;
    toast.success(`${geocoded} dirección(es) geocodificadas`);
  };

  const save = async () => {
    const toInsert = rows.filter((r) => r.status === "new");
    const toUpdate = rows.filter((r) => r.status === "update");
    if (toInsert.length === 0 && toUpdate.length === 0)
      return toast.info("No hay cambios por aplicar");

    setSaving(true);
    try {
      // In-batch dedupe — a single Excel often contains the same client on
      // multiple lines (different shipping addresses, etc.). Without this
      // collapse, `insert` would create N copies in one call.
      const GENERIC_RFCS = new Set(["XAXX010101000", "XEXX010101000"]);
      const normKey = (s: string | null | undefined) =>
        (s ?? "").toString().toLowerCase().normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
      const normPhone = (s: string | null | undefined) =>
        (s ?? "").toString().replace(/\D+/g, "").slice(-10);
      const rowKey = (r: ImportRow) => {
        const rfcUp = (r.rfc || "").toUpperCase().trim();
        if (rfcUp && !GENERIC_RFCS.has(rfcUp)) return "rfc:" + rfcUp;
        const nk = normKey(r.name) || normKey(r.company) || normKey(r.razon_social);
        const pk = normPhone(r.phone);
        if (nk && pk.length === 10) return "np:" + nk + "|" + pk;
        if (nk) return "n:" + nk;
        return "rand:" + Math.random();
      };

      // Re-check existing rows right before saving (someone else may have
      // imported in the meantime) so we never insert a duplicate.
      const existingKeys = new Set<string>();
      for (let from = 0; ; from += 1000) {
        const { data, error } = await supabase
          .from("clientes")
          .select("id, razon_social, nombre_comercial, company, phone, telefono, rfc")
          .range(from, from + 999);
        if (error) throw error;
        if (!data || data.length === 0) break;
        for (const c of data) {
          const rfcUp = (c.rfc || "").toUpperCase().trim();
          if (rfcUp && !GENERIC_RFCS.has(rfcUp)) existingKeys.add("rfc:" + rfcUp);
          const nk = normKey(c.razon_social) || normKey(c.nombre_comercial) || normKey(c.company);
          const pk = normPhone(c.phone) || normPhone(c.telefono);
          if (nk && pk.length === 10) existingKeys.add("np:" + nk + "|" + pk);
          if (nk) existingKeys.add("n:" + nk);
        }
        if (data.length < 1000) break;
      }

      const seen = new Set<string>();
      const dedupedInsert: ImportRow[] = [];
      for (const r of toInsert) {
        const k = rowKey(r);
        if (seen.has(k) || existingKeys.has(k)) continue;
        seen.add(k);
        dedupedInsert.push(r);
      }

      let inserted = 0;
      if (dedupedInsert.length > 0) {
        const payload = dedupedInsert.map((r) => ({
          razon_social: r.razon_social || r.name,
          nombre_comercial: r.company || r.nickname || null,
          nickname: r.nickname || null,
          company: r.company || null,
          phone: r.phone || null,
          telefono: r.phone || null,
          email: r.email || null,
          rfc: r.rfc || null,
          direccion: r.address || null,
          codigo_postal: r.codigo_postal || null,
          payment_method: r.payment_method || null,
          payment_terms: r.payment_terms,
          client_type: r.client_type,
          lat: r.lat,
          lng: r.lng,
          google_place_id: r.google_place_id,
          representante_id: r.representante_id ?? null,
          active: true,
        }));
        for (let i = 0; i < payload.length; i += 100) {
          const chunk = payload.slice(i, i + 100);
          const { data, error } = await supabase
            .from("clientes")
            .insert(chunk as any)
            .select("id");
          if (error) throw error;
          inserted += data?.length ?? 0;
        }
      }


      let updated = 0;
      for (const r of toUpdate) {
        if (!r.existing_id) continue;
        const fields = new Set(r.diff_fields ?? []);
        const patch: Record<string, unknown> = {};
        if (fields.has("nombre")) patch.razon_social = r.name;
        if (fields.has("empresa")) {
          patch.company = r.company || null;
          patch.nombre_comercial = r.company || null;
        }
        if (fields.has("teléfono")) {
          patch.phone = r.phone || null;
          patch.telefono = r.phone || null;
        }
        if (fields.has("rfc")) patch.rfc = r.rfc || null;
        if (fields.has("razón social")) patch.razon_social = r.razon_social || null;
        if (fields.has("dirección")) patch.direccion = r.address || null;
        if (fields.has("CP")) patch.codigo_postal = r.codigo_postal || null;
        if (fields.has("método pago")) patch.payment_method = r.payment_method || null;
        if (fields.has("tipo")) patch.client_type = r.client_type;
        if (r.lat != null && r.lng != null) {
          patch.lat = r.lat;
          patch.lng = r.lng;
          patch.google_place_id = r.google_place_id;
        }
        if (r.payment_terms != null) patch.payment_terms = r.payment_terms;
        if (r.representante_id) patch.representante_id = r.representante_id;
        if (Object.keys(patch).length === 0) continue;
        const { error } = await supabase
          .from("clientes")
          .update(patch as any)
          .eq("id", r.existing_id);
        if (error) throw error;
        updated++;
      }

      toast.success(`${inserted} nuevo(s) · ${updated} actualizado(s)`);
      onSaved();
    } catch (e) {
      console.error("[ClientsImport] save failed", e);
      toast.error(`No se pudo guardar: ${(e as Error).message ?? "error desconocido"}`);
    } finally {
      setSaving(false);
    }
  };


  const counts = useMemo(
    () => ({
      new: rows.filter((r) => r.status === "new").length,
      update: rows.filter((r) => r.status === "update").length,
      unchanged: rows.filter((r) => r.status === "unchanged").length,
      err: rows.filter((r) => r.status === "error").length,
      geo: rows.filter((r) => r.lat != null && r.lng != null).length,
    }),
    [rows],
  );

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" /> Importar clientes desde Excel
          </DialogTitle>
          <DialogDescription>
            <Sparkles className="inline h-3.5 w-3.5 text-primary" /> La IA detecta
            las columnas y normaliza los datos. Luego puedes geocodificar las
            direcciones con Google Maps para guardar lat/lng y CP.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              const f = e.dataTransfer.files?.[0];
              if (f) handleFile(f);
            }}
            onClick={() => inputRef.current?.click()}
            className={cn(
              "cursor-pointer rounded-lg border-2 border-dashed p-6 text-center transition-colors",
              dragOver
                ? "border-primary bg-primary/5"
                : "border-border hover:border-primary/60 hover:bg-muted/40",
              (parsing || analyzing) && "pointer-events-none opacity-70",
            )}
          >
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }}
            />
            <div className="flex flex-col items-center gap-2">
              {analyzing ? (
                <Sparkles className="h-8 w-8 text-primary animate-pulse" />
              ) : (
                <Upload className="h-8 w-8 text-muted-foreground" />
              )}
              <div className="text-sm font-medium">
                {analyzing
                  ? "Analizando catálogo con IA…"
                  : parsing
                    ? "Leyendo archivo…"
                    : "Arrastra tu Excel de clientes o haz clic para seleccionar"}
              </div>
              <div className="text-xs text-muted-foreground">
                .xlsx o .xls — la IA detecta nombre, RFC, dirección, método de pago, etc.
              </div>
            </div>
          </div>

          {rows.length > 0 && (
            <>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-700 border-emerald-500/30">
                  {counts.new} nuevos
                </Badge>
                <Badge variant="secondary" className="bg-blue-500/10 text-blue-700 border-blue-500/30">
                  {counts.update} actualizar
                </Badge>
                <Badge variant="secondary" className="bg-muted text-muted-foreground">
                  {counts.unchanged} sin cambios
                </Badge>
                {counts.err > 0 && (
                  <Badge variant="secondary" className="bg-red-500/10 text-red-700 border-red-500/30">
                    {counts.err} con error
                  </Badge>
                )}
                <Badge variant="outline" className="ml-auto">
                  <MapPin className="mr-1 h-3 w-3" /> {counts.geo}/{rows.length} geocodificados
                </Badge>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={runGeocode}
                  disabled={geocoding}
                >
                  {geocoding ? (
                    <>
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                      {geoProgress.done}/{geoProgress.total}
                    </>
                  ) : (
                    <>
                      <MapPin className="mr-1.5 h-3.5 w-3.5" /> Geocodificar direcciones
                    </>
                  )}
                </Button>
              </div>

              <div className="max-h-[40vh] overflow-auto rounded-md border">
                <Table>
                  <TableHeader className="sticky top-0 bg-background z-10">
                    <TableRow>
                      <TableHead className="w-20">Estado</TableHead>
                      <TableHead>Nombre</TableHead>
                      <TableHead>RFC</TableHead>
                      <TableHead>Dirección</TableHead>
                      <TableHead>CP</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Pago</TableHead>
                      <TableHead>Representante</TableHead>
                      <TableHead>Geo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.slice(0, 200).map((r, i) => (
                      <TableRow key={i}>
                        <TableCell>
                          {r.status === "new" && (
                            <Badge className="bg-emerald-500/15 text-emerald-700 border-emerald-500/30">
                              nuevo
                            </Badge>
                          )}
                          {r.status === "update" && (
                            <Badge className="bg-blue-500/15 text-blue-700 border-blue-500/30">
                              update
                            </Badge>
                          )}
                          {r.status === "unchanged" && (
                            <Badge variant="outline">sin cambios</Badge>
                          )}
                          {r.status === "error" && (
                            <Badge className="bg-red-500/15 text-red-700 border-red-500/30">
                              <AlertCircle className="mr-1 h-3 w-3" /> error
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="font-medium">{r.name || "—"}</TableCell>
                        <TableCell className="font-mono text-xs">{r.rfc || "—"}</TableCell>
                        <TableCell className="max-w-[260px] truncate" title={r.address}>
                          {r.address || "—"}
                        </TableCell>
                        <TableCell className="text-xs">{r.codigo_postal || "—"}</TableCell>
                        <TableCell className="text-xs capitalize">{r.client_type}</TableCell>
                        <TableCell className="text-xs">
                          {r.payment_method}
                          {r.payment_terms ? ` · ${r.payment_terms}d` : ""}
                        </TableCell>
                        <TableCell className="text-xs">
                          {r.representante_nombre ? (
                            <span className={r.representante_id ? "" : "text-amber-600"}>
                              {r.representante_nombre}
                              {!r.representante_id && " (nuevo)"}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {r.lat != null && r.lng != null ? (
                            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {rows.length > 200 && (
                  <div className="p-2 text-center text-xs text-muted-foreground">
                    Mostrando 200 de {rows.length} filas — todas se procesarán al guardar.
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            onClick={save}
            disabled={saving || rows.length === 0 || (counts.new === 0 && counts.update === 0)}
          >
            {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Aplicar ({counts.new + counts.update})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default ClientsImportDialog;
