import { useState, useMemo, useCallback } from "react";
import { Link } from "@/lib/router-compat";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { GlowCard } from "@/components/ui/spotlight-card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AnimatedGridPattern } from "@/components/ui/animated-grid-pattern";
import { useToast } from "@/hooks/use-toast";
import {
  FileText, Download, Search, Building2, Plus, User, Receipt,
  Trash2, Edit2, Check, X, MoreVertical, Upload, ExternalLink,
} from "lucide-react";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { ClientTypeBadge } from "@/components/ui/client-type-badge";
import * as XLSX from "xlsx-js-style";

/* ── types ── */
interface ClientRow {
  id: string;
  name: string;
  rfc: string | null;
  razon_social: string | null;
  nombre_cfdi: string | null;
  address: string | null;
  codigo_postal: string | null;
  regimen_fiscal: string | null;
  uso_cfdi: string | null;
  payment_method: string | null;
  metodo_pago: string | null;
  cfdi_pdf_path: string | null;
  active: boolean;
  client_type: "mayoreo" | "menudeo";
}

interface OrderRow {
  id: string;
  order_code: string;
  order_date: string;
  delivery_date: string;
  status: string;
  client_id: string;
}

interface OrderItemRow {
  quantity: number;
  unit_price_override: number | null;
  products: {
    clave: string;
    name: string;
    sale_price_with_iva: number;
  } | null;
}

interface BillingEntity {
  id: string;
  name: string;
  rfc: string | null;
  address: string | null;
  codigo_postal: string | null;
  regimen_fiscal: string | null;
  is_default: boolean;
}

interface InvoiceLine {
  cantidad: number;
  clave_unidad: string;
  clave_producto: string;
  modelo: string;
  descripcion: string;
  valor_unitario: number; // price without IVA
}

const REGIMEN_OPTIONS = [
  "Persona física",
  "Persona moral",
  "Régimen Simplificado de Confianza",
  "Régimen de Incorporación Fiscal",
  "Actividad empresarial y profesional",
];

const USO_CFDI_OPTIONS = [
  "Adquisición de mercancías",
  "Gastos en general",
  "Devoluciones, descuentos o bonificaciones",
  "Por definir",
];

const FORMA_PAGO_OPTIONS = [
  "Transferencia",
  "Efectivo",
  "Tarjeta de crédito",
  "Tarjeta de débito",
  "Cheque",
];

const METODO_PAGO_OPTIONS = ["PUE", "PPD"];

const fmtCurrency = (n: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n);

