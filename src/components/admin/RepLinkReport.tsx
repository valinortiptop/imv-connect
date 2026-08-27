import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";

type Row = {
  representante_id: string;
  nombre: string;
  email: string | null;
  user_id: string | null;
  tiene_cuenta: boolean;
  tiene_rol: boolean;
  activo: boolean;
};

export default function RepLinkReport() {
  const { data, isLoading } = useQuery({
    queryKey: ["rep-account-link-report"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("rep_account_link_report");
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  const rows = data ?? [];
  const pendientes = rows.filter((r) => r.activo && (!r.tiene_cuenta || !r.tiene_rol));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          Vendedores y sus cuentas de acceso
          {pendientes.length > 0 && (
            <Badge variant="outline" className="border-destructive/40 text-destructive">
              {pendientes.length} por resolver
            </Badge>
          )}
        </CardTitle>
        <CardDescription>
          Un vendedor sin cuenta ligada o sin el rol de representante no podrá registrar check-in ni
          check-out en campo.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Sin representantes.</p>
        ) : (
          <div className="space-y-2">
            {rows.map((r) => {
              const ok = r.tiene_cuenta && r.tiene_rol;
              return (
                <div
                  key={r.representante_id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-3 text-sm"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 font-medium">
                      {ok ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      ) : (
                        <AlertTriangle className="h-4 w-4 text-destructive" />
                      )}
                      <span className="truncate">{r.nombre}</span>
                      {!r.activo && (
                        <Badge variant="outline" className="text-muted-foreground">
                          inactivo
                        </Badge>
                      )}
                    </div>
                    <div className="mt-0.5 truncate text-xs text-muted-foreground">
                      {r.email ?? "sin correo registrado"}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {!r.email && (
                      <Badge variant="outline" className="border-destructive/40 text-destructive">
                        falta correo
                      </Badge>
                    )}
                    {!r.tiene_cuenta ? (
                      <Badge variant="outline" className="border-destructive/40 text-destructive">
                        sin cuenta de acceso
                      </Badge>
                    ) : !r.tiene_rol ? (
                      <Badge variant="outline" className="border-amber-500/40 text-amber-600">
                        sin rol representante
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="border-emerald-500/40 text-emerald-600">
                        listo
                      </Badge>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
