import { ArrowUpDown, Download as DownloadIcon, FileSpreadsheet, FileText, Search, SlidersHorizontal, X } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

/**
 * Barra estándar de listados (una sola fila):
 *   [Buscar ……………] [Filtros (n)] [Orden]            [Vistas] [Exportar]
 * Debajo, sólo si hay filtros activos: chips quitables + "Quitar todo" y el resumen.
 * Los filtros viven en un panel (popover en compu, hoja inferior en teléfono).
 */

export type FiltroDef = {
  id: string;
  etiqueta: string;
  valor: string;
  onChange: (v: string) => void;
  /** Primera opción = "todos" (valor vacío del filtro). */
  opciones: [string, string][];
  oculto?: boolean;
};

export type VistaDef<V extends string> = [V, typeof Search, string];

type Props<V extends string> = {
  busqueda?: { valor: string; onChange: (v: string) => void; placeholder: string };
  filtros?: FiltroDef[];
  /** Controles extra dentro del panel de filtros (rango de fechas, casillas…). */
  filtrosExtra?: ReactNode;
  /** Chips extra para filtros que no son FiltroDef (atajos, casillas). */
  chipsExtra?: { id: string; texto: string; quitar: () => void }[];
  orden?: { valor: string; onChange: (v: string) => void; opciones: [string, string][] };
  vistas?: { valor: V; onChange: (v: V) => void; opciones: VistaDef<V>[] };
  /** Botones a la derecha (exportar, columnas…). */
  acciones?: ReactNode;
  /** Controles siempre visibles junto a filtros (p. ej. selector de plataforma). */
  enLinea?: ReactNode;
  onLimpiar?: () => void;
  resumen?: ReactNode;
  className?: string;
};

const vacio = (f: FiltroDef) => f.valor === (f.opciones[0]?.[0] ?? "");

