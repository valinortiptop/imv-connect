import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FileDown, Printer } from "lucide-react";
import { reportePdf } from "@/lib/almacen-pdf";

export type ReportRow = Record<string, unknown>;

export type ReportColumn = {
  key: string;
  label: string;
  align?: "left" | "right";
  /** Formatter for both table and PDF. */
  fmt?: (v: unknown, row: ReportRow) => string;
};

export const fmtMXN = (n: unknown) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(Number(n ?? 0));

export const fmtNum = (n: unknown) => Number(n ?? 0).toFixed(2);

export const fmtDate = (v: unknown) => (v ? String(v).slice(0, 10) : "—");

const defaultFmt = (v: unknown) => (v == null || v === "" ? "—" : String(v));

type Props = {
  /** Postgres view or table to read from. */
  view: string;
  title: string;
  columns: ReportColumn[];
  /** Column used for the default ordering. */
  orderBy: string;
  ascending?: boolean;
  /** Free-text term applied to searchKeys. */
  term: string;
  searchKeys: string[];
  limit?: number;
  unitLabel?: string;
  /** Optional extra summary lines for the PDF. */
  summary?: (rows: ReportRow[]) => string[];
};

export default function GenericReportTab({
  view,
  title,
  columns,
  orderBy,
  ascending = false,
  term,
  searchKeys,
  limit = 2000,
  unitLabel = "registros",
  summary,
}: Props) {
  const query = useQuery({
    queryKey: ["almacen-report", view, orderBy, ascending, limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from(view as never)
        .select("*")
        .order(orderBy, { ascending, nullsFirst: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as unknown as ReportRow[];
    },
    staleTime: 60_000,
  });

  const t = term.trim().toLowerCase();
  const rows = useMemo(() => {
    const all = query.data ?? [];
    if (!t) return all;
    return all.filter((r) => searchKeys.some((k) => String(r[k] ?? "").toLowerCase().includes(t)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.data, t, searchKeys.join(",")]);

  const cell = (c: ReportColumn, r: ReportRow) => (c.fmt ? c.fmt(r[c.key], r) : defaultFmt(r[c.key]));

  const exportPdf = (mode: "download" | "print") =>
    reportePdf(
      title,
      columns.map((c) => c.label),
      rows.map((r) => columns.map((c) => cell(c, r))),
      [`${rows.length} ${unitLabel}`, ...(summary?.(rows) ?? [])],
      mode,
    );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm text-muted-foreground">
          {query.isLoading ? "Cargando…" : `${rows.length} ${unitLabel}`}
          {summary && !query.isLoading ? ` · ${summary(rows).join(" · ")}` : ""}
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => exportPdf("download")} disabled={!rows.length}>
            <FileDown className="mr-1 h-4 w-4" /> PDF
          </Button>
          <Button size="sm" variant="outline" onClick={() => exportPdf("print")} disabled={!rows.length}>
            <Printer className="mr-1 h-4 w-4" /> Imprimir
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full text-xs">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                {columns.map((c) => (
                  <th key={c.key} className={`px-3 py-2 ${c.align === "right" ? "text-right" : "text-left"}`}>
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 500).map((r, i) => (
                <tr key={String(r.id ?? r.item_id ?? i)} className="border-b border-border/40">
                  {columns.map((c) => (
                    <td key={c.key} className={`px-3 py-2 ${c.align === "right" ? "text-right" : ""}`}>
                      {cell(c, r)}
                    </td>
                  ))}
                </tr>
              ))}
              {!query.isLoading && !rows.length && (
                <tr>
                  <td className="px-3 py-8 text-center text-muted-foreground" colSpan={columns.length}>
                    Sin registros para el filtro actual.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
      {rows.length > 500 && (
        <p className="text-xs text-muted-foreground">
          Mostrando las primeras 500 filas. El PDF incluye las {rows.length} filas del filtro.
        </p>
      )}
    </div>
  );
}
