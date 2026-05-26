// @ts-nocheck
import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { AnimatedGridPattern } from "@/components/ui/animated-grid-pattern";
import { GlowCard } from "@/components/ui/spotlight-card";
import { useLanguage } from "@/hooks/use-language";

import CentralEditDrawer from "@/components/CentralEditDrawer";
import { format } from "date-fns";
import { parseLocalDate } from "@/lib/date-utils";
import type { Tables } from "@/integrations/supabase/types";

type Central = Tables<"centrales">;

const TYPE_LABELS: Record<string, string> = {
  central_de_abasto: "Central de Abasto",
  directorio_ceda: "Directorio CEDA",
  mercado: "Mercado",
  mercado_mayoreo: "Mercado Mayoreo",
  zona_comercial: "Zona Comercial",
};

const TIER_COLORS: Record<string, string> = {
  high: "bg-green-600/20 text-green-400 border-green-600/30",
  med: "bg-yellow-600/20 text-yellow-400 border-yellow-600/30",
  low: "bg-red-600/20 text-red-400 border-red-600/30",
};

const STATUS_COLORS: Record<string, string> = {
  researching: "bg-yellow-600/20 text-yellow-400 border-yellow-600/30",
  active: "bg-green-600/20 text-green-400 border-green-600/30",
  inactive: "bg-muted text-muted-foreground border-border",
};

function formatDate(d: string | null) {
  if (!d) return "—";
  try { return format(parseLocalDate(d), "dd/MM/yyyy"); } catch { return "—"; }
}

