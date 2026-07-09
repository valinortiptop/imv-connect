import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  listFormTemplatesFn,
  listFormResponsesFn,
  saveFormResponseFn,
} from "@/lib/rep-visits.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { ClipboardList, CheckCircle2 } from "lucide-react";

type Field = {
  key: string;
  label: string;
  type: "text" | "textarea" | "number" | "select" | "rating";
  options?: string[];
  required?: boolean;
};

export default function VisitFormFiller({ visitId }: { visitId: string }) {
  const qc = useQueryClient();
  const listT = useServerFn(listFormTemplatesFn);
  const listR = useServerFn(listFormResponsesFn);
  const saveFn = useServerFn(saveFormResponseFn);

  const templatesQ = useQuery({
    queryKey: ["form-templates"],
    queryFn: () => listT(),
  });
  const responsesQ = useQuery({
    queryKey: ["form-responses", visitId],
    queryFn: () => listR({ data: { visitId } }),
  });

  const [answers, setAnswers] = useState<Record<string, Record<string, unknown>>>({});

  const save = useMutation({
    mutationFn: ({
      templateId,
      values,
    }: {
      templateId: string;
      values: Record<string, unknown>;
    }) => saveFn({ data: { visitId, templateId, answers: values } }),
    onSuccess: () => {
      toast.success("Formulario guardado");
      qc.invalidateQueries({ queryKey: ["form-responses", visitId] });
    },
    onError: (e: any) => toast.error(e.message ?? "Error"),
  });

  const templates = templatesQ.data?.templates ?? [];
  const answered = new Set(
    (responsesQ.data?.responses ?? []).map((r: any) => r.template_id as string),
  );

  if (templatesQ.isLoading) {
    return <p className="text-sm text-muted-foreground">Cargando formularios…</p>;
  }
  if (templates.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
        <ClipboardList className="mx-auto mb-1 h-6 w-6" />
        No hay formularios activos.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {templates.map((tpl: any) => {
        const isAnswered = answered.has(tpl.id);
        const fields: Field[] = Array.isArray(tpl.fields) ? tpl.fields : [];
        const values = answers[tpl.id] ?? {};
        return (
          <Card key={tpl.id} className={isAnswered ? "opacity-70" : ""}>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center justify-between text-sm">
                <span>{tpl.name}</span>
                {isAnswered && (
                  <span className="inline-flex items-center gap-1 text-xs text-green-600">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Contestado
                  </span>
                )}
              </CardTitle>
              {tpl.description && (
                <p className="text-xs text-muted-foreground">{tpl.description}</p>
              )}
            </CardHeader>
            {!isAnswered && (
              <CardContent className="space-y-2">
                {fields.map((f) => (
                  <div key={f.key}>
                    <Label className="text-xs">
                      {f.label} {f.required && <span className="text-destructive">*</span>}
                    </Label>
                    {f.type === "textarea" && (
                      <Textarea
                        rows={2}
                        value={(values[f.key] as string) ?? ""}
                        onChange={(e) =>
                          setAnswers({
                            ...answers,
                            [tpl.id]: { ...values, [f.key]: e.target.value },
                          })
                        }
                      />
                    )}
                    {f.type === "number" && (
                      <Input
                        type="number"
                        value={(values[f.key] as string) ?? ""}
                        onChange={(e) =>
                          setAnswers({
                            ...answers,
                            [tpl.id]: {
                              ...values,
                              [f.key]: e.target.valueAsNumber,
                            },
                          })
                        }
                      />
                    )}
                    {f.type === "select" && (
                      <Select
                        value={(values[f.key] as string) ?? ""}
                        onValueChange={(v) =>
                          setAnswers({
                            ...answers,
                            [tpl.id]: { ...values, [f.key]: v },
                          })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecciona…" />
                        </SelectTrigger>
                        <SelectContent>
                          {(f.options ?? []).map((o) => (
                            <SelectItem key={o} value={o}>
                              {o}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                    {f.type === "rating" && (
                      <div className="flex gap-1">
                        {[1, 2, 3, 4, 5].map((n) => (
                          <button
                            key={n}
                            type="button"
                            onClick={() =>
                              setAnswers({
                                ...answers,
                                [tpl.id]: { ...values, [f.key]: n },
                              })
                            }
                            className={
                              "h-8 w-8 rounded-md border text-sm " +
                              ((values[f.key] as number) === n
                                ? "border-primary bg-primary text-primary-foreground"
                                : "border-border")
                            }
                          >
                            {n}
                          </button>
                        ))}
                      </div>
                    )}
                    {(!f.type || f.type === "text") && (
                      <Input
                        value={(values[f.key] as string) ?? ""}
                        onChange={(e) =>
                          setAnswers({
                            ...answers,
                            [tpl.id]: { ...values, [f.key]: e.target.value },
                          })
                        }
                      />
                    )}
                  </div>
                ))}
                <Button
                  size="sm"
                  disabled={save.isPending}
                  onClick={() =>
                    save.mutate({ templateId: tpl.id, values })
                  }
                >
                  Guardar respuestas
                </Button>
              </CardContent>
            )}
          </Card>
        );
      })}
    </div>
  );
}
