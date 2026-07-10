import { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type ResponsiveColumn<T> = {
  key: string;
  label: string;
  render?: (row: T) => ReactNode;
  className?: string;
  hideOnMobile?: boolean;
  primary?: boolean;
};

type Props<T> = {
  columns: ResponsiveColumn<T>[];
  data: T[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  renderActions?: (row: T) => ReactNode;
  empty?: ReactNode;
  className?: string;
  caption?: string;
};

function getValue<T>(row: T, col: ResponsiveColumn<T>): ReactNode {
  if (col.render) return col.render(row);
  const v = (row as Record<string, unknown>)[col.key];
  return v == null ? "—" : String(v);
}

export function ResponsiveTable<T>({
  columns,
  data,
  rowKey,
  onRowClick,
  renderActions,
  empty,
  className,
  caption,
}: Props<T>) {
  if (!data.length) {
    return (
      <div className="rounded-lg border border-border bg-card p-6 text-center text-sm text-muted-foreground">
        {empty ?? "Sin resultados"}
      </div>
    );
  }

  const primary =
    columns.find((c) => c.primary) ?? columns[0];
  const secondary = columns.filter((c) => c.key !== primary.key);

  return (
    <>
      {/* Table view: sm and up */}
      <div className={cn("hidden sm:block overflow-x-auto rounded-lg border border-border bg-card", className)}>
        <table className="w-full text-sm">
          {caption && <caption className="sr-only">{caption}</caption>}
          <thead className="bg-muted/50 text-left">
            <tr>
              {columns.map((c) => (
                <th key={c.key} className={cn("px-3 py-2 font-medium text-muted-foreground whitespace-nowrap", c.className)}>
                  {c.label}
                </th>
              ))}
              {renderActions && <th className="px-3 py-2" />}
            </tr>
          </thead>
          <tbody>
            {data.map((row) => (
              <tr
                key={rowKey(row)}
                className={cn(
                  "border-t border-border",
                  onRowClick && "cursor-pointer hover:bg-muted/40"
                )}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
              >
                {columns.map((c) => (
                  <td key={c.key} className={cn("px-3 py-2 align-top", c.className)}>
                    {getValue(row, c)}
                  </td>
                ))}
                {renderActions && (
                  <td className="px-3 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                    {renderActions(row)}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Card view: below sm */}
      <div className={cn("sm:hidden space-y-2", className)}>
        {data.map((row) => (
          <div
            key={rowKey(row)}
            className={cn(
              "rounded-lg border border-border bg-card p-3",
              onRowClick && "cursor-pointer active:bg-muted/50"
            )}
            onClick={onRowClick ? () => onRowClick(row) : undefined}
          >
            <div className="text-sm font-semibold text-foreground break-words">
              {getValue(row, primary)}
            </div>
            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
              {secondary.filter((c) => !c.hideOnMobile).map((c) => (
                <div key={c.key} className="contents">
                  <dt className="text-muted-foreground">{c.label}</dt>
                  <dd className="text-right text-foreground break-words">{getValue(row, c)}</dd>
                </div>
              ))}
            </dl>
            {renderActions && (
              <div
                className="mt-2 flex flex-wrap gap-2 border-t border-border pt-2"
                onClick={(e) => e.stopPropagation()}
              >
                {renderActions(row)}
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
