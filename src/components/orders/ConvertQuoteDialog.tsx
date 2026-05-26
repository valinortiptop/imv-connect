// @ts-nocheck
import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, Loader2, ShoppingCart } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { calendarDateToString } from "@/lib/date-utils";

export interface QuoteLineForConversion {
  productId: string;
  clave: string;
  productName: string;
  bolsas: number;
  precioBolsa: number;
  totalIvaIncluido: number;
}

interface ConvertQuoteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isConverting: boolean;
  onConfirm: (data: {
    clientId: string;
    clientName: string;
    deliveryDate: string | null;
    notes: string;
  }) => void;
  quoteItems: QuoteLineForConversion[];
  quoteTotalIva: number;
}

const fmtMXN = (n: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 0 }).format(n);

export function ConvertQuoteDialog({
  open,
  onOpenChange,
  isConverting,
  onConfirm,
  quoteItems,
  quoteTotalIva,
}: ConvertQuoteDialogProps) {
  const [clientTab, setClientTab] = useState<string>("existing");
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [newClientName, setNewClientName] = useState("");
  const [newClientPhone, setNewClientPhone] = useState("");
  const [deliveryDate, setDeliveryDate] = useState<Date | undefined>(undefined);
  const [notes, setNotes] = useState("");
  const [calendarOpen, setCalendarOpen] = useState(false);

  const { data: clients = [] } = useQuery({
    queryKey: ["clients-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("*")
        .eq("active", true)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 2 * 60 * 1000,
    enabled: open,
  });

  useEffect(() => {
    if (!open) {
      setClientTab("existing");
      setSelectedClientId(null);
      setNewClientName("");
      setNewClientPhone("");
      setDeliveryDate(undefined);
      setNotes("");
    }
  }, [open]);

  const selectedClient = clients.find((c) => c.id === selectedClientId);

  const canConfirm =
    !isConverting &&
    quoteItems.length > 0 &&
    ((clientTab === "existing" && selectedClientId) ||
      (clientTab === "new" && newClientName.trim().length > 0));

  function handleConfirm() {
    if (!canConfirm) return;
    const clientId = clientTab === "existing" ? selectedClientId! : "";
    const clientName =
      clientTab === "existing"
        ? selectedClient?.name ?? ""
        : newClientName.trim();
    onConfirm({
      clientId,
      clientName,
      deliveryDate: deliveryDate ? calendarDateToString(deliveryDate) : null,
      notes: notes.trim(),
    });
  }

  const totalBultos = quoteItems.reduce((s, i) => s + i.bolsas, 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl flex items-center gap-2">
            <ShoppingCart className="h-5 w-5" />
            Crear pedido desde cotización
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 mt-2">
          {/* Client selection */}
          <div className="border border-border rounded-lg p-4 space-y-3">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Cliente
            </h3>
            <Tabs value={clientTab} onValueChange={(t) => { setClientTab(t); setSelectedClientId(null); setNewClientName(""); setNewClientPhone(""); }}>
              <TabsList className="w-full">
                <TabsTrigger value="existing" className="flex-1">Existente</TabsTrigger>
                <TabsTrigger value="new" className="flex-1">Nuevo</TabsTrigger>
              </TabsList>

              <TabsContent value="existing" className="mt-3 space-y-3">
                <Select value={selectedClientId ?? ""} onValueChange={setSelectedClientId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar cliente..." />
                  </SelectTrigger>
                  <SelectContent>
                    {clients.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                        {c.company ? ` — ${c.company}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedClient && (
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Teléfono</span>
                      <span>{selectedClient.phone || "—"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Dirección</span>
                      <span className="text-right max-w-[250px] truncate">
                        {selectedClient.address || "—"}
                      </span>
                    </div>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="new" className="mt-3 space-y-3">
                <div>
                  <Label>Nombre *</Label>
                  <Input
                    placeholder="Nombre del cliente"
                    value={newClientName}
                    onChange={(e) => setNewClientName(e.target.value)}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>Teléfono</Label>
                  <Input
                    placeholder="Teléfono (opcional)"
                    value={newClientPhone}
                    onChange={(e) => setNewClientPhone(e.target.value)}
                    className="mt-1"
                  />
                </div>
              </TabsContent>
            </Tabs>
          </div>

          {/* Delivery date + notes */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Fecha de entrega (opcional)</Label>
              <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal mt-1",
                      !deliveryDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {deliveryDate
                      ? `${String(deliveryDate.getDate()).padStart(2, "0")}/${String(deliveryDate.getMonth() + 1).padStart(2, "0")}/${deliveryDate.getFullYear()}`
                      : "Sin fecha"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={deliveryDate}
                    onSelect={(d) => { setDeliveryDate(d); setCalendarOpen(false); }}
                    locale={es}
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div>
              <Label>Notas (opcional)</Label>
              <Input
                placeholder="Notas del pedido"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="mt-1"
              />
            </div>
          </div>

          {/* Order summary */}
          <div className="border border-border rounded-lg p-4 space-y-3">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Resumen del pedido ({quoteItems.length} productos, {totalBultos} bultos)
            </h3>
            <div className="space-y-0">
              <div className="grid grid-cols-[1fr_80px_100px_100px] gap-2 text-xs text-muted-foreground font-medium py-1 border-b border-border">
                <div>Producto</div>
                <div className="text-center">Bultos</div>
                <div className="text-right">Precio/u</div>
                <div className="text-right">Subtotal</div>
              </div>
              {quoteItems.map((item, idx) => (
                <div
                  key={idx}
                  className="grid grid-cols-[1fr_80px_100px_100px] gap-2 items-center py-2 border-b border-border/50 text-sm"
                >
                  <div>
                    <span className="font-mono text-xs text-primary">{item.clave}</span>
                    <span className="ml-2 truncate">{item.productName}</span>
                  </div>
                  <div className="text-center tabular-nums">{item.bolsas}</div>
                  <div className="text-right tabular-nums">{fmtMXN(item.precioBolsa)}</div>
                  <div className="text-right tabular-nums font-medium">
                    {fmtMXN(item.totalIvaIncluido)}
                  </div>
                </div>
              ))}
              <div className="grid grid-cols-[1fr_80px_100px_100px] gap-2 py-2">
                <div className="text-sm font-semibold">Total</div>
                <div className="text-center text-sm font-medium">{totalBultos}</div>
                <div />
                <div className="text-right text-sm font-bold text-primary">
                  {fmtMXN(quoteTotalIva)}
                </div>
              </div>
            </div>
          </div>

          {/* Actions */}
          <Button
            className="w-full h-11 text-base gradient-button text-white"
            disabled={!canConfirm}
            onClick={handleConfirm}
          >
            {isConverting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creando pedido...
              </>
            ) : (
              <>
                <ShoppingCart className="mr-2 h-4 w-4" />
                Crear Pedido — {fmtMXN(quoteTotalIva)}
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
