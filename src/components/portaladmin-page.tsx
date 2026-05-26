import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/hooks/use-language";
import { useToast } from "@/hooks/use-toast";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Search,
  Link2,
  ExternalLink,
  Copy,
  Check,
  Eye,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ClientWithPortal {
  id: string;
  name: string;
  company: string | null;
  phone: string | null;
  active: boolean;
  portal_token?: {
    id: string;
    token: string;
    is_active: boolean;
    created_at: string;
  } | null;
}

const PORTAL_BASE = typeof window !== "undefined" ? window.location.origin : "";

export default function PortalAdmin() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Fetch all clients with their portal tokens
  const { data: clients = [], isLoading } = useQuery({
    queryKey: ["portal-admin-clients"],
    queryFn: async () => {
      const { data: clientData, error: cErr } = await supabase
        .from("clients")
        .select("id, name, company, phone, active")
        .order("name");

      if (cErr) throw cErr;

      const { data: tokens, error: tErr } = await supabase
        .from("client_portal_tokens" as any)
        .select("id, client_id, token, is_active, created_at");

      if (tErr) throw tErr;

      const tokenMap = new Map<string, any>();
      for (const t of (tokens as any[]) || []) {
        tokenMap.set(t.client_id, t);
      }

      return (clientData || []).map((c: any) => ({
        ...c,
        portal_token: tokenMap.get(c.id) || null,
      })) as ClientWithPortal[];
    },
  });

  // Generate portal link via the SQL helper — produces a readable
  // <slug>-<4ch> token (e.g. "alexis-villalon-x7k2") instead of the
  // old 32-char hex blob.
  const generateToken = useMutation({
    mutationFn: async (clientId: string) => {
      const { data, error } = await (supabase as any).rpc("mint_portal_token", { p_client_id: clientId });
      if (error) throw error;
      return { token: data };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["portal-admin-clients"] });
      toast({ title: "Portal activado", description: "Enlace generado exitosamente" });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  // Toggle portal active state
  const toggleActive = useMutation({
    mutationFn: async ({ tokenId, isActive }: { tokenId: string; isActive: boolean }) => {
      const { error } = await supabase
        .from("client_portal_tokens" as any)
        .update({
          is_active: isActive,
          deactivated_at: isActive ? null : new Date().toISOString(),
        } as any)
        .eq("id", tokenId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["portal-admin-clients"] });
    },
  });

  const filtered = useMemo(() => {
    if (!search.trim()) return clients;
    const q = search.toLowerCase();
    return clients.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.company?.toLowerCase().includes(q) ||
        c.phone?.includes(q)
    );
  }, [clients, search]);

  /**
   * iOS-reliable copy: write into a temporary off-screen <input>,
   * select it, then document.execCommand("copy"). All sync inside the
   * click event — the only path iOS Safari accepts in every context.
   * Falls back to navigator.clipboard.writeText for environments where
   * execCommand is disabled.
   */
  const copyLink = (token: string, clientId: string) => {
    const url = `${PORTAL_BASE}/portal/${token}`;
    let copied = false;
    try {
      const ta = document.createElement("textarea");
      ta.value = url;
      // Off-screen but still rendered (iOS won't copy from display:none).
      ta.style.position = "fixed";
      ta.style.top = "0";
      ta.style.left = "0";
      ta.style.opacity = "0";
      ta.setAttribute("readonly", "");
      document.body.appendChild(ta);
      ta.focus({ preventScroll: true });
      ta.select();
      ta.setSelectionRange(0, ta.value.length); // iOS-required after select()
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


  const activeCount = clients.filter((c) => c.portal_token?.is_active).length;

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Portal de Clientes</h1>
          <p className="text-sm text-muted-foreground">
            Genera enlaces personales para que tus clientes hagan pedidos.{" "}
            <span className="font-medium text-blue-600">{activeCount} portales activos</span>
          </p>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar cliente..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Table */}
      {isLoading ? (
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
                <TableHead className="hidden sm:table-cell">Teléfono</TableHead>
                <TableHead>Portal</TableHead>
                <TableHead>Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((client) => {
                const token = client.portal_token;
                const hasPortal = !!token;
                const isActive = token?.is_active ?? false;

                return (
                  <TableRow key={client.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{client.name}</p>
                        {client.company && (
                          <p className="text-xs text-muted-foreground">{client.company}</p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <span className="text-sm text-muted-foreground">
                        {client.phone || "—"}
                      </span>
                    </TableCell>
                    <TableCell>
                      {hasPortal ? (
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={isActive}
                            onCheckedChange={(checked) =>
                              toggleActive.mutate({ tokenId: token!.id, isActive: checked })
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
                          onClick={() => generateToken.mutate(client.id)}
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
                      {hasPortal && isActive && (
                        <div className="flex items-center gap-1">
                          {/* Copy link */}
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            onClick={() => copyLink(token!.token, client.id)}
                            title="Copiar enlace"
                          >
                            {copiedId === client.id ? (
                              <Check className="h-3.5 w-3.5 text-green-600" />
                            ) : (
                              <Copy className="h-3.5 w-3.5" />
                            )}
                          </Button>

                          {/* Preview as client — real <a> so iOS Safari
                              treats it as a navigation, not a programmatic
                              popup (which it blocks). */}
                          <Button asChild size="icon" variant="ghost" className="h-8 w-8" title="Ver como cliente">
                            <a
                              href={`${PORTAL_BASE}/portal/${token!.token}`}
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
