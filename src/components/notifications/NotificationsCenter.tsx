import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Bell, CheckCheck, Trash2, Settings, AlertTriangle, CalendarClock, Inbox } from "lucide-react";
import { toast } from "sonner";
import {
  listNotificationsFn,
  getNotificationStatsFn,
  markNotificationsReadFn,
  markAllNotificationsReadFn,
  deleteNotificationsFn,
  listNotificationUsersFn,
} from "@/lib/notifications.functions";
import {
  NOTIFICATION_CATEGORIES,
  CATEGORY_LABEL,
  PRIORITIES,
  PRIORITY_LABEL,
} from "@/lib/notification-categories";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const PRIORITY_STYLE: Record<string, string> = {
  critica: "bg-red-500/15 text-red-600 border-red-500/30",
  alta: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  media: "bg-blue-500/15 text-blue-600 border-blue-500/30",
  baja: "bg-muted text-muted-foreground border-border",
};

export default function NotificationsCenter() {
  const qc = useQueryClient();
  const list = useServerFn(listNotificationsFn);
  const stats = useServerFn(getNotificationStatsFn);
  const users = useServerFn(listNotificationUsersFn);
  const markRead = useServerFn(markNotificationsReadFn);
  const markAll = useServerFn(markAllNotificationsReadFn);
  const removeMany = useServerFn(deleteNotificationsFn);

  const [category, setCategory] = useState("all");
  const [priority, setPriority] = useState("all");
  const [state, setState] = useState<"all" | "unread" | "read">("all");
  const [userId, setUserId] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string[]>([]);

  const filters = {
    category,
    priority,
    state,
    userId: userId === "all" ? undefined : userId,
    from: from || undefined,
    to: to || undefined,
    page,
    pageSize: 100,
  };

  const q = useQuery({
    queryKey: ["notifications-center", filters],
    queryFn: () => list({ data: filters }),
    staleTime: 15_000,
  });

  const qStats = useQuery({
    queryKey: ["notifications-stats", userId],
    queryFn: () => stats({ data: { userId: userId === "all" ? undefined : userId } }),
    staleTime: 30_000,
  });

  const qUsers = useQuery({
    queryKey: ["notification-users"],
    queryFn: () => users(),
    staleTime: 300_000,
  });

  const isAdmin = q.data?.isAdmin ?? false;
  const rows = q.data?.rows ?? [];
  const total = q.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / 100));

  const userEmail = useMemo(() => {
    const map: Record<string, string> = {};
    for (const u of qUsers.data?.users ?? []) map[u.user_id] = u.email;
    return map;
  }, [qUsers.data]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["notifications-center"] });
    qc.invalidateQueries({ queryKey: ["notifications-stats"] });
    setSelected([]);
  };

  const mRead = useMutation({
    mutationFn: (ids: string[]) => markRead({ data: { ids } }),
    onSuccess: () => { toast.success("Marcadas como leídas"); refresh(); },
    onError: (e: any) => toast.error(e.message),
  });
  const mAll = useMutation({
    mutationFn: () => markAll(),
    onSuccess: () => { toast.success("Todas marcadas como leídas"); refresh(); },
    onError: (e: any) => toast.error(e.message),
  });
  const mDelete = useMutation({
    mutationFn: (ids: string[]) => removeMany({ data: { ids } }),
    onSuccess: () => { toast.success("Notificaciones eliminadas"); refresh(); },
    onError: (e: any) => toast.error(e.message),
  });

  const toggle = (id: string) =>
    setSelected((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const kpis = [
    { label: "Sin leer", value: qStats.data?.unread ?? 0, icon: Bell },
    { label: "Hoy", value: qStats.data?.today ?? 0, icon: CalendarClock },
    { label: "Prioritarias", value: qStats.data?.critical ?? 0, icon: AlertTriangle },
    { label: "Total", value: qStats.data?.total ?? 0, icon: Inbox },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Centro de notificaciones</h1>
          <p className="text-sm text-muted-foreground">
            Todas tus alertas organizadas por tipo, categoría y prioridad.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => mAll.mutate()}>
            <CheckCheck className="mr-2 h-4 w-4" /> Marcar todo leído
          </Button>
          <Button asChild size="sm" variant="secondary">
            <Link to="/admin/configuracion/notificaciones">
              <Settings className="mr-2 h-4 w-4" /> Preferencias
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpis.map((k) => (
          <Card key={k.label}>
            <CardContent className="flex items-center gap-3 p-4">
              <div className="rounded-md bg-primary/10 p-2 text-primary">
                <k.icon className="h-4 w-4" />
              </div>
              <div>
                <div className="text-xl font-semibold">{k.value}</div>
                <div className="text-xs text-muted-foreground">{k.label}</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Categorías */}
      <div className="flex flex-wrap gap-1.5">
        {[{ key: "all", label: "Todas" }, ...NOTIFICATION_CATEGORIES].map((c) => {
          const count = c.key === "all"
            ? qStats.data?.total ?? 0
            : qStats.data?.byCategory?.[c.key] ?? 0;
          return (
            <button
              key={c.key}
              onClick={() => { setCategory(c.key); setPage(1); }}
              className={cn(
                "rounded-full border px-3 py-1 text-xs transition-colors",
                category === c.key
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border text-muted-foreground hover:bg-muted",
              )}
            >
              {c.label} <span className="opacity-70">({count})</span>
            </button>
          );
        })}
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 p-4">
          <div className="w-40">
            <label className="mb-1 block text-[11px] text-muted-foreground">Estado</label>
            <Select value={state} onValueChange={(v) => { setState(v as any); setPage(1); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                <SelectItem value="unread">Sin leer</SelectItem>
                <SelectItem value="read">Leídas</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="w-40">
            <label className="mb-1 block text-[11px] text-muted-foreground">Prioridad</label>
            <Select value={priority} onValueChange={(v) => { setPriority(v); setPage(1); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {PRIORITIES.map((p) => (
                  <SelectItem key={p} value={p}>{PRIORITY_LABEL[p]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {isAdmin && (
            <div className="w-56">
              <label className="mb-1 block text-[11px] text-muted-foreground">Usuario</label>
              <Select value={userId} onValueChange={(v) => { setUserId(v); setPage(1); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent className="max-h-72">
                  <SelectItem value="all">Todos los usuarios</SelectItem>
                  {(qUsers.data?.users ?? []).map((u) => (
                    <SelectItem key={u.user_id} value={u.user_id}>{u.email}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="w-40">
            <label className="mb-1 block text-[11px] text-muted-foreground">Desde</label>
            <Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} />
          </div>
          <div className="w-40">
            <label className="mb-1 block text-[11px] text-muted-foreground">Hasta</label>
            <Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} />
          </div>
          {selected.length > 0 && (
            <div className="ml-auto flex items-center gap-2">
              <span className="text-xs text-muted-foreground">{selected.length} seleccionadas</span>
              <Button size="sm" variant="outline" onClick={() => mRead.mutate(selected)}>
                <CheckCheck className="mr-2 h-4 w-4" /> Leídas
              </Button>
              <Button size="sm" variant="destructive" onClick={() => mDelete.mutate(selected)}>
                <Trash2 className="mr-2 h-4 w-4" /> Eliminar
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Lista */}
      <Card>
        <CardContent className="p-0">
          {q.isLoading && (
            <div className="space-y-2 p-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-14 animate-pulse rounded-md bg-muted" />
              ))}
            </div>
          )}
          {!q.isLoading && rows.length === 0 && (
            <div className="p-10 text-center text-sm text-muted-foreground">
              No hay notificaciones con estos filtros.
            </div>
          )}
          <div className="divide-y divide-border">
            {rows.map((n: any) => (
              <div
                key={n.id}
                className={cn(
                  "flex items-start gap-3 px-4 py-3",
                  !n.read_at && "bg-primary/[0.04]",
                )}
              >
                <Checkbox
                  checked={selected.includes(n.id)}
                  onCheckedChange={() => toggle(n.id)}
                  className="mt-1"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {!n.read_at && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
                    <span className="text-sm font-medium">{n.title}</span>
                    <Badge variant="outline" className="text-[10px]">
                      {CATEGORY_LABEL[n.category ?? "sistema"] ?? n.category ?? "Sistema"}
                    </Badge>
                    <Badge
                      variant="outline"
                      className={cn("text-[10px]", PRIORITY_STYLE[n.priority ?? "media"])}
                    >
                      {PRIORITY_LABEL[n.priority ?? "media"] ?? n.priority}
                    </Badge>
                    {n.emailed_at && (
                      <Badge variant="outline" className="text-[10px]">Email enviado</Badge>
                    )}
                  </div>
                  {n.description && (
                    <p className="mt-1 text-xs text-muted-foreground">{n.description}</p>
                  )}
                  <div className="mt-1 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
                    <span>{new Date(n.created_at).toLocaleString("es-MX")}</span>
                    {isAdmin && n.user_id && <span>{userEmail[n.user_id] ?? n.user_id.slice(0, 8)}</span>}
                    {n.route && (
                      <Link to={n.route} className="text-primary hover:underline">Abrir</Link>
                    )}
                  </div>
                </div>
                {!n.read_at && (
                  <Button size="sm" variant="ghost" onClick={() => mRead.mutate([n.id])}>
                    <CheckCheck className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {pages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            Página {page} de {pages} · {total} notificaciones
          </span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Anterior
            </Button>
            <Button size="sm" variant="outline" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
              Siguiente
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