export default function Centrales() {
  const { t } = useLanguage();
  const [data, setData] = useState<Central[]>([]);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<Central | null>(null);

  // filters
  const [fState, setFState] = useState("__all__");
  const [fType, setFType] = useState("__all__");
  const [fStatus, setFStatus] = useState("__all__");
  const [fTier, setFTier] = useState("__all__");
  const [ratingMin, setRatingMin] = useState("");
  const [ratingMax, setRatingMax] = useState("");

  useEffect(() => {
    supabase.from("centrales").select("*").then(({ data: d, error: e }) => {
      if (e) setError(e.message);
      else if (d) setData(d);
    });
  }, []);

  // derive distinct filter values from data
  const distinctStates = useMemo(() => [...new Set(data.map((r) => r.state))].sort(), [data]);
  const distinctTypes = useMemo(() => [...new Set(data.map((r) => r.type))].sort(), [data]);
  const distinctStatuses = useMemo(() => [...new Set(data.map((r) => r.status))].sort(), [data]);
  const distinctTiers = useMemo(() => [...new Set(data.map((r) => r.petfood_potential_tier).filter(Boolean))].sort() as string[], [data]);

  const filtered = useMemo(() => {
    return data.filter((r) => {
      if (fState !== "__all__" && r.state !== fState) return false;
      if (fType !== "__all__" && r.type !== fType) return false;
      if (fStatus !== "__all__" && r.status !== fStatus) return false;
      if (fTier !== "__all__" && r.petfood_potential_tier !== fTier) return false;
      if (ratingMin !== "") {
        const min = parseFloat(ratingMin);
        if (!isNaN(min) && (r.rating == null || r.rating < min)) return false;
      }
      if (ratingMax !== "") {
        const max = parseFloat(ratingMax);
        if (!isNaN(max) && (r.rating == null || r.rating > max)) return false;
      }
      return true;
    });
  }, [data, fState, fType, fStatus, fTier, ratingMin, ratingMax]);

  const clearFilters = () => {
    setFState("__all__");
    setFType("__all__");
    setFStatus("__all__");
    setFTier("__all__");
    setRatingMin("");
    setRatingMax("");
  };

  return (
    <div
      className="relative min-h-screen bg-background"
      onPointerMove={(e) => {
        const el = e.currentTarget as HTMLElement;
        el.style.setProperty("--x", `${e.clientX}px`);
        el.style.setProperty("--y", `${e.clientY}px`);
      }}
    >
      <AnimatedGridPattern className="inset-x-0 inset-y-[-40%] h-[220%] [mask-image:radial-gradient(900px_circle_at_center,white,transparent_85%)]" />
      <div className="relative z-10 p-4 md:p-8">
        <div className="mx-auto max-w-5xl space-y-6">
          

          {error && <p className="text-sm text-destructive">{error}</p>}

          {/* Filters */}
          <GlowCard>
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">{t("filters")}</CardTitle>
                  <Button variant="ghost" size="sm" onClick={clearFilters}>
                    {t("clearFilters")}
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                  <FilterSelect label={t("allStates")} value={fState} onChange={setFState} options={distinctStates} />
                  <FilterSelect label={t("allTypes")} value={fType} onChange={setFType} options={distinctTypes} labelMap={TYPE_LABELS} />
                  <FilterSelect label={t("allStatuses")} value={fStatus} onChange={setFStatus} options={distinctStatuses} />
                  <FilterSelect label={t("allTiers")} value={fTier} onChange={setFTier} options={distinctTiers} />
                  <div>
                    <Label className="text-xs text-muted-foreground">{t("ratingMin")}</Label>
                    <Input type="number" min="0" step="any" placeholder="0" value={ratingMin} onChange={(e) => setRatingMin(e.target.value)} className="mt-1" />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">{t("ratingMax")}</Label>
                    <Input type="number" min="0" step="any" placeholder="10" value={ratingMax} onChange={(e) => setRatingMax(e.target.value)} className="mt-1" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </GlowCard>

          {/* Table */}
          <GlowCard>
            <Card>
              <CardContent className="p-0">
                {filtered.length === 0 ? (
                  <p className="p-6 text-center text-sm text-muted-foreground">{t("noResults")}</p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{t("thName")}</TableHead>
                          <TableHead>{t("thCity")}</TableHead>
                          <TableHead>{t("thState")}</TableHead>
                          <TableHead>{t("thType")}</TableHead>
                          <TableHead>{t("thPetfoodTier")}</TableHead>
                          <TableHead>{t("thStatus")}</TableHead>
                          <TableHead className="text-right">{t("thRating")}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filtered.map((r) => (
                          <TableRow
                            key={r.id}
                            className="cursor-pointer hover:bg-accent/50"
                            onClick={() => setSelected(r)}
                          >
                            <TableCell className="font-medium">{r.name}</TableCell>
                            <TableCell>{r.city ?? "—"}</TableCell>
                            <TableCell>{r.state}</TableCell>
                            <TableCell>
                              <Badge className="bg-blue-600/20 text-blue-400 border-blue-600/30">
                                {TYPE_LABELS[r.type] ?? r.type}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              {r.petfood_potential_tier ? (
                                <Badge className={TIER_COLORS[r.petfood_potential_tier] ?? ""}>
                                  {r.petfood_potential_tier}
                                </Badge>
                              ) : "—"}
                            </TableCell>
                            <TableCell>
                              <Badge className={STATUS_COLORS[r.status] ?? "bg-muted text-muted-foreground border-border"}>
                                {r.status}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">{r.rating?.toFixed(1) ?? "—"}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </GlowCard>
        </div>
      </div>

      {/* Detail drawer */}
      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>{selected?.name}</SheetTitle>
          </SheetHeader>
          {selected && (
            <CentralEditDrawer
              central={selected}
              onSaved={(updated) => {
                setData((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
                setSelected(null);
              }}
              onCancel={() => setSelected(null)}
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function FilterSelect({
  label, value, onChange, options, labelMap,
}: {
  label: string; value: string; onChange: (v: string) => void;
  options: string[]; labelMap?: Record<string, string>;
}) {
  return (
    <div>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__">{label}</SelectItem>
          {options.map((o) => (
            <SelectItem key={o} value={o}>{labelMap?.[o] ?? o}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function DetailRow({ label, value, children }: { label: string; value?: string; children?: React.ReactNode }) {
  return (
    <div>
      <span className="font-medium text-muted-foreground">{label}</span>
      <div className="mt-0.5 text-foreground">{children ?? value}</div>
    </div>
  );
}
