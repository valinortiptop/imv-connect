import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Bell } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type Notif = {
  id: string;
  title: string;
  description: string | null;
  route: string | null;
  category: string | null;
  priority: string | null;
  read_at: string | null;
  created_at: string;
};

/** Campana de notificaciones compartida (admin + panel de representantes). */
export default function NotificationBell({ centerTo = "/admin/notificaciones" }: { centerTo?: string }) {
  const [items, setItems] = useState<Notif[]>([]);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getUser().then(({ data }) => {
      if (!mounted) return;
      setUserId(data.user?.id ?? null);
    });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    const load = async () => {
      const { data } = await supabase
        .from("notifications")
        .select("id, title, description, route, category, priority, read_at, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(20);
      if (!cancelled) setItems((data ?? []) as Notif[]);
    };
    load();

    const channelName = `notif-${userId}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        (payload) => {
          setItems((prev) => [payload.new as Notif, ...prev].slice(0, 20));
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        (payload) => {
          setItems((prev) =>
            prev.map((n) => (n.id === (payload.new as Notif).id ? (payload.new as Notif) : n)),
          );
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [userId]);

  const unread = items.filter((i) => !i.read_at).length;

  const markAllRead = async () => {
    if (!userId || unread === 0) return;
    const ids = items.filter((i) => !i.read_at).map((i) => i.id);
    setItems((prev) => prev.map((n) => (n.read_at ? n : { ...n, read_at: new Date().toISOString() })));
    await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .in("id", ids);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="relative inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted"
          aria-label="Notificaciones"
        >
          <Bell className="h-4 w-4" />
          {unread > 0 && (
            <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-medium text-white">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-96 w-80 overflow-auto p-0">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <span className="text-sm font-semibold">Notificaciones</span>
          {unread > 0 && (
            <button className="text-[11px] text-primary hover:underline" onClick={markAllRead}>
              Marcar todo leído
            </button>
          )}
        </div>
        {items.length === 0 && (
          <div className="p-4 text-center text-xs text-muted-foreground">Sin notificaciones</div>
        )}
        <div className="divide-y divide-border">
          {items.map((n) => {
            const body = (
              <div className="flex items-start gap-2">
                {!n.read_at && <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{n.title}</div>
                  {n.description && (
                    <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{n.description}</p>
                  )}
                  <p className="mt-0.5 text-[10px] text-muted-foreground">
                    {new Date(n.created_at).toLocaleString("es-MX")}
                  </p>
                </div>
              </div>
            );
            return n.route ? (
              <Link key={n.id} to={n.route} className="block px-3 py-2 hover:bg-muted/60">
                {body}
              </Link>
            ) : (
              <div key={n.id} className="px-3 py-2">
                {body}
              </div>
            );
          })}
        </div>
        <div className="sticky bottom-0 border-t border-border bg-popover px-3 py-2 text-center">
          <Link to={centerTo} className="text-[11px] font-medium text-primary hover:underline">
            Ver todas
          </Link>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