/* ═════════════════════════════════════════ */
export default function Facturacion() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  /* ── state ── */
  // Mayoreo / Menudeo / Todos — filters the client picker dropdown.
  // Default 'todos' so all clients are visible until the user
  // chooses to narrow it.
  const [clientTypeFilter, setClientTypeFilter] = useState<"mayoreo" | "menudeo" | "todos">("todos");
  const [selectedClientId, setSelectedClientId] = useState<string>("");
  const [selectedOrderId, setSelectedOrderId] = useState<string>("");
  const [selectedEntityId, setSelectedEntityId] = useState<string>("");
  const [entityDialogOpen, setEntityDialogOpen] = useState(false);
  const [entityManageOpen, setEntityManageOpen] = useState(false);
  const [cfdiEditOpen, setCfdiEditOpen] = useState(false);
  const [clientSearch, setClientSearch] = useState("");

  // Editable invoice lines
  const [lines, setLines] = useState<InvoiceLine[]>([]);

  /* ── queries ── */
  const { data: clients = [], isLoading: loadingClients } = useQuery({
    queryKey: ["facturacion-clients"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, name, rfc, razon_social, nombre_cfdi, address, codigo_postal, regimen_fiscal, uso_cfdi, payment_method, metodo_pago, cfdi_pdf_path, active, client_type")
        .eq("active", true)
        .order("name");
      if (error) throw error;
      return (data ?? []) as ClientRow[];
    },
  });

  const { data: billingEntities = [] } = useQuery({
    queryKey: ["billing-entities"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("billing_entities" as any)
        .select("*")
        .order("is_default", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as BillingEntity[];
    },
  });

  // Auto-select default entity
  const activeEntity = useMemo(() => {
    if (selectedEntityId) return billingEntities.find(e => e.id === selectedEntityId);
    return billingEntities.find(e => e.is_default) || billingEntities[0];
  }, [billingEntities, selectedEntityId]);

  const selectedClient = useMemo(
    () => clients.find(c => c.id === selectedClientId) ?? null,
    [clients, selectedClientId]
  );

  // Orders for selected client
  const { data: clientOrders = [] } = useQuery({
    queryKey: ["facturacion-orders", selectedClientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id, order_code, order_date, delivery_date, status, client_id")
        .eq("client_id", selectedClientId)
        .not("status", "eq", "Cancelado")
        .order("order_date", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as OrderRow[];
    },
    enabled: !!selectedClientId,
  });

  // Order items for selected order
  const { data: orderItems = [] } = useQuery({
    queryKey: ["facturacion-order-items", selectedOrderId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_items")
        .select("quantity, unit_price_override, products(clave, name, sale_price_with_iva)")
        .eq("order_id", selectedOrderId);
      if (error) throw error;
      return (data ?? []) as unknown as OrderItemRow[];
    },
    enabled: !!selectedOrderId,
  });

  // Populate lines when order items load
  const populateLines = useCallback((items: OrderItemRow[]) => {
    const newLines: InvoiceLine[] = items
      .filter(i => i.products)
      .map(i => ({
        cantidad: i.quantity,
        clave_unidad: "H87",
        clave_producto: "10121800",
        modelo: i.products!.clave,
        descripcion: i.products!.name,
        valor_unitario: (i.unit_price_override ?? i.products!.sale_price_with_iva) / 1.16,
      }));
    setLines(newLines);
  }, []);

  // Auto-populate when order items change
  useMemo(() => {
    if (orderItems.length > 0) populateLines(orderItems);
  }, [orderItems, populateLines]);

  // Filtered clients for search + type. In Todos view, group mayoreo
  // first then menudeo, alphabetical inside each group.
  const filteredClients = useMemo(() => {
    let out = clients;
    if (clientTypeFilter !== "todos") {
      out = out.filter(c => c.client_type === clientTypeFilter);
    }
    if (clientSearch.trim()) {
      const q = clientSearch.toLowerCase();
      out = out.filter(c =>
        c.name.toLowerCase().includes(q) ||
        (c.rfc ?? "").toLowerCase().includes(q) ||
        (c.razon_social ?? "").toLowerCase().includes(q),
      );
    }
    if (clientTypeFilter === "todos") {
      out = [...out].sort((a, b) => {
        if (a.client_type !== b.client_type) {
          return a.client_type === "mayoreo" ? -1 : 1;
        }
        return a.name.localeCompare(b.name, "es");
      });
    }
    return out;
  }, [clients, clientSearch, clientTypeFilter]);

  /* ── computed ── */
  const subtotal = lines.reduce((s, l) => s + l.valor_unitario * l.cantidad, 0);
  const iva = subtotal * 0.16;
  const total = subtotal + iva;

  /* ── line editing ── */
  const updateLine = (idx: number, field: keyof InvoiceLine, value: any) => {
    setLines(prev => prev.map((l, i) => i === idx ? { ...l, [field]: value } : l));
  };

  const removeLine = (idx: number) => {
    setLines(prev => prev.filter((_, i) => i !== idx));
  };

  /* ── download Excel ── */
  const downloadInvoiceExcel = () => {
    if (!selectedClient || lines.length === 0) return;

    const entity = activeEntity;
    const cl = selectedClient;

    // Style constants
    const fontBold: XLSX.CellStyle["font"] = { bold: true, name: "Arial", sz: 10 };
    const fontNormal: XLSX.CellStyle["font"] = { name: "Arial", sz: 10 };
    const fontBoldWhite: XLSX.CellStyle["font"] = { bold: true, name: "Arial", sz: 10, color: { rgb: "FFFFFF" } };
    const borderThin: XLSX.CellStyle["border"] = {
      top: { style: "thin", color: { rgb: "000000" } },
      bottom: { style: "thin", color: { rgb: "000000" } },
      left: { style: "thin", color: { rgb: "000000" } },
      right: { style: "thin", color: { rgb: "000000" } },
    };
    const fillTitle = { fgColor: { rgb: "1F4E79" }, patternType: "solid" } as any;
    const fillLabel = { fgColor: { rgb: "D6E4F0" }, patternType: "solid" } as any;
    const fillHeader = { fgColor: { rgb: "2E75B6" }, patternType: "solid" } as any;
    const fillDataAlt = { fgColor: { rgb: "F2F2F2" }, patternType: "solid" } as any;
    const fillTotals = { fgColor: { rgb: "E2EFDA" }, patternType: "solid" } as any;
    const numFmt2 = "#,##0.00";

    // Build the template rows matching the exact format
    const rows: (string | number | null)[][] = [];

    rows.push(["FORMATO PARA FACTURAR", null, null, null, null, null, null, null, null]);
    rows.push([
      "EMPRESA QUE FACTURA", null, entity?.name ?? "", null, null, null,
      "FORMA DE PAGO", null, cl.payment_method ?? "Transferencia",
    ]);
    rows.push([
      "CLIENTE Y/O RAZON SOCIAL", null, cl.razon_social ?? cl.nombre_cfdi ?? cl.name, null, null, null,
      "METODO DE PAGO", null, cl.metodo_pago ?? "PUE",
    ]);
    rows.push([
      "R.F.C.", cl.rfc ?? "", null, null, null, "USO CFDI:", cl.uso_cfdi ?? "Adquisición de mercancías", null, null,
    ]);
    rows.push(["DIRECCION", cl.address ?? "", null, null, null, null, null, null, null]);
    rows.push([
      "CODIGO POSTAL", cl.codigo_postal ?? "", null, null, null,
      "REGIMEN FISCAL:", cl.regimen_fiscal ?? "", null, null,
    ]);
    rows.push([
      "CANTIDAD", "**CLAVE UNIDAD SAT", "**CLAVE PRODUCTO Y/O SERVICIO",
      "MODELO", "CONCEPTO / DESCRIPCION", null, null,
      "VALOR UNITARIO", "SUBTOTAL",
    ]);

    for (let i = 0; i < 15; i++) {
      const line = lines[i];
      if (line && line.cantidad > 0) {
        rows.push([
          line.cantidad, line.clave_unidad, line.clave_producto,
          line.modelo, line.descripcion, null, null,
          Math.round(line.valor_unitario * 100) / 100,
          Math.round(line.valor_unitario * line.cantidad * 100) / 100,
        ]);
      } else {
        rows.push([0, null, null, null, null, null, null, null, null]);
      }
    }

    rows.push([null, null, null, null, null, null, null, "SUBTOTAL", Math.round(subtotal * 100) / 100]);
    rows.push([null, null, null, null, null, null, null, "IVA", Math.round(iva * 100) / 100]);
    rows.push([null, null, null, null, null, null, null, "TOTAL", Math.round(total * 100) / 100]);

    const ws = XLSX.utils.aoa_to_sheet(rows);

    // Column widths
    ws["!cols"] = [
      { wch: 12 }, { wch: 18 }, { wch: 30 }, { wch: 14 },
      { wch: 50 }, { wch: 12 }, { wch: 18 }, { wch: 16 }, { wch: 14 },
    ];

    // ── Apply styles ──

    // Helper to set cell style
    const sc = (ref: string, style: XLSX.CellStyle) => {
      const cell = ws[ref];
      if (cell) cell.s = { ...(cell.s || {}), ...style };
    };

    // Row 1: Title bar — dark blue with white bold text
    for (const col of ["A", "B", "C", "D", "E", "F", "G", "H", "I"]) {
      const ref = `${col}1`;
      if (!ws[ref]) ws[ref] = { t: "s", v: "" };
      sc(ref, { fill: fillTitle, font: fontBoldWhite, border: borderThin });
    }

    // Rows 2-6: Label cells (col A, G) get light blue bg; value cells get border
    for (let r = 2; r <= 6; r++) {
      for (const col of ["A", "B", "C", "D", "E", "F", "G", "H", "I"]) {
        const ref = `${col}${r}`;
        if (!ws[ref]) ws[ref] = { t: "s", v: "" };
        const isLabel = (col === "A" || col === "G" || col === "F");
        sc(ref, {
          fill: isLabel ? fillLabel : undefined,
          font: isLabel ? fontBold : fontNormal,
          border: borderThin,
        });
      }
    }

    // Row 7: Column headers — blue with white bold
    for (const col of ["A", "B", "C", "D", "E", "F", "G", "H", "I"]) {
      const ref = `${col}7`;
      if (!ws[ref]) ws[ref] = { t: "s", v: "" };
      sc(ref, { fill: fillHeader, font: fontBoldWhite, border: borderThin });
    }

    // Rows 8-22: Data rows with alternating bg + number formatting
    for (let r = 8; r <= 22; r++) {
      const isAlt = (r - 8) % 2 === 1;
      for (const col of ["A", "B", "C", "D", "E", "F", "G", "H", "I"]) {
        const ref = `${col}${r}`;
        if (!ws[ref]) ws[ref] = { t: "s", v: "" };
        const isNum = col === "H" || col === "I";
        sc(ref, {
          fill: isAlt ? fillDataAlt : undefined,
          font: fontNormal,
          border: borderThin,
          alignment: isNum ? { horizontal: "right" } : undefined,
          numFmt: isNum ? numFmt2 : undefined,
        });
        // Apply number format on numeric cells
        if (isNum && ws[ref].t === "n") {
          ws[ref].z = numFmt2;
        }
      }
    }

    // Rows 23-25: Totals — green bg, bold, 2 decimals
    for (let r = 23; r <= 25; r++) {
      for (const col of ["A", "B", "C", "D", "E", "F", "G", "H", "I"]) {
        const ref = `${col}${r}`;
        if (!ws[ref]) ws[ref] = { t: "s", v: "" };
        const isLabel = col === "H";
        const isValue = col === "I";
        sc(ref, {
          fill: fillTotals,
          font: fontBold,
          border: borderThin,
          alignment: (isLabel || isValue) ? { horizontal: "right" } : undefined,
          numFmt: isValue ? numFmt2 : undefined,
        });
        if (isValue && ws[ref].t === "n") {
          ws[ref].z = numFmt2;
        }
      }
    }

    // Merges for description column (E-G) in header
    ws["!merges"] = [
      { s: { r: 6, c: 4 }, e: { r: 6, c: 6 } }, // E7:G7 CONCEPTO
    ];

    const wb = XLSX.utils.book_new();
    const clientLabel = cl.name.replace(/[^a-zA-Z0-9 ]/g, "").substring(0, 30);
    XLSX.utils.book_append_sheet(wb, ws, clientLabel);
    XLSX.writeFile(wb, `Factura ${clientLabel}.xlsx`);

    toast({ title: "Factura descargada", description: `Factura ${clientLabel}.xlsx` });
  };

  /* ── render ── */
  return (
    <div className="relative min-h-screen">
      <AnimatedGridPattern className="fixed inset-0 opacity-20 pointer-events-none" />
      <div className="relative z-10 space-y-6 p-4 md:p-6 max-w-[1400px] mx-auto">

        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground tracking-tight flex items-center gap-2">
              <Receipt className="h-6 w-6" /> Facturación
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Genera facturas desde pedidos existentes
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* Billing entity selector */}
            <Select
              value={activeEntity?.id ?? ""}
              onValueChange={setSelectedEntityId}
            >
              <SelectTrigger className="w-[420px] bg-background">
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                  <SelectValue placeholder="Empresa que factura" />
                </div>
              </SelectTrigger>
              <SelectContent>
                {billingEntities.map(e => (
                  <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" title="Gestionar empresas">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setEntityDialogOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" /> Agregar empresa
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setEntityManageOpen(true)}>
                  <Edit2 className="h-4 w-4 mr-2" /> Editar / Eliminar
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Client + Order selectors */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Client selector */}
          <GlowCard>
            <div className="p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-xs text-muted-foreground uppercase tracking-wider">Cliente</Label>
                {/* Mayoreo / Menudeo / Todos toggle — filters the dropdown below. */}
                <div className="inline-flex rounded-md border bg-muted p-0.5">
                  {(["todos", "mayoreo", "menudeo"] as const).map((opt) => (
                    <button
                      key={opt}
                      onClick={() => setClientTypeFilter(opt)}
                      className={cn(
                        "px-2 py-1 text-[11px] font-semibold rounded transition capitalize",
                        clientTypeFilter === opt
                          ? "bg-background text-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar cliente..."
                  value={clientSearch}
                  onChange={(e) => setClientSearch(e.target.value)}
                  className="pl-9 bg-background"
                />
              </div>
              <Select
                value={selectedClientId}
                onValueChange={(v) => {
                  setSelectedClientId(v);
                  setSelectedOrderId("");
                  setLines([]);
                }}
              >
                <SelectTrigger className="bg-background">
                  <SelectValue placeholder="Seleccionar cliente" />
                </SelectTrigger>
                <SelectContent>
                  {filteredClients.map(c => (
                    <SelectItem key={c.id} value={c.id}>
                      <div className="flex items-center gap-2">
                        <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        {/* Pill on the LEFT so they line up across rows. */}
                        <ClientTypeBadge
                          type={c.client_type}
                          invisible={clientTypeFilter !== "todos"}
                        />
                        <span>{c.name}</span>
                        {c.rfc && <span className="text-xs text-muted-foreground font-mono ml-1">{c.rfc}</span>}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </GlowCard>

          {/* Order selector */}
          <GlowCard>
            <div className="p-4 space-y-3">
              <Label className="text-xs text-muted-foreground uppercase tracking-wider">Pedido</Label>
              <Select
                value={selectedOrderId}
                onValueChange={setSelectedOrderId}
                disabled={!selectedClientId}
              >
                <SelectTrigger className="bg-background">
                  <SelectValue placeholder={selectedClientId ? "Seleccionar pedido" : "Primero selecciona un cliente"} />
                </SelectTrigger>
                <SelectContent>
                  {clientOrders.map(o => (
                    <SelectItem key={o.id} value={o.id}>
                      <div className="flex items-center gap-3">
                        <span className="font-mono font-medium">{o.order_code}</span>
                        <span className="text-xs text-muted-foreground">{o.order_date}</span>
                        <span className={cn(
                          "text-xs px-1.5 py-0.5 rounded",
                          o.status === "Entregado" ? "bg-green-500/10 text-green-500"
                            : o.status === "En ruta" ? "bg-blue-500/10 text-blue-500"
                            : "bg-amber-500/10 text-amber-500"
                        )}>
                          {o.status}
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                  {clientOrders.length === 0 && selectedClientId && (
                    <div className="text-sm text-muted-foreground text-center py-3">Sin pedidos</div>
                  )}
                </SelectContent>
              </Select>
              {selectedClient && (
                <p className="text-xs text-muted-foreground">
                  {clientOrders.length} pedido{clientOrders.length !== 1 ? "s" : ""}
                </p>
              )}
            </div>
          </GlowCard>
        </div>

        {/* CFDI Info + Invoice Preview */}
        {selectedClient && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* CFDI Panel */}
            <GlowCard>
              <div className="p-4 space-y-4">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <h3 className="text-sm font-semibold flex items-center gap-2">
                    <FileText className="h-4 w-4 text-primary" /> Datos Fiscales
                  </h3>
                  <div className="flex items-center gap-1">
                    <Button asChild variant="ghost" size="sm" title="Abrir página completa del cliente">
                      <Link to={`/clients/${selectedClient.id}`}>
                        <ExternalLink className="h-3.5 w-3.5 mr-1" /> Ver cliente
                      </Link>
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setCfdiEditOpen(true)}>
                      <Edit2 className="h-3.5 w-3.5 mr-1" /> Editar
                    </Button>
                  </div>
                </div>

                <div className="space-y-2.5 text-sm">
                  <FiscalField label="Razón Social" value={selectedClient.razon_social ?? selectedClient.nombre_cfdi} />
                  <FiscalField label="RFC" value={selectedClient.rfc} mono />
                  <FiscalField label="Dirección" value={selectedClient.address} />
                  <FiscalField label="C.P." value={selectedClient.codigo_postal} />
                  <FiscalField label="Régimen Fiscal" value={selectedClient.regimen_fiscal} />
                  <FiscalField label="Uso CFDI" value={selectedClient.uso_cfdi} />
                  <FiscalField label="Forma de Pago" value={selectedClient.payment_method} />
                  <FiscalField label="Método de Pago" value={selectedClient.metodo_pago} />
                </div>

                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="w-full mt-2">
                        {selectedClient.cfdi_pdf_path ? (
                          // Real <a> wrapped by Button so iOS Safari treats
                          // the open as a user-initiated navigation. The
                          // previous handler used window.open() inside an
                          // async function and Safari blocked it as a
                          // programmatic popup, leaving the button silent.
                          <Button asChild variant="outline" size="sm" className="w-full">
                            <a
                              href={supabase.storage.from("cfdi-documents").getPublicUrl(selectedClient.cfdi_pdf_path).data.publicUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              <Download className="h-3.5 w-3.5 mr-1.5" /> Descargar CFDI
                            </a>
                          </Button>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            className="w-full opacity-40 cursor-not-allowed"
                            disabled
                          >
                            <Download className="h-3.5 w-3.5 mr-1.5" /> Descargar CFDI
                          </Button>
                        )}
                      </div>
                    </TooltipTrigger>
                    {!selectedClient.cfdi_pdf_path && (
                      <TooltipContent>
                        <p>Este cliente no tiene CFDI adjunto. Súbelo desde la página de Clientes.</p>
                      </TooltipContent>
                    )}
                  </Tooltip>
                </TooltipProvider>
              </div>
            </GlowCard>

            {/* Invoice Lines */}
            <div className="lg:col-span-2">
              <GlowCard>
                <div className="p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold">Conceptos de Factura</h3>
                    <Button
                      onClick={downloadInvoiceExcel}
                      disabled={lines.length === 0}
                      size="sm"
                    >
                      <Download className="h-4 w-4 mr-1.5" /> Descargar Excel
                    </Button>
                  </div>

                  {lines.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground text-sm">
                      {selectedOrderId ? "Cargando conceptos..." : "Selecciona un pedido para generar la factura"}
                    </div>
                  ) : (
                    <>
                      {/* Line items table */}
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-border text-left">
                              <th className="py-2 pr-2 text-xs text-muted-foreground font-medium w-[80px]">Cant.</th>
                              <th className="py-2 pr-2 text-xs text-muted-foreground font-medium w-[100px]">Modelo</th>
                              <th className="py-2 pr-2 text-xs text-muted-foreground font-medium">Descripción</th>
                              <th className="py-2 pr-2 text-xs text-muted-foreground font-medium text-right w-[120px]">P.U. (sin IVA)</th>
                              <th className="py-2 text-xs text-muted-foreground font-medium text-right w-[120px]">Subtotal</th>
                              <th className="w-[36px]" />
                            </tr>
                          </thead>
                          <tbody>
                            {lines.map((line, idx) => (
                              <tr key={idx} className="border-b border-border/50">
                                <td className="py-2 pr-2">
                                  <Input
                                    type="text"
                                    inputMode="numeric"
                                    value={String(line.cantidad)}
                                    onChange={(e) => updateLine(idx, "cantidad", parseInt(e.target.value.replace(/\D/g, "")) || 0)}
                                    className="h-8 w-[70px] text-sm tabular-nums"
                                  />
                                </td>
                                <td className="py-2 pr-2">
                                  <span className="font-mono text-xs text-primary">{line.modelo}</span>
                                </td>
                                <td className="py-2 pr-2">
                                  <span className="text-foreground text-sm">{line.descripcion}</span>
                                </td>
                                <td className="py-2 pr-2 text-right">
                                  <span className="tabular-nums text-foreground">
                                    {fmtCurrency(line.valor_unitario)}
                                  </span>
                                </td>
                                <td className="py-2 text-right">
                                  <span className="tabular-nums font-medium text-foreground">
                                    {fmtCurrency(line.valor_unitario * line.cantidad)}
                                  </span>
                                </td>
                                <td className="py-2 pl-1">
                                  <button
                                    onClick={() => removeLine(idx)}
                                    className="p-1 rounded hover:bg-red-500/10 text-muted-foreground hover:text-red-500 transition-colors"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {/* Totals */}
                      <div className="flex justify-end">
                        <div className="w-[280px] space-y-1.5 text-sm">
                          <div className="flex justify-between text-muted-foreground">
                            <span>Subtotal</span>
                            <span className="tabular-nums">{fmtCurrency(subtotal)}</span>
                          </div>
                          <div className="flex justify-between text-muted-foreground">
                            <span>IVA (16%)</span>
                            <span className="tabular-nums">{fmtCurrency(iva)}</span>
                          </div>
                          <div className="flex justify-between font-bold text-foreground pt-1.5 border-t border-border">
                            <span>Total</span>
                            <span className="tabular-nums">{fmtCurrency(total)}</span>
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </GlowCard>
            </div>
          </div>
        )}

        {/* Empty state */}
        {!selectedClient && !loadingClients && (
          <GlowCard>
            <div className="text-center py-16 space-y-3">
              <Receipt className="h-12 w-12 text-muted-foreground/30 mx-auto" />
              <p className="text-muted-foreground text-sm">
                Selecciona un cliente para comenzar a facturar
              </p>
            </div>
          </GlowCard>
        )}

        {/* CFDI Edit Dialog */}
        <CfdiEditDialog
          open={cfdiEditOpen}
          onOpenChange={setCfdiEditOpen}
          client={selectedClient}
          onSaved={() => queryClient.invalidateQueries({ queryKey: ["facturacion-clients"] })}
        />

        {/* Billing Entity Dialog */}
        <BillingEntityDialog
          open={entityDialogOpen}
          onOpenChange={setEntityDialogOpen}
          onSaved={() => queryClient.invalidateQueries({ queryKey: ["billing-entities"] })}
        />

        {/* Billing Entity Manage Dialog */}
        <EntityManageDialog
          open={entityManageOpen}
          onOpenChange={setEntityManageOpen}
          entities={billingEntities}
          onChanged={() => queryClient.invalidateQueries({ queryKey: ["billing-entities"] })}
        />
      </div>
    </div>
  );
}

/* ── small helper ── */
function FiscalField({ label, value, mono }: { label: string; value: string | null | undefined; mono?: boolean }) {
  return (
    <div>
      <span className="text-xs text-muted-foreground">{label}</span>
      <p className={cn("text-foreground truncate", mono && "font-mono text-xs", !value && "text-muted-foreground italic")}>
        {value || "Sin datos"}
      </p>
    </div>
  );
}

/* ── CFDI Edit Dialog ── */
function CfdiEditDialog({
  open, onOpenChange, client, onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  client: ClientRow | null;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [form, setForm] = useState<Record<string, string>>({});

  // Populate form when client changes
  useMemo(() => {
    if (client && open) {
      setForm({
        razon_social: client.razon_social ?? client.nombre_cfdi ?? "",
        rfc: client.rfc ?? "",
        address: client.address ?? "",
        codigo_postal: client.codigo_postal ?? "",
        regimen_fiscal: client.regimen_fiscal ?? "",
        uso_cfdi: client.uso_cfdi ?? "Adquisición de mercancías",
        payment_method: client.payment_method ?? "Transferencia",
        metodo_pago: client.metodo_pago ?? "PUE",
      });
    }
  }, [client, open]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!client) return;
      const { error } = await supabase
        .from("clients")
        .update({
          razon_social: form.razon_social || null,
          rfc: form.rfc || null,
          address: form.address || null,
          codigo_postal: form.codigo_postal || null,
          regimen_fiscal: form.regimen_fiscal || null,
          uso_cfdi: form.uso_cfdi || null,
          payment_method: form.payment_method || null,
          metodo_pago: form.metodo_pago || null,
        })
        .eq("id", client.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Datos fiscales actualizados" });
      onSaved();
      onOpenChange(false);
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const set = (k: string, v: string) => setForm(prev => ({ ...prev, [k]: v }));

  if (!client) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Datos Fiscales — {client.name}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
          <div className="space-y-1.5">
            <Label>Razón Social</Label>
            <Input value={form.razon_social ?? ""} onChange={e => set("razon_social", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>RFC</Label>
            <Input value={form.rfc ?? ""} onChange={e => set("rfc", e.target.value.toUpperCase())} className="font-mono" />
          </div>
          <div className="md:col-span-2 space-y-1.5">
            <Label>Dirección Fiscal</Label>
            <Input value={form.address ?? ""} onChange={e => set("address", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Código Postal</Label>
            <Input value={form.codigo_postal ?? ""} onChange={e => set("codigo_postal", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Régimen Fiscal</Label>
            <Select value={form.regimen_fiscal ?? ""} onValueChange={v => set("regimen_fiscal", v)}>
              <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
              <SelectContent>
                {REGIMEN_OPTIONS.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Uso CFDI</Label>
            <Select value={form.uso_cfdi ?? ""} onValueChange={v => set("uso_cfdi", v)}>
              <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
              <SelectContent>
                {USO_CFDI_OPTIONS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Forma de Pago</Label>
            <Select value={form.payment_method ?? ""} onValueChange={v => set("payment_method", v)}>
              <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
              <SelectContent>
                {FORMA_PAGO_OPTIONS.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Método de Pago</Label>
            <Select value={form.metodo_pago ?? ""} onValueChange={v => set("metodo_pago", v)}>
              <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
              <SelectContent>
                {METODO_PAGO_OPTIONS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex justify-end gap-3 pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending ? "Guardando..." : "Guardar"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ── Billing Entity Dialog ── */
function BillingEntityDialog({
  open, onOpenChange, onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [name, setName] = useState("");

  const mutation = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error("Nombre requerido");
      const { error } = await supabase
        .from("billing_entities" as any)
        .insert({ name: name.trim(), is_default: false });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Empresa registrada" });
      setName("");
      onSaved();
      onOpenChange(false);
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Registrar Empresa que Factura</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 pt-2">
          <div className="space-y-1.5">
            <Label>Nombre / Razón Social</Label>
            <Input
              placeholder="Ej: COMERCIALIZADORA EJEMPLO SA DE CV"
              value={name}
              onChange={(e) => setName(e.target.value.toUpperCase())}
            />
          </div>
        </div>
        <div className="flex justify-end gap-3 pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || !name.trim()}>
            {mutation.isPending ? "Guardando..." : "Registrar"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ── Entity Manage Dialog (edit / delete) ── */
function EntityManageDialog({
  open, onOpenChange, entities, onChanged,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  entities: BillingEntity[];
  onChanged: () => void;
}) {
  const { toast } = useToast();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const startEdit = (e: BillingEntity) => {
    setEditingId(e.id);
    setEditName(e.name);
  };

  const saveEdit = async () => {
    if (!editingId || !editName.trim()) return;
    const { error } = await supabase
      .from("billing_entities" as any)
      .update({ name: editName.trim() })
      .eq("id", editingId);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Empresa actualizada" });
    setEditingId(null);
    onChanged();
  };

  const deleteEntity = async (id: string, name: string) => {
    const { error } = await supabase
      .from("billing_entities" as any)
      .delete()
      .eq("id", id);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Empresa eliminada", description: name });
    onChanged();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Gestionar Empresas</DialogTitle>
        </DialogHeader>
        <div className="space-y-2 pt-2">
          {entities.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">No hay empresas registradas</p>
          )}
          {entities.map(e => (
            <div key={e.id} className="flex items-center gap-2 p-2 rounded-lg border border-border">
              {editingId === e.id ? (
                <>
                  <Input
                    value={editName}
                    onChange={ev => setEditName(ev.target.value.toUpperCase())}
                    className="flex-1 h-8 text-sm"
                    autoFocus
                  />
                  <Button size="icon" variant="ghost" className="h-8 w-8 text-green-500" onClick={saveEdit}>
                    <Check className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEditingId(null)}>
                    <X className="h-4 w-4" />
                  </Button>
                </>
              ) : (
                <>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{e.name}</p>
                    {e.is_default && <span className="text-[10px] text-primary font-medium">PREDETERMINADA</span>}
                  </div>
                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => startEdit(e)}>
                    <Edit2 className="h-3.5 w-3.5" />
                  </Button>
                  {!e.is_default && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-500/10"
                      onClick={() => deleteEntity(e.id, e.name)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
