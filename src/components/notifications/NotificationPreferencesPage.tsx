import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Save, Bell, Mail, MessageSquare } from "lucide-react";
import { toast } from "sonner";
import {
  getMyNotificationPreferencesFn,
  saveNotificationPreferencesFn,
} from "@/lib/notifications.functions";
import { NOTIFICATION_CATEGORIES } from "@/lib/notification-categories";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";

type Row = { category: string; in_app: boolean; email: boolean; sms: boolean };

const DEFAULTS: Row[] = NOTIFICATION_CATEGORIES.map((c) => ({
  category: c.key,
  in_app: true,
  email: false,
  sms: false,
}));

export default function NotificationPreferencesPage() {
  const load = useServerFn(getMyNotificationPreferencesFn);
  const save = useServerFn(saveNotificationPreferencesFn);
  const [rows, setRows] = useState<Row[]>(DEFAULTS);

  const q = useQuery({
    queryKey: ["my-notification-prefs"],
    queryFn: () => load(),
    staleTime: 60_000,
  });

  useEffect(() => {
    if (!q.data) return;
    const map = new Map<string, Row>();
    for (const r of q.data.rows as Row[]) map.set(r.category, r);
    setRows(DEFAULTS.map((d) => map.get(d.category) ?? d));
  }, [q.data]);

  const m = useMutation({
    mutationFn: () => save({ data: { rows } }),
    onSuccess: () => toast.success("Preferencias guardadas"),
    onError: (e: any) => toast.error(e.message),
  });

  const set = (category: string, key: keyof Row, value: boolean) =>
    setRows((prev) => prev.map((r) => (r.category === category ? { ...r, [key]: value } : r)));

  const setAll = (key: "in_app" | "email", value: boolean) =>
    setRows((prev) => prev.map((r) => ({ ...r, [key]: value })));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Preferencias de notificaciones</h1>
          <p className="text-sm text-muted-foreground">
            Elige qué avisos recibes y por qué canal. Solo aplica a tu usuario.
          </p>
        </div>
        <Button onClick={() => m.mutate()} disabled={m.isPending}>
          <Save className="mr-2 h-4 w-4" /> Guardar
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <Card>
          <CardContent className="flex items-center justify-between p-4">
            <div className="flex items-center gap-2 text-sm">
              <Bell className="h-4 w-4 text-primary" /> Sistema (todas)
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" onClick={() => setAll("in_app", true)}>Todo</Button>
              <Button size="sm" variant="ghost" onClick={() => setAll("in_app", false)}>Nada</Button>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between p-4">
            <div className="flex items-center gap-2 text-sm">
              <Mail className="h-4 w-4 text-primary" /> Email (todas)
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" onClick={() => setAll("email", true)}>Todo</Button>
              <Button size="sm" variant="ghost" onClick={() => setAll("email", false)}>Nada</Button>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <MessageSquare className="h-4 w-4" /> SMS
            </div>
            <Badge variant="outline" className="text-[10px]">Próximamente</Badge>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Por categoría</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="hidden grid-cols-[1fr_90px_90px_90px] gap-2 border-b border-border px-4 py-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground md:grid">
            <span>Categoría</span>
            <span className="text-center">Sistema</span>
            <span className="text-center">Email</span>
            <span className="text-center">SMS</span>
          </div>
          <div className="divide-y divide-border">
            {NOTIFICATION_CATEGORIES.map((c) => {
              const row = rows.find((r) => r.category === c.key)!;
              return (
                <div
                  key={c.key}
                  className="grid grid-cols-[1fr_60px_60px_60px] items-center gap-2 px-4 py-3 md:grid-cols-[1fr_90px_90px_90px]"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium">{c.label}</div>
                    <div className="truncate text-xs text-muted-foreground">{c.description}</div>
                  </div>
                  <div className="flex justify-center">
                    <Switch
                      checked={row.in_app}
                      onCheckedChange={(v) => set(c.key, "in_app", v)}
                      aria-label={`Sistema ${c.label}`}
                    />
                  </div>
                  <div className="flex justify-center">
                    <Switch
                      checked={row.email}
                      onCheckedChange={(v) => set(c.key, "email", v)}
                      aria-label={`Email ${c.label}`}
                    />
                  </div>
                  <div className="flex justify-center">
                    <Switch checked={false} disabled aria-label={`SMS ${c.label}`} />
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Los correos se envían con Resend a través del proxy de Valinor. El canal SMS queda pendiente
        de habilitar proveedor.
      </p>
    </div>
  );
}