function SelectCampo({ valor, onChange, opciones, className = "" }: { valor: string; onChange: (v: string) => void; opciones: [string, string][]; className?: string }) {
  return (
    <select value={valor} onChange={(e) => onChange(e.target.value)}
      className={`h-9 w-full rounded-md border bg-background px-2.5 text-sm outline-none focus:ring-2 focus:ring-ring/40 ${className}`}>
      {opciones.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  );
}

export function BarraHerramientas<V extends string>({
  busqueda, filtros = [], filtrosExtra, chipsExtra = [], orden, vistas, acciones, enLinea, onLimpiar, resumen, className = "",
}: Props<V>) {
  const [hoja, setHoja] = useState(false);
  const visibles = filtros.filter((f) => !f.oculto);
  const activos = visibles.filter((f) => !vacio(f));
  const nActivos = activos.length + chipsExtra.length;
  const hayPanel = visibles.length > 0 || !!filtrosExtra;
  const limpiarTodo = () => { if (onLimpiar) onLimpiar(); else visibles.forEach((f) => f.onChange(f.opciones[0]?.[0] ?? "")); };

  const panel = (
    <div className="grid gap-3 sm:grid-cols-2">
      {visibles.map((f) => (
        <label key={f.id} className="space-y-1">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{f.etiqueta}</span>
          <SelectCampo valor={f.valor} onChange={f.onChange} opciones={f.opciones} className={vacio(f) ? "" : "border-primary/60 bg-primary/5"} />
        </label>
      ))}
      {filtrosExtra ? <div className="space-y-2 sm:col-span-2">{filtrosExtra}</div> : null}
    </div>
  );

  const contador = nActivos > 0 ? (
    <span className="grid size-5 place-items-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">{nActivos}</span>
  ) : null;

  return (
    <div className={`mb-3 space-y-2 ${className}`}>
      <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-2">
        {busqueda ? (
          <div className="relative min-w-0 flex-1 basis-56">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={busqueda.valor} onChange={(e) => busqueda.onChange(e.target.value)} placeholder={busqueda.placeholder} className="h-9 border-0 bg-muted/50 pl-8 pr-8 shadow-none focus-visible:ring-1" />
            {busqueda.valor ? (
              <button type="button" aria-label="Borrar búsqueda" onClick={() => busqueda.onChange("")} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:bg-accent">
                <X className="size-3.5" />
              </button>
            ) : null}
          </div>
        ) : null}

        {hayPanel ? (
          <>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant={nActivos ? "secondary" : "outline"} size="sm" className="hidden h-9 gap-1.5 md:inline-flex">
                  <SlidersHorizontal className="size-4" /> Filtros {contador}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-[min(36rem,calc(100vw-2rem))] p-4">
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-sm font-semibold">Filtros</span>
                  {nActivos ? <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={limpiarTodo}>Quitar todo</Button> : null}
                </div>
                {panel}
              </PopoverContent>
            </Popover>
            <Button variant={nActivos ? "secondary" : "outline"} size="sm" className="h-9 gap-1.5 md:hidden" onClick={() => setHoja(true)}>
              <SlidersHorizontal className="size-4" /> Filtros {contador}
            </Button>
            <Sheet open={hoja} onOpenChange={setHoja}>
              <SheetContent side="bottom" className="max-h-[85dvh] overflow-y-auto rounded-t-2xl pb-[max(1rem,env(safe-area-inset-bottom))] md:hidden">
                <SheetHeader><SheetTitle>Filtros y orden</SheetTitle></SheetHeader>
                <div className="mt-4 space-y-3 [&_select]:h-11">
                  {panel}
                  {orden ? (
                    <label className="block space-y-1">
                      <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Ordenar por</span>
                      <SelectCampo valor={orden.valor} onChange={orden.onChange} opciones={orden.opciones} />
                    </label>
                  ) : null}
                </div>
                <div className="mt-5 flex gap-2">
                  {nActivos ? <Button variant="outline" className="h-11 flex-1" onClick={limpiarTodo}>Quitar todo</Button> : null}
                  <Button className="h-11 flex-1" onClick={() => setHoja(false)}>Ver resultados</Button>
                </div>
              </SheetContent>
            </Sheet>
          </>
        ) : null}

        {orden ? (
          <div className={`relative ${hayPanel ? "hidden md:block" : ""}`}>
            <ArrowUpDown className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <select aria-label="Ordenar por" value={orden.valor} onChange={(e) => orden.onChange(e.target.value)}
              className="h-9 max-w-52 rounded-md border bg-background pl-7 pr-2 text-sm outline-none focus:ring-2 focus:ring-ring/40">
              {orden.opciones.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
        ) : null}

        {enLinea}

        <div className="ml-auto flex items-center gap-2">
          {vistas ? (
            <TooltipProvider delayDuration={200}>
              <div role="radiogroup" aria-label="Vista" className="flex rounded-lg bg-muted p-0.5">
                {vistas.opciones.map(([v, Icon, t]) => (
                  <Tooltip key={v}>
                    <TooltipTrigger asChild>
                      <button type="button" role="radio" aria-checked={vistas.valor === v} aria-label={t} onClick={() => vistas.onChange(v)}
                        className={`flex h-8 items-center gap-1.5 rounded-md px-2.5 text-sm transition-colors ${vistas.valor === v ? "bg-card font-medium text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
                        <Icon className="size-4" /><span className="hidden 2xl:inline">{t}</span>
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>{t}</TooltipContent>
                  </Tooltip>
                ))}
              </div>
            </TooltipProvider>
          ) : null}
          {acciones}
        </div>
      </div>

      {nActivos > 0 || resumen ? (
        <div className="flex flex-wrap items-center gap-1.5 px-1 text-xs">
          {activos.map((f) => (
            <Chip key={f.id} texto={`${f.etiqueta}: ${f.opciones.find(([v]) => v === f.valor)?.[1] ?? f.valor}`} quitar={() => f.onChange(f.opciones[0]?.[0] ?? "")} />
          ))}
          {chipsExtra.map((c) => <Chip key={c.id} texto={c.texto} quitar={c.quitar} />)}
          {nActivos > 1 ? <button type="button" onClick={limpiarTodo} className="px-1.5 font-medium text-primary hover:underline">Quitar todo</button> : null}
          {resumen ? <span className="ml-auto text-muted-foreground">{resumen}</span> : null}
        </div>
      ) : null}
    </div>
  );
}

function Chip({ texto, quitar }: { texto: string; quitar: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/5 py-0.5 pl-2.5 pr-1 text-primary">
      {texto}
      <button type="button" aria-label={`Quitar ${texto}`} onClick={quitar} className="rounded-full p-0.5 hover:bg-primary/10"><X className="size-3" /></button>
    </span>
  );
}

/** Botón estándar de exportar a Excel. */
export function BotonExcel({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <Button size="sm" variant="outline" className="h-9 gap-1.5" onClick={onClick} disabled={disabled}>
      <DownloadIcon className="size-4" /> <span className="hidden sm:inline">Excel</span>
    </Button>
  );
}

/** Exportar con menú Excel / PDF. */
export function MenuExportar({ onExcel, onPdf, disabled }: { onExcel: () => void; onPdf: () => void; disabled?: boolean }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="outline" className="h-9 gap-1.5" disabled={disabled}>
          <DownloadIcon className="size-4" /> <span className="hidden sm:inline">Exportar</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={onExcel} className="gap-2"><FileSpreadsheet className="size-4" /> Excel (.xlsx)</DropdownMenuItem>
        <DropdownMenuItem onClick={onPdf} className="gap-2"><FileText className="size-4" /> PDF</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
