// @ts-nocheck
import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { useLanguage } from "@/hooks/use-language";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { CalendarIcon, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Tables } from "@/integrations/supabase/types";

type Central = Tables<"centrales">;

const STATUS_OPTIONS = ["new", "researching", "contacted", "visited", "active", "inactive"];
const TIER_OPTIONS = ["high", "med", "low"];

interface CentralEditDrawerProps {
  central: Central;
  onSaved: (updated: Central) => void;
  onCancel: () => void;
}

export default function CentralEditDrawer({ central, onSaved, onCancel }: CentralEditDrawerProps) {
  const { t } = useLanguage();
  const { toast } = useToast();

  const [status, setStatus] = useState(central.status);
  const [petfoodTier, setPetfoodTier] = useState(central.petfood_potential_tier ?? "");
  const [miscTier, setMiscTier] = useState(central.miscelaneas_tier ?? "");
  const [nextAction, setNextAction] = useState<Date | undefined>(central.next_action_at ? new Date(central.next_action_at) : undefined);
  const [lastVisited, setLastVisited] = useState<Date | undefined>(central.last_visited_at ? new Date(central.last_visited_at) : undefined);
  const [notes, setNotes] = useState(central.notes ?? "");
  const [saving, setSaving] = useState(false);

  const buildFields = () => ({
    status,
    petfood_potential_tier: petfoodTier || null,
    miscelaneas_tier: miscTier || null,
    next_action_at: nextAction ? nextAction.toISOString() : null,
    last_visited_at: lastVisited ? lastVisited.toISOString() : null,
    notes: notes || null,
  });

  const save = async (fieldsOverride?: Partial<ReturnType<typeof buildFields>>) => {
    setSaving(true);
    const fields = { ...buildFields(), ...fieldsOverride };
    try {
      const { data, error } = await supabase.functions.invoke("update-central", {
        body: { id: central.id, fields },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast({ title: t("saved") });
      onSaved({ ...central, ...fields } as Central);
    } catch (e: any) {
      toast({ title: t("saveError"), description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const quickContact = () => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    setStatus("contacted");
    setNextAction(d);
    save({ status: "contacted", next_action_at: d.toISOString() });
  };

  const quickVisit = () => {
    const now = new Date();
    setStatus("visited");
    setLastVisited(now);
    save({ status: "visited", last_visited_at: now.toISOString() });
  };

  const resetForm = () => {
    setStatus(central.status);
    setPetfoodTier(central.petfood_potential_tier ?? "");
    setMiscTier(central.miscelaneas_tier ?? "");
    setNextAction(central.next_action_at ? new Date(central.next_action_at) : undefined);
    setLastVisited(central.last_visited_at ? new Date(central.last_visited_at) : undefined);
    setNotes(central.notes ?? "");
    onCancel();
  };

  return (
    <div className="mt-4 space-y-4 text-sm overflow-y-auto">
      {/* Address (read-only selectable) */}
      <Field label={t("address")}>
        <p className="select-text text-foreground">{central.address ?? "—"}</p>
      </Field>

      {/* Source URL */}
      <Field label={t("sourceUrl")}>
        {central.source_url ? (
          <Button variant="outline" size="sm" asChild>
            <a href={central.source_url} target="_blank" rel="noreferrer">
              <ExternalLink className="mr-1 h-3 w-3" />
              {t("openSource")}
            </a>
          </Button>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </Field>

      {/* Status */}
      <Field label="Status">
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
      </Field>

      {/* Petfood Tier */}
      <Field label="Petfood Tier">
        <Select value={petfoodTier || "__none__"} onValueChange={(v) => setPetfoodTier(v === "__none__" ? "" : v)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">—</SelectItem>
            {TIER_OPTIONS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
      </Field>

      {/* Miscelaneas Tier */}
      <Field label="Misceláneas Tier">
        <Select value={miscTier || "__none__"} onValueChange={(v) => setMiscTier(v === "__none__" ? "" : v)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">—</SelectItem>
            {TIER_OPTIONS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
      </Field>

      {/* Next Action At */}
      <Field label={t("nextAction")}>
        <DatePick date={nextAction} onSelect={setNextAction} />
      </Field>

      {/* Last Visited At */}
      <Field label={t("lastVisited")}>
        <DatePick date={lastVisited} onSelect={setLastVisited} />
      </Field>

      {/* Notes */}
      <Field label={t("notes")}>
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
      </Field>

      {/* Quick actions */}
      <div className="flex flex-wrap gap-2 pt-2">
        <Button variant="secondary" size="sm" disabled={saving} onClick={quickContact}>
          {t("markContacted")}
        </Button>
        <Button variant="secondary" size="sm" disabled={saving} onClick={quickVisit}>
          {t("markVisited")}
        </Button>
      </div>

      {/* Save / Cancel */}
      <div className="flex gap-2 pt-2">
        <Button onClick={() => save()} disabled={saving} className="flex-1 gradient-button text-white">
          {saving ? "…" : t("save")}
        </Button>
        <Button variant="outline" onClick={resetForm} disabled={saving} className="flex-1">
          {t("cancel")}
        </Button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function DatePick({ date, onSelect }: { date?: Date; onSelect: (d: Date | undefined) => void }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !date && "text-muted-foreground")}>
          <CalendarIcon className="mr-2 h-4 w-4" />
          {date ? format(date, "dd/MM/yyyy") : "—"}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar mode="single" selected={date} onSelect={(d) => { onSelect(d); }} initialFocus className="p-3 pointer-events-auto" />
      </PopoverContent>
    </Popover>
  );
}
