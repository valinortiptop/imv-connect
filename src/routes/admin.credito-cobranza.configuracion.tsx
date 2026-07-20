import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Settings, Mail, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";
import {
  listTemplatesFn,
  upsertTemplateFn,
  listConfigFn,
  updateConfigFn,
} from "@/lib/cobranza-config.functions";

export const Route = createFileRoute("/admin/credito-cobranza/configuracion")({
  head: () => ({ meta: [{ title: "Configuración · Crédito y Cobranza" }] }),
  component: ConfiguracionPage,
});

function ConfiguracionPage() {
  const qc = useQueryClient();
  const listT = useServerFn(listTemplatesFn);
  const saveT = useServerFn(upsertTemplateFn);
  const listC = useServerFn(listConfigFn);
  const saveC = useServerFn(updateConfigFn);

  const { data: templates = [] } = useQuery({
    queryKey: ["cobranza-templates"],
    queryFn: () => listT(),
  });
  const { data: config = [] } = useQuery({
    queryKey: ["cobranza-config"],
    queryFn: () => listC(),
  });

  const saveTemplate = useMutation({
    mutationFn: (t: any) => saveT({ data: t }),
    onSuccess: () => {
      toast.success("Plantilla guardada");
      qc.invalidateQueries({ queryKey: ["cobranza-templates"] });
    },
    onError: (e: any) => toast.error(e?.message || "Error"),
  });

  const saveRule = useMutation({
    mutationFn: (r: { clave: string; valor: unknown }) => saveC({ data: r }),
    onSuccess: () => {
      toast.success("Regla actualizada");
      qc.invalidateQueries({ queryKey: ["cobranza-config"] });
    },
    onError: (e: any) => toast.error(e?.message || "Error"),
  });

  return (
    <div className="space-y-6 p-4">
      <div className="flex items-center gap-2">
        <Settings className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-semibold">Configuración del módulo</h2>
      </div>

      {/* Business rules */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <SlidersHorizontal className="h-4 w-4" /> Reglas de negocio
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {config.map((c: any) => (
            <RuleRow key={c.clave} rule={c} onSave={(valor) => saveRule.mutate({ clave: c.clave, valor })} />
          ))}
        </CardContent>
      </Card>

      {/* Templates */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Mail className="h-4 w-4" /> Plantillas de comunicación
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Variables disponibles: <code>{"{{cliente}}"}</code>, <code>{"{{folio}}"}</code>,{" "}
            <code>{"{{monto}}"}</code>, <code>{"{{fecha_vencimiento}}"}</code>, <code>{"{{fecha}}"}</code>,{" "}
            <code>{"{{fecha_promesa}}"}</code>.
          </p>
          {templates.map((t: any) => (
            <TemplateRow key={t.id} template={t} onSave={(v) => saveTemplate.mutate(v)} />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function RuleRow({ rule, onSave }: { rule: any; onSave: (v: unknown) => void }) {
  const [val, setVal] = useState<string>(
    typeof rule.valor === "string" ? rule.valor : JSON.stringify(rule.valor),
  );
  const isBool = typeof rule.valor === "boolean";
  const boolVal = isBool ? Boolean(rule.valor) : false;

  return (
    <div className="flex items-center gap-3 border-b border-border pb-3 last:border-0">
      <div className="flex-1">
        <div className="text-sm font-medium">{rule.clave}</div>
        <div className="text-xs text-muted-foreground">{rule.descripcion}</div>
      </div>
      {isBool ? (
        <Switch checked={boolVal} onCheckedChange={(v) => onSave(v)} />
      ) : (
        <>
          <Input value={val} onChange={(e) => setVal(e.target.value)} className="w-40 font-mono text-xs" />
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              try {
                onSave(JSON.parse(val));
              } catch {
                onSave(val);
              }
            }}
          >
            Guardar
          </Button>
        </>
      )}
    </div>
  );
}

function TemplateRow({ template, onSave }: { template: any; onSave: (v: any) => void }) {
  const [asunto, setAsunto] = useState(template.asunto || "");
  const [cuerpo, setCuerpo] = useState(template.cuerpo || "");
  const [activo, setActivo] = useState(template.activo);

  return (
    <div className="rounded border border-border p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-medium">{template.nombre}</div>
          <div className="text-xs text-muted-foreground">
            {template.codigo} · {template.descripcion}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Label className="text-xs">Activa</Label>
          <Switch checked={activo} onCheckedChange={setActivo} />
        </div>
      </div>
      <div>
        <Label className="text-xs">Asunto</Label>
        <Input value={asunto} onChange={(e) => setAsunto(e.target.value)} />
      </div>
      <div>
        <Label className="text-xs">Cuerpo</Label>
        <Textarea rows={4} value={cuerpo} onChange={(e) => setCuerpo(e.target.value)} />
      </div>
      <div className="flex justify-end">
        <Button
          size="sm"
          onClick={() =>
            onSave({
              id: template.id,
              codigo: template.codigo,
              nombre: template.nombre,
              canal: template.canal,
              asunto,
              cuerpo,
              activo,
              descripcion: template.descripcion,
            })
          }
        >
          Guardar plantilla
        </Button>
      </div>
    </div>
  );
}
