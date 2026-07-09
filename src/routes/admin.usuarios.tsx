import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRoles, type AppRole } from "@/lib/use-roles";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/usuarios")({
  component: UsuariosPage,
});

type Usuario = {
  user_id: string;
  email: string;
  created_at: string;
  last_sign_in_at: string | null;
  roles: AppRole[];
};

const ROLES: AppRole[] = ["admin", "representante", "ventas", "almacen", "logistica", "contabilidad", "viewer"];
const ROLE_LABEL: Record<AppRole, string> = {
  admin: "Admin",
  representante: "Representante",
  ventas: "Ventas",
  almacen: "Almacén",
  logistica: "Logística",
  contabilidad: "Contabilidad",
  viewer: "Viewer",
};

function UsuariosPage() {
  const { isAdmin, isLoading: loadingRoles, roles } = useRoles();
  const qc = useQueryClient();

  const usuariosQ = useQuery({
    queryKey: ["usuarios-roles"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("listar_usuarios");
      if (error) throw error;
      return (data ?? []) as Usuario[];
    },
  });

  const bootstrap = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("bootstrap_admin");
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Eres admin. Recarga si no ves la lista.");
      qc.invalidateQueries({ queryKey: ["current-user-roles"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const asignar = useMutation({
    mutationFn: async (v: { user_id: string; role: AppRole }) => {
      const { error } = await supabase.rpc("asignar_rol", {
        _user_id: v.user_id,
        _role: v.role,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Rol asignado");
      qc.invalidateQueries({ queryKey: ["usuarios-roles"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remover = useMutation({
    mutationFn: async (v: { user_id: string; role: AppRole }) => {
      const { error } = await supabase.rpc("remover_rol", {
        _user_id: v.user_id,
        _role: v.role,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Rol removido");
      qc.invalidateQueries({ queryKey: ["usuarios-roles"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (loadingRoles) return <p className="text-sm text-muted-foreground">Cargando…</p>;

  if (!isAdmin) {
    return (
      <section className="space-y-4">
        <h1 className="text-2xl font-bold">Usuarios y roles</h1>
        <div className="rounded-md border border-border bg-card p-6 text-sm">
          <p className="mb-3">
            No tienes rol <strong>admin</strong>. Tus roles actuales:{" "}
            {roles.length === 0 ? (
              <em className="text-muted-foreground">(ninguno)</em>
            ) : (
              roles.map((r) => (
                <span
                  key={r}
                  className="ml-1 rounded-full bg-muted px-2 py-0.5 text-xs"
                >
                  {ROLE_LABEL[r]}
                </span>
              ))
            )}
          </p>
          <p className="mb-3 text-muted-foreground">
            Si todavía no existe ningún admin en el sistema, puedes auto-asignarte
            como primer admin (sólo funciona una vez).
          </p>
          <button
            onClick={() => bootstrap.mutate()}
            disabled={bootstrap.isPending}
            className="btn-primary"
          >
            {bootstrap.isPending ? "Asignando…" : "Hacerme admin (bootstrap)"}
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Usuarios y roles</h1>
        <p className="text-sm text-muted-foreground">
          Asigna roles a cada usuario. Los roles son: admin (todo), ventas (pedidos
          y clientes), almacén (inventario y compras), contabilidad (facturas y
          cobranza).
        </p>
      </div>

      {usuariosQ.isLoading && (
        <p className="text-sm text-muted-foreground">Cargando usuarios…</p>
      )}

      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Correo</th>
              <th className="px-3 py-2">Alta</th>
              <th className="px-3 py-2">Último acceso</th>
              <th className="px-3 py-2">Roles</th>
              <th className="px-3 py-2">Asignar</th>
            </tr>
          </thead>
          <tbody>
            {(usuariosQ.data ?? []).map((u) => {
              const faltantes = ROLES.filter((r) => !u.roles.includes(r));
              return (
                <tr key={u.user_id} className="border-t border-border align-top">
                  <td className="px-3 py-2">{u.email}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {new Date(u.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {u.last_sign_in_at
                      ? new Date(u.last_sign_in_at).toLocaleDateString()
                      : "—"}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {u.roles.length === 0 && (
                        <span className="text-xs text-muted-foreground">(sin rol)</span>
                      )}
                      {u.roles.map((r) => (
                        <span
                          key={r}
                          className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary"
                        >
                          {ROLE_LABEL[r]}
                          <button
                            onClick={() =>
                              remover.mutate({ user_id: u.user_id, role: r })
                            }
                            className="text-primary/70 hover:text-primary"
                            title="Remover"
                          >
                            ✕
                          </button>
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    {faltantes.length === 0 ? (
                      <span className="text-xs text-muted-foreground">—</span>
                    ) : (
                      <select
                        defaultValue=""
                        onChange={(e) => {
                          const v = e.target.value as AppRole | "";
                          if (!v) return;
                          asignar.mutate({ user_id: u.user_id, role: v });
                          e.currentTarget.value = "";
                        }}
                        className="rounded-md border border-input bg-background px-2 py-1 text-xs"
                      >
                        <option value="">+ rol…</option>
                        {faltantes.map((r) => (
                          <option key={r} value={r}>
                            {ROLE_LABEL[r]}
                          </option>
                        ))}
                      </select>
                    )}
                  </td>
                </tr>
              );
            })}
            {(usuariosQ.data ?? []).length === 0 && !usuariosQ.isLoading && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">
                  Sin usuarios.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-muted-foreground">
        Los usuarios se crean desde Supabase → Authentication → Users. Aquí
        solamente se asignan/quitan roles.
      </p>
    </section>
  );
}
