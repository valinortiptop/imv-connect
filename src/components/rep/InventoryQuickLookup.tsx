import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { quickInventoryLookupFn } from "@/lib/rep.functions";
import { getUpcomingReceiptsFn } from "@/lib/rep-behavior.functions";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Search, PackagePlus } from "lucide-react";
import SubstituteSuggestions from "./SubstituteSuggestions";

const fmtMXN = (n: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 2 }).format(n);

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function Highlight({ text, terms }: { text: string | null | undefined; terms: string[] }) {
  const value = text ?? "";
  const activeTerms = terms.filter((t) => t.length > 0);
  if (!value || activeTerms.length === 0) return <>{value}</>;
  const re = new RegExp(`(${activeTerms.map(escapeRegExp).join("|")})`, "gi");
  const parts = value.split(re);
  return (
    <>
      {parts.map((p, i) =>
        re.test(p) ? (
          <mark key={i} className="rounded bg-yellow-200/70 px-0.5 text-inherit dark:bg-yellow-400/30">
            {p}
          </mark>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

export default function InventoryQuickLookup() {
  const [q, setQ] = useState("");
  const fn = useServerFn(quickInventoryLookupFn);
  const fnReceipts = useServerFn(getUpcomingReceiptsFn);
  const { data } = useQuery({
    queryKey: ["rep-inv-lookup", q],
    queryFn: () => fn({ data: { q } }),
    enabled: q.trim().length >= 2,
  });
  const receipts = useQuery({
    queryKey: ["rep-upcoming-receipts"],
    queryFn: () => fnReceipts(),
    enabled: q.trim().length < 2,
  });

  const terms = useMemo(
    () => q.trim().split(/\s+/).filter((t) => t.length >= 1),
    [q],
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold md:text-2xl">Inventario</h1>
        <p className="text-sm text-muted-foreground">
          Consulta rápida de disponibilidad, tránsito y sustitutos
        </p>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-8"
          placeholder="Producto, SKU o marca…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      <div className="space-y-2">
        {(data?.productos ?? []).map((p: any) => {
          const disp = Number(p.stock_disponible ?? 0);
          return (
            <Card key={p.id}>
              <CardContent className="flex flex-col gap-3 p-3">
                <div className="flex gap-3">
                  {p.imagen_url ? (
                    <img src={p.imagen_url} alt="" className="h-14 w-14 rounded object-cover" />
                  ) : (
                    <div className="h-14 w-14 rounded bg-muted" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">
                      <Highlight text={p.nombre} terms={terms} />
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      <Highlight text={p.sku} terms={terms} /> ·{" "}
                      <Highlight text={p.marca ?? "—"} terms={terms} />
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-3 text-xs">
                      <span className={disp <= 0 ? "text-red-600" : ""}>
                        Disp: {disp}
                      </span>
                      <span>Compr: {p.stock_comprometido ?? 0}</span>
                      <span>
                        Tránsito: {p.transit_qty > 0 ? p.transit_qty : "—"}
                        {p.transit_eta && ` (ETA ${p.transit_eta.slice(0, 10)})`}
                      </span>
                      <span className="text-muted-foreground">
                        {p.precio_lista != null ? fmtMXN(Number(p.precio_lista)) : ""}
                      </span>
                    </div>
                  </div>
                </div>
                {disp <= 0 && (
                  <div className="rounded border border-amber-500/30 bg-amber-500/5 p-2">
                    <SubstituteSuggestions productoId={p.id} />
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
        {q.trim().length >= 2 && (data?.productos ?? []).length === 0 && (
          <div className="text-sm text-muted-foreground">Sin resultados.</div>
        )}
      </div>

      {q.trim().length < 2 && (receipts.data?.receipts ?? []).length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <PackagePlus className="h-4 w-4" />
              Próximos ingresos
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {(receipts.data?.receipts ?? []).slice(0, 10).map((r: any) => (
              <div key={r.date} className="rounded border border-border/50 p-2">
                <div className="mb-1 text-xs font-semibold text-primary">{r.date}</div>
                <div className="space-y-0.5">
                  {r.items.slice(0, 6).map((it: any, i: number) => (
                    <div key={i} className="flex items-center justify-between text-xs">
                      <span className="truncate">
                        {it.nombre} <span className="text-muted-foreground">({it.sku})</span>
                      </span>
                      <span className="text-muted-foreground">+{it.quantity}</span>
                    </div>
                  ))}
                  {r.items.length > 6 && (
                    <div className="text-[10px] text-muted-foreground">
                      +{r.items.length - 6} más
                    </div>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
