// @ts-nocheck
import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Search, Link2, Copy, Check, Eye, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Client360Drawer } from "@/components/clients/Client360Drawer";

interface ClientRow {
  id: string;
  name: string | null;
  company: string | null;
  phone: string | null;
  portal_activo: boolean | null;
  token_portal: string | null;
}

const PORTAL_BASE = typeof window !== "undefined" ? window.location.origin : "";

function makeToken(name: string | null) {
  const slug = (name || "cliente")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "cliente";
  const suffix = Math.random().toString(36).slice(2, 6);
  return `${slug}-${suffix}`;
}

export default function PortalAdmin() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [drawerClientId, setDrawerClientId] = useState<string | null>(null);

  const { data: clients = [], isLoading, error } = useQuery({
    queryKey: ["portal-admin-clients"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, name, company, phone, portal_activo, token_portal")
        .order("name");
      if (error) throw error;
      return (data || []) as ClientRow[];
    },
  });

  // Last sale per client (from orders)
  const { data: lastSaleByClient = {} } = useQuery({
    queryKey: ["portal-admin-last-sale"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("client_id, order_date")
        .not("status", "eq", "Cancelado")
        .order("order_date", { ascending: false })
        .limit(5000);
      if (error) throw error;
      const map: Record<string, string> = {};
      for (const r of (data ?? []) as any[]) {
        if (r.client_id && !map[r.client_id]) map[r.client_id] = r.order_date;
      }
      return map;
    },
  });


  const generateToken = useMutation({
    mutationFn: async (client: ClientRow) => {
      const token = makeToken(client.name);
      const { error } = await supabase
        .from("clients")
        .update({ token_portal: token, portal_activo: true } as any)
        .eq("id", client.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["portal-admin-clients"] });
      toast({ title: "Portal activado", description: "Enlace generado exitosamente" });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const { error } = await supabase
        .from("clients")
        .update({ portal_activo: isActive } as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["portal-admin-clients"] });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const filtered = useMemo(() => {
    if (!search.trim()) return clients;
    const q = search.toLowerCase();
    return clients.filter(
      (c) =>
        (c.name || "").toLowerCase().includes(q) ||
        (c.company || "").toLowerCase().includes(q) ||
        (c.phone || "").includes(q)
    );
  }, [clients, search]);

  const copyLink = (token: string, clientId: string) => {
    const url = `${PORTAL_BASE}/portal/${token}`;
    let copied = false;
    try {
      const ta = document.createElement("textarea");
      ta.value = url;
      ta.style.position = "fixed";
      ta.style.top = "0";
      ta.style.left = "0";
      ta.style.opacity = "0";
      ta.setAttribute("readonly", "");
      document.body.appendChild(ta);
      ta.focus({ preventScroll: true });
      ta.select();
      ta.setSelectionRange(0, ta.value.length);
      copied = document.execCommand("copy");
      document.body.removeChild(ta);
    } catch {
      copied = false;
    }
    if (copied) {
      setCopiedId(clientId);
      setTimeout(() => setCopiedId(null), 2000);
      return;
    }
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(url).then(
        () => {
          setCopiedId(clientId);
          setTimeout(() => setCopiedId(null), 2000);
        },
        () => {
          toast({ title: "No se pudo copiar", description: "Mantén presionado el link y elige Copiar" });
        },
      );
      return;
    }
    toast({ title: "No se pudo copiar el enlace" });
  };

  const activeCount = clients.filter((c) => c.portal_activo && c.token_portal).length;

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Portal de Clientes</h1>
          <p className="text-sm text-muted-foreground">
            Genera enlaces personales para que tus clientes hagan pedidos.{" "}
            <span className="font-medium text-blue-600">{activeCount} portales activos</span>
          </p>
        </div>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar cliente..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {error ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {(error as Error).message}
        </div>
      ) : isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead className="hidden sm:table-cell">Última venta</TableHead>
                <TableHead>Portal</TableHead>
                <TableHead>Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((client) => {
                const hasToken = !!client.token_portal;
                const isActive = !!client.portal_activo && hasToken;
                const lastSaleDate = lastSaleByClient[client.id] || null;
                const daysSince = lastSaleDate
                  ? Math.floor((Date.now() - new Date(lastSaleDate).getTime()) / 86400000)
                  : null;

                return (
                  <TableRow key={client.id}>
                    <TableCell>
                      <button
                        type="button"
                        onClick={() => setDrawerClientId(client.id)}
                        className="text-left hover:underline focus:outline-none focus:underline"
                      >
                        <p className="font-medium">{client.name || "—"}</p>
                        {client.company && (
                          <p className="text-xs text-muted-foreground">{client.company}</p>
                        )}
                      </button>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      {lastSaleDate ? (
                        <div className="text-sm">
                          <div>{new Date(lastSaleDate).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" })}</div>
                          <div className={cn(
                            "text-xs",
                            daysSince !== null && daysSince > 60 ? "text-red-600" : daysSince !== null && daysSince > 30 ? "text-amber-600" : "text-muted-foreground"
                          )}>
                            {daysSince === 0 ? "hoy" : `hace ${daysSince} ${daysSince === 1 ? "día" : "días"}`}
                          </div>
                        </div>
                      ) : (
                        <span className="text-sm text-muted-foreground">Sin ventas</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {hasToken ? (
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={isActive}
                            onCheckedChange={(checked) =>
                              toggleActive.mutate({ id: client.id, isActive: checked })
                            }
                          />
                          <Badge
                            variant="outline"
                            className={cn(
                              "text-xs",
                              isActive
                                ? "bg-green-50 text-green-700 border-green-200"
                                : "bg-gray-50 text-gray-500 border-gray-200"
                            )}
                          >
                            {isActive ? "Activo" : "Inactivo"}
                          </Badge>
                        </div>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => generateToken.mutate(client)}
                          disabled={generateToken.isPending}
                          className="text-xs"
                        >
                          {generateToken.isPending ? (
                            <Loader2 className="h-3 w-3 animate-spin mr-1" />
                          ) : (
                            <Link2 className="h-3 w-3 mr-1" />
                          )}
                          Generar enlace
                        </Button>
                      )}
                    </TableCell>
                    <TableCell>
                      {isActive && client.token_portal && (
                        <div className="flex items-center gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            onClick={() => copyLink(client.token_portal!, client.id)}
                            title="Copiar enlace"
                          >
                            {copiedId === client.id ? (
                              <Check className="h-3.5 w-3.5 text-green-600" />
                            ) : (
                              <Copy className="h-3.5 w-3.5" />
                            )}
                          </Button>
                          <Button asChild size="icon" variant="ghost" className="h-8 w-8" title="Ver como cliente">
                            <a
                              href={`${PORTAL_BASE}/portal/${client.token_portal}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              aria-label="Ver como cliente"
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </a>
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}

              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                    {search ? "No se encontraron clientes" : "No hay clientes registrados"}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
