import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ShieldCheck, CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import { EmpresaSelector } from "@/components/contabilidad/EmpresaSelector";
import { useSelectedEmpresa } from "@/hooks/use-selected-empresa";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/admin/contabilidad/sat")({
  head: () => ({ meta: [{ title: "Cumplimiento SAT — Contabilidad" }] }),
  component: SATPage,
});

function SATPage() {
  const { selected } = useSelectedEmpresa();
  const empresaId = selected?.id;

  const { data: empresa } = useQuery({
    queryKey: ["empresa-sat", empresaId],
    enabled: !!empresaId,
    queryFn: async () => {
      const { data, error } = await supabase.from("empresas" as any).select("*").eq("id", empresaId!).single();
      if (error) throw error;
      return data as any;
    },
  });

  const { data: cuentas = [] } = useQuery({
    queryKey: ["cuentas-count", empresaId],
    enabled: !!empresaId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cuentas_contables" as any)
        .select("id, nivel, codigo_agrupador, permite_movimientos")
        .eq("empresa_id", empresaId!);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const { data: polizasMes = [] } = useQuery({
    queryKey: ["polizas-mes-sat", empresaId],
    enabled: !!empresaId,
    queryFn: async () => {
      const hoy = new Date();
      const inicio = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}-01`;
      const { data, error } = await supabase
        .from("polizas" as any)
        .select("id, tipo, estado, total_cargos, total_abonos")
        .eq("empresa_id", empresaId!)
        .gte("fecha", inicio);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const checks = empresa ? evaluar(empresa, cuentas, polizasMes) : [];
  const pass = checks.filter((c) => c.status === "ok").length;
  const semaforo = checks.some((c) => c.status === "error")
    ? "error" : checks.some((c) => c.status === "warn") ? "warn" : "ok";

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-primary" /> Cumplimiento SAT
          </h1>
          <p className="text-sm text-muted-foreground">
            Reglas del Anexo 24 y RMF 2.8.1.6. Semáforo del mes en curso para envío al buzón tributario.
          </p>
        </div>
        <EmpresaSelector />
      </div>

      {!empresaId ? (
        <div className="rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">Elige una empresa.</div>
      ) : (
        <>
          <div className={`rounded-lg border-2 p-5 ${
            semaforo === "ok" ? "border-emerald-500/50 bg-emerald-500/5"
            : semaforo === "warn" ? "border-amber-500/50 bg-amber-500/5"
            : "border-destructive/50 bg-destructive/5"
          }`}>
            <div className="flex items-center gap-3">
              {semaforo === "ok" ? <CheckCircle2 className="h-8 w-8 text-emerald-500" />
                : semaforo === "warn" ? <AlertTriangle className="h-8 w-8 text-amber-500" />
                : <XCircle className="h-8 w-8 text-destructive" />}
              <div>
                <div className="font-semibold text-lg">
                  {semaforo === "ok" ? "Listo para envío" : semaforo === "warn" ? "Revisar antes de enviar" : "No cumple aún"}
                </div>
                <div className="text-sm text-muted-foreground">{pass} de {checks.length} verificaciones OK</div>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-border divide-y divide-border">
            {checks.map((c, i) => (
              <div key={i} className="p-3 flex items-start gap-3">
                {c.status === "ok" ? <CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
                  : c.status === "warn" ? <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                  : <XCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />}
                <div className="min-w-0">
                  <div className="text-sm font-medium">{c.titulo}</div>
                  <div className="text-xs text-muted-foreground">{c.detalle}</div>
                  {c.norma && <Badge variant="outline" className="text-[10px] mt-1">{c.norma}</Badge>}
                </div>
              </div>
            ))}
          </div>

          <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 text-sm">
            <p className="font-medium mb-2">Fase 2 — XMLs SAT sellados</p>
            <p className="text-muted-foreground">
              En la siguiente entrega: exportación Anexo 24 del Catálogo de cuentas, Balanza (normal/complementaria/cierre)
              y Pólizas del periodo, sellado con CSD y validación XSD listo para el buzón tributario.
            </p>
          </div>
        </>
      )}
    </section>
  );
}

type Check = { titulo: string; detalle: string; status: "ok" | "warn" | "error"; norma?: string };

function evaluar(empresa: any, cuentas: any[], polizas: any[]): Check[] {
  const out: Check[] = [];
  out.push({
    titulo: "RFC del emisor",
    detalle: empresa.rfc ? `RFC ${empresa.rfc}` : "Falta el RFC en la empresa",
    status: empresa.rfc ? "ok" : "error",
    norma: "CFF Art. 27",
  });
  out.push({
    titulo: "Régimen fiscal",
    detalle: empresa.regimen_fiscal || "Falta el régimen fiscal",
    status: empresa.regimen_fiscal ? "ok" : "error",
    norma: "CFDI 4.0",
  });
  out.push({
    titulo: "Código postal fiscal (lugar de expedición)",
    detalle: empresa.cp_fiscal ? `CP ${empresa.cp_fiscal}` : "Falta CP fiscal",
    status: empresa.cp_fiscal ? "ok" : "error",
    norma: "Anexo 20",
  });

  const conAgrupador = cuentas.filter((c) => c.permite_movimientos && c.codigo_agrupador).length;
  const totalMov = cuentas.filter((c) => c.permite_movimientos).length;
  out.push({
    titulo: "Cuentas de movimiento con código agrupador",
    detalle: `${conAgrupador} / ${totalMov} cuentas de movimiento tienen código agrupador SAT`,
    status: totalMov === 0 ? "warn" : conAgrupador === totalMov ? "ok" : "warn",
    norma: "Anexo 24",
  });

  const nivelSuficiente = cuentas.some((c) => c.nivel >= 2);
  out.push({
    titulo: "Cuentas de al menos 2 niveles",
    detalle: nivelSuficiente ? "Estructura jerárquica correcta" : "Faltan cuentas de nivel 2 o mayor",
    status: nivelSuficiente ? "ok" : "warn",
    norma: "Anexo 24 §II",
  });

  const desbalanceadas = polizas.filter((p) => p.estado === "asentada" && Math.abs(Number(p.total_cargos) - Number(p.total_abonos)) > 0.005);
  out.push({
    titulo: "Pólizas asentadas cuadradas",
    detalle: desbalanceadas.length === 0 ? "Todas las pólizas del mes cuadran" : `${desbalanceadas.length} pólizas descuadradas`,
    status: desbalanceadas.length === 0 ? "ok" : "error",
    norma: "Principio de partida doble",
  });

  const borrador = polizas.filter((p) => p.estado === "borrador").length;
  out.push({
    titulo: "Pólizas del mes asentadas",
    detalle: borrador === 0 ? "Sin pólizas en borrador" : `${borrador} pólizas en borrador aún no asentadas`,
    status: borrador === 0 ? "ok" : "warn",
  });

  out.push({
    titulo: "Certificado de sello digital (CSD)",
    detalle: "Pendiente para Fase 2 (sellado XML)",
    status: "warn",
    norma: "RMF 2.8.1.6",
  });

  return out;
}
