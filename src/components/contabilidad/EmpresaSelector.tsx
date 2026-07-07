import { Link } from "@tanstack/react-router";
import { Building2, ChevronDown } from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { useSelectedEmpresa } from "@/hooks/use-selected-empresa";

/** Compact company selector rendered on top of every Contabilidad page. */
export function EmpresaSelector() {
  const { empresas, selected, select } = useSelectedEmpresa();

  if (empresas.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border bg-muted/30 p-3 text-sm">
        <p className="text-muted-foreground">
          Aún no tienes empresas registradas.{" "}
          <Link to="/admin/empresas" className="text-primary underline underline-offset-2">
            Registra la primera
          </Link>{" "}
          para poder llevar contabilidad.
        </p>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs uppercase tracking-wider text-muted-foreground">Contabilidad de</span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="gap-2">
            <Building2 className="h-4 w-4 text-primary" />
            <span className="max-w-[240px] truncate">
              {selected?.nombre_comercial || selected?.razon_social || "Elegir empresa"}
            </span>
            <ChevronDown className="h-3.5 w-3.5 opacity-60" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-[280px]">
          {empresas.map((e) => (
            <DropdownMenuItem key={e.id} onClick={() => select(e.id)}>
              <div className="flex flex-col min-w-0">
                <span className="truncate font-medium">{e.nombre_comercial || e.razon_social}</span>
                <span className="text-[10px] font-mono text-muted-foreground">{e.rfc}</span>
              </div>
              {e.is_default && (
                <span className="ml-auto text-[10px] rounded bg-primary/10 text-primary px-1.5 py-0.5">default</span>
              )}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
