// @ts-nocheck
import { useEffect, useState, useCallback } from "react";
import { useLanguage } from "@/hooks/use-language";
import { useAuth, type AppRole } from "@/hooks/use-auth";
import { notifyPermissionsChanged } from "@/hooks/use-permissions";
import { titleCase, cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Trash2 } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  Loader2, Shield, CheckCircle2, XCircle, SlidersHorizontal, Users2,
  LayoutDashboard, Bot, Calculator, ShoppingCart, Tag, TrendingUp,
  BarChart3, Package, Warehouse, Truck, ClipboardList, Route,
  BookOpen, FileText, Link2, Settings, Eye, EyeOff,
} from "lucide-react";

/* ─── types ─── */
interface UserRow {
  user_id: string;
  email: string;
  name: string;
  avatar_url: string | null;
  role: AppRole;
  approved: boolean;
}

interface RoutePerm {
  route_key: string;
  route_path: string;
  group_label: string;
  allowed: boolean;
}

interface UserOverride {
  route_key: string;
  allowed: boolean;
}

/* ─── constants ─── */
const ROLES: AppRole[] = ["admin", "ventas", "almacen", "logistica", "viewer"];

const ROLE_COLORS: Record<AppRole, string> = {
  admin: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  ventas: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  almacen: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  logistica: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  viewer: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
};

const ROUTE_LABELS: Record<string, { es: string; en: string }> = {
  // General
  navDashboard: { es: "Dashboard", en: "Dashboard" },
  navAIChat: { es: "Gandalf IA", en: "Gandalf AI" },
  navTareas: { es: "Tareas", en: "Tasks" },
  navCalculator: { es: "Calculadora", en: "Calculator" },
  // Ventas
  navOrders: { es: "Pedidos", en: "Orders" },
  navDirectory: { es: "Facturación", en: "Billing" },
  navClients: { es: "Clientes", en: "Clients" },
  navPromos: { es: "Promociones", en: "Promotions" },
  navPriceLists: { es: "Listas de precios", en: "Price lists" },
  navSales: { es: "Ventas", en: "Sales" },
  navPnL: { es: "P&L", en: "P&L" },
  navProspects: { es: "Prospectos", en: "Prospects" },
  navVentasReport: { es: "Reporte ADM", en: "ADM Report" },
  // Inventario
  navProducts: { es: "Productos", en: "Products" },
  navInventory: { es: "Inventario", en: "Inventory" },
  navInventario: { es: "Almacén", en: "Warehouse" },
  navKardex: { es: "Kardex", en: "Kardex" },
  navStock: { es: "Entradas", en: "Entries" },
  navPurchaseNeeds: { es: "Necesidades de compra", en: "Purchase Needs" },
  navDamaged: { es: "Dañados", en: "Damaged" },
  navDevoluciones: { es: "Devoluciones", en: "Returns" },
  // Operaciones
  navLogistics: { es: "Logística", en: "Logistics" },
  navManiobra: { es: "Maniobra", en: "Maneuver" },
  navCatalogo: { es: "Catálogo", en: "Catalog" },
  navDocuments: { es: "Documentos", en: "Documents" },
  // Configuración
  navPortalAdmin: { es: "Portal Clientes", en: "Client Portal" },
  navAdmin: { es: "Administración", en: "Administration" },
  navPartners: { es: "Partners", en: "Partners" },
  navReps: { es: "Representantes", en: "Sales Reps" },
  navOnboarding: { es: "Onboarding", en: "Onboarding" },
  navApiStatus: { es: "Estado APIs", en: "API Status" },
  navApiUsage: { es: "Uso de APIs", en: "API Usage" },
};

const GROUP_LABELS: Record<string, { es: string; en: string }> = {
  // Canonical group keys are Spanish now (matches permission_routes after
  // the normalize_permission_route_groups migration). Old English keys
  // are kept as aliases for any rows that haven't been migrated yet.
  General: { es: "General", en: "General" },
  Ventas: { es: "Ventas", en: "Sales" },
  Inventario: { es: "Inventario", en: "Inventory" },
  Operaciones: { es: "Operaciones", en: "Operations" },
  Configuración: { es: "Configuración", en: "Settings" },
  // Legacy aliases — kept so older rows still render with the right label
  Sales: { es: "Ventas", en: "Sales" },
  Inventory: { es: "Inventario", en: "Inventory" },
  Operations: { es: "Operaciones", en: "Operations" },
  Settings: { es: "Configuración", en: "Settings" },
  Almacén: { es: "Inventario", en: "Inventory" },
};

/* ─── main component ─── */
export default function Admin() {
  const { lang } = useLanguage();
  const { role: myRole, user: me } = useAuth();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  const isAdmin = myRole === "admin";

  /* ─── user management ─── */
  const fetchUsers = useCallback(async () => {
    setLoading(true);
    const { data: roles, error } = await supabase
      .from("user_roles")
      .select("user_id, role, approved");

    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }

    const rows: UserRow[] = (roles ?? []).map((r: any) => ({
      user_id: r.user_id,
      email: "",
      name: "",
      avatar_url: null,
      role: r.role as AppRole,
      approved: r.approved ?? false,
    }));

    const { data: userDetails } = await supabase.rpc("get_all_users_for_admin");
    if (userDetails && Array.isArray(userDetails)) {
      const detailMap = new Map(userDetails.map((u: any) => [u.id, u]));
      for (const row of rows) {
        const detail = detailMap.get(row.user_id);
        if (detail) {
          row.email = detail.email ?? "";
          row.name =
            detail.raw_user_meta_data?.full_name ??
            detail.raw_user_meta_data?.name ??
            "";
          row.avatar_url = detail.raw_user_meta_data?.avatar_url ?? null;
        }
      }
    }

    setUsers(rows);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (isAdmin) fetchUsers();
    else setLoading(false);
  }, [isAdmin, fetchUsers]);

  const updateRole = async (userId: string, newRole: AppRole) => {
    if (userId === me?.id) {
      toast.error(lang === "es" ? "No puedes cambiar tu propio rol" : "You can't change your own role");
      return;
    }
    setSaving(userId);
    const { error } = await supabase
      .from("user_roles")
      .update({ role: newRole, updated_at: new Date().toISOString() })
      .eq("user_id", userId);

    if (error) toast.error(error.message);
    else {
      toast.success(lang === "es" ? "Rol actualizado" : "Role updated");
      setUsers((prev) => prev.map((u) => (u.user_id === userId ? { ...u, role: newRole } : u)));
    }
    setSaving(null);
  };

  const toggleApproval = async (userId: string, currentApproved: boolean) => {
    if (userId === me?.id) {
      toast.error(lang === "es" ? "No puedes cambiar tu propio acceso" : "You can't change your own access");
      return;
    }
    setSaving(userId);
    const { error } = await supabase
      .from("user_roles")
      .update({ approved: !currentApproved, updated_at: new Date().toISOString() })
      .eq("user_id", userId);

    if (error) toast.error(error.message);
    else {
      toast.success(
        !currentApproved
          ? lang === "es" ? "Usuario aprobado" : "User approved"
          : lang === "es" ? "Acceso revocado" : "Access revoked"
      );
      setUsers((prev) =>
        prev.map((u) => (u.user_id === userId ? { ...u, approved: !currentApproved } : u))
      );
    }
    setSaving(null);
  };

  const deleteUser = async (userId: string) => {
    if (userId === me?.id) {
      toast.error(lang === "es" ? "No puedes eliminarte a ti mismo" : "You can't delete your own account");
      return;
    }
    setSaving(userId);
    const { error } = await supabase.rpc("delete_user_as_admin" as any, { target_user_id: userId });
    if (error) toast.error(error.message);
    else {
      toast.success(lang === "es" ? "Usuario eliminado" : "User deleted");
      setUsers((prev) => prev.filter((u) => u.user_id !== userId));
    }
    setSaving(null);
  };

  /* ─── not admin ─── */
  if (!isAdmin) {
    return (
      <div className="p-4 md:p-8 flex flex-col items-center justify-center gap-4 min-h-[50vh]">
        <Shield className="h-12 w-12 text-muted-foreground" />
        <p className="text-muted-foreground">
          {lang === "es" ? "Solo los administradores pueden acceder a esta página." : "Only admins can access this page."}
        </p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          {lang === "es" ? "Administración" : "Administration"}
        </h1>
        <p className="text-muted-foreground mt-1">
          {lang === "es"
            ? "Gestiona usuarios, roles y permisos de acceso."
            : "Manage users, roles, and access permissions."}
        </p>
      </div>

      <Tabs defaultValue="users" className="space-y-4">
        <TabsList>
          <TabsTrigger value="users" className="gap-2">
            <Users2 className="h-4 w-4" />
            {lang === "es" ? "Usuarios" : "Users"}
          </TabsTrigger>
          <TabsTrigger value="permissions" className="gap-2">
            <SlidersHorizontal className="h-4 w-4" />
            {lang === "es" ? "Permisos por Rol" : "Role Permissions"}
          </TabsTrigger>
          <TabsTrigger value="visibility" className="gap-2">
            <Eye className="h-4 w-4" />
            {lang === "es" ? "Visibilidad de pestañas" : "Tab Visibility"}
          </TabsTrigger>
        </TabsList>

        {/* ─── Users tab ─── */}
        <TabsContent value="users" className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {ROLES.map((r) => (
              <Badge key={r} variant="outline" className={ROLE_COLORS[r]}>
                {r}
              </Badge>
            ))}
          </div>

          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              {/* ─── Mobile card view ─── */}
              <div className="md:hidden space-y-3">
                {users.map((u) => (
                  <UserMobileCard
                    key={u.user_id}
                    u={u}
                    me={me}
                    lang={lang}
                    saving={saving}
                    onUpdateRole={updateRole}
                    onToggleApproval={toggleApproval}
                    onDelete={deleteUser}
                  />
                ))}
                {users.length === 0 && (
                  <p className="text-center py-8 text-muted-foreground">
                    {lang === "es" ? "No hay usuarios registrados." : "No users registered."}
                  </p>
                )}
              </div>

              {/* ─── Desktop table view ─── */}
              <div className="hidden md:block rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{lang === "es" ? "Usuario" : "User"}</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>{lang === "es" ? "Acceso" : "Access"}</TableHead>
                      <TableHead>{lang === "es" ? "Rol" : "Role"}</TableHead>
                      <TableHead className="w-[180px]">{lang === "es" ? "Cambiar rol" : "Change role"}</TableHead>
                      <TableHead className="w-[100px]">{lang === "es" ? "Permisos" : "Permissions"}</TableHead>
                      <TableHead className="w-[60px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users.map((u) => (
                      <UserTableRow
                        key={u.user_id}
                        u={u}
                        me={me}
                        lang={lang}
                        saving={saving}
                        onUpdateRole={updateRole}
                        onToggleApproval={toggleApproval}
                        onDelete={deleteUser}
                      />
                    ))}
                    {users.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                          {lang === "es" ? "No hay usuarios registrados." : "No users registered."}
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </TabsContent>

        {/* ─── Role Permissions tab ─── */}
        <TabsContent value="permissions">
          <RolePermissionsEditor lang={lang} />
        </TabsContent>

        {/* ─── Tab Visibility tab ─── */}
        <TabsContent value="visibility">
          <RouteVisibilityEditor lang={lang} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   User table row with per-user override button
   ═══════════════════════════════════════════════════════════ */
function UserTableRow({
  u,
  me,
  lang,
  saving,
  onUpdateRole,
  onToggleApproval,
  onDelete,
}: {
  u: UserRow;
  me: any;
  lang: string;
  saving: string | null;
  onUpdateRole: (id: string, role: AppRole) => void;
  onToggleApproval: (id: string, approved: boolean) => void;
  onDelete: (id: string) => void;
}) {
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  return (
    <>
      <TableRow>
        <TableCell>
          <div className="flex items-center gap-2">
            {u.avatar_url && <img src={u.avatar_url} alt="" className="h-7 w-7 rounded-full" />}
            <span>{titleCase(u.name) || u.user_id.slice(0, 8)}</span>
            {u.user_id === me?.id && (
              <Badge variant="secondary" className="text-[10px]">
                {lang === "es" ? "Tú" : "You"}
              </Badge>
            )}
          </div>
        </TableCell>
        <TableCell className="text-muted-foreground">{u.email || "—"}</TableCell>
        <TableCell>
          {u.user_id === me?.id ? (
            <CheckCircle2 className="h-5 w-5 text-green-500" />
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2"
              onClick={() => onToggleApproval(u.user_id, u.approved)}
              disabled={saving === u.user_id}
            >
              {u.approved ? (
                <CheckCircle2 className="h-5 w-5 text-green-500" />
              ) : (
                <XCircle className="h-5 w-5 text-red-400" />
              )}
              <span className="ml-1 text-xs">
                {u.approved
                  ? lang === "es" ? "Aprobado" : "Approved"
                  : lang === "es" ? "Pendiente" : "Pending"}
              </span>
            </Button>
          )}
        </TableCell>
        <TableCell>
          <Badge variant="outline" className={ROLE_COLORS[u.role]}>
            {u.role}
          </Badge>
        </TableCell>
        <TableCell>
          {u.user_id === me?.id ? (
            <span className="text-xs text-muted-foreground">—</span>
          ) : (
            <Select
              value={u.role}
              onValueChange={(v) => onUpdateRole(u.user_id, v as AppRole)}
              disabled={saving === u.user_id}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLES.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </TableCell>
        <TableCell>
          {u.user_id === me?.id ? (
            <span className="text-xs text-muted-foreground">—</span>
          ) : (
            <Button variant="outline" size="sm" className="h-8 text-xs gap-1" onClick={() => setOverrideOpen(true)}>
              <SlidersHorizontal className="h-3.5 w-3.5" />
              {lang === "es" ? "Extra" : "Extra"}
            </Button>
          )}
        </TableCell>
        <TableCell>
          {u.user_id === me?.id ? (
            <span className="text-xs text-muted-foreground">—</span>
          ) : (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-500/10"
              onClick={() => setDeleteOpen(true)}
              disabled={saving === u.user_id}
              title={lang === "es" ? "Eliminar" : "Delete"}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </TableCell>
      </TableRow>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {lang === "es" ? "¿Eliminar usuario?" : "Delete user?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {lang === "es"
                ? `Esta acción eliminará permanentemente a ${u.name || u.email || u.user_id.slice(0, 8)}. No se puede deshacer.`
                : `This will permanently delete ${u.name || u.email || u.user_id.slice(0, 8)}. This cannot be undone.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{lang === "es" ? "Cancelar" : "Cancel"}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => { setDeleteOpen(false); onDelete(u.user_id); }}
            >
              {lang === "es" ? "Eliminar" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {overrideOpen && (
        <UserOverrideDialog
          userId={u.user_id}
          userName={u.name || u.email || u.user_id.slice(0, 8)}
          userRole={u.role}
          lang={lang}
          open={overrideOpen}
          onClose={() => setOverrideOpen(false)}
        />
      )}
    </>
  );
}

/* ═══════════════════════════════════════════════════════════
   Mobile user card (shown < md)
   ═══════════════════════════════════════════════════════════ */
function UserMobileCard({
  u,
  me,
  lang,
  saving,
  onUpdateRole,
  onToggleApproval,
  onDelete,
}: {
  u: UserRow;
  me: any;
  lang: string;
  saving: string | null;
  onUpdateRole: (id: string, role: AppRole) => void;
  onToggleApproval: (id: string, approved: boolean) => void;
  onDelete: (id: string) => void;
}) {
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const accessLabel = u.approved
    ? lang === "es" ? "Aprobado" : "Approved"
    : lang === "es" ? "Pendiente" : "Pending";

  const accessColor = u.approved
    ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
    : "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200";

  return (
    <>
      <div className="rounded-lg border p-4 space-y-3">
        {/* Row 1: User identity + access badge */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            {u.avatar_url && (
              <img src={u.avatar_url} alt="" className="h-8 w-8 rounded-full shrink-0" />
            )}
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">
                {titleCase(u.name) || u.email || u.user_id.slice(0, 8)}
                {u.user_id === me?.id && (
                  <Badge variant="secondary" className="text-[10px] ml-1.5 align-middle">
                    {lang === "es" ? "Tú" : "You"}
                  </Badge>
                )}
              </p>
              {u.email && u.name && (
                <p className="text-xs text-muted-foreground truncate">{u.email}</p>
              )}
            </div>
          </div>

          {u.user_id === me?.id ? (
            <Badge className={accessColor + " shrink-0"}>{accessLabel}</Badge>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 shrink-0"
              onClick={() => onToggleApproval(u.user_id, u.approved)}
              disabled={saving === u.user_id}
            >
              <Badge className={accessColor}>{accessLabel}</Badge>
            </Button>
          )}
        </div>

        {/* Row 2: Current role badge */}
        <div>
          <Badge variant="outline" className={ROLE_COLORS[u.role]}>
            {u.role}
          </Badge>
        </div>

        {/* Row 3: Role change select (full width) */}
        {u.user_id === me?.id ? null : (
          <Select
            value={u.role}
            onValueChange={(v) => onUpdateRole(u.user_id, v as AppRole)}
            disabled={saving === u.user_id}
          >
            <SelectTrigger className="h-9 text-sm w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ROLES.map((r) => (
                <SelectItem key={r} value={r}>
                  {r}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* Row 4: Extra permissions button */}
        {u.user_id === me?.id ? null : (
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="flex-1 h-9 text-sm gap-1.5"
              onClick={() => setOverrideOpen(true)}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              {lang === "es" ? "Extra" : "Extra"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-9 px-3 text-red-500 hover:text-red-600 hover:bg-red-500/10 border-red-500/30"
              onClick={() => setDeleteOpen(true)}
              disabled={saving === u.user_id}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {lang === "es" ? "¿Eliminar usuario?" : "Delete user?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {lang === "es"
                ? `Esta acción eliminará permanentemente a ${u.name || u.email || u.user_id.slice(0, 8)}. No se puede deshacer.`
                : `This will permanently delete ${u.name || u.email || u.user_id.slice(0, 8)}. This cannot be undone.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{lang === "es" ? "Cancelar" : "Cancel"}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => { setDeleteOpen(false); onDelete(u.user_id); }}
            >
              {lang === "es" ? "Eliminar" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {overrideOpen && (
        <UserOverrideDialog
          userId={u.user_id}
          userName={u.name || u.email || u.user_id.slice(0, 8)}
          userRole={u.role}
          lang={lang}
          open={overrideOpen}
          onClose={() => setOverrideOpen(false)}
        />
      )}
    </>
  );
}

/* ═══════════════════════════════════════════════════════════
   Per-user override dialog
   ═══════════════════════════════════════════════════════════ */
function UserOverrideDialog({
  userId,
  userName,
  userRole,
  lang,
  open,
  onClose,
}: {
  userId: string;
  userName: string;
  userRole: AppRole;
  lang: string;
  open: boolean;
  onClose: () => void;
}) {
  const [rolePerms, setRolePerms] = useState<RoutePerm[]>([]);
  const [overrides, setOverrides] = useState<Map<string, boolean>>(new Map());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    (async () => {
      setLoading(true);
      // Fetch role defaults
      const { data: rp } = await supabase.rpc("get_role_permissions", { p_role: userRole });
      const perms: RoutePerm[] = rp && Array.isArray(rp) ? (rp as unknown as RoutePerm[]) : [];
      setRolePerms(perms);

      // Fetch user overrides
      const { data: uo } = await supabase.rpc("get_user_overrides", { p_user_id: userId });
      const oMap = new Map<string, boolean>();
      if (uo && Array.isArray(uo)) {
        for (const o of uo as unknown as UserOverride[]) {
          oMap.set(o.route_key, o.allowed);
        }
      }
      setOverrides(oMap);
      setLoading(false);
    })();
  }, [open, userId, userRole]);

  const toggleOverride = (routeKey: string, roleDefault: boolean) => {
    setOverrides((prev) => {
      const next = new Map(prev);
      const currentOverride = next.get(routeKey);
      if (currentOverride === undefined) {
        // No override yet — set opposite of role default
        next.set(routeKey, !roleDefault);
      } else {
        // Has override — remove it (revert to role default)
        next.delete(routeKey);
      }
      return next;
    });
  };

  const save = async () => {
    setSaving(true);
    // Delete all existing overrides for this user
    await supabase.from("user_permission_overrides").delete().eq("user_id", userId);

    // Insert new overrides
    const rows = [...overrides.entries()].map(([route_key, allowed]) => ({
      user_id: userId,
      route_key,
      allowed,
    }));

    if (rows.length > 0) {
      const { error } = await supabase.from("user_permission_overrides").insert(rows);
      if (error) {
        toast.error(error.message);
        setSaving(false);
        return;
      }
    }

    toast.success(lang === "es" ? "Permisos guardados" : "Permissions saved");
    setSaving(false);
    onClose();
  };

  const grouped = groupByLabel(rolePerms);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-[95vw] sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {lang === "es" ? "Acceso extra para" : "Extra access for"} {userName}
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            {lang === "es"
              ? "Los toggles verdes son del rol. Activa extras manualmente."
              : "Green toggles are from the role. Toggle extras manually."}
          </p>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4">
            {Object.entries(grouped).map(([group, perms]) => (
              <div key={group}>
                <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-2">
                  {GROUP_LABELS[group]?.[lang as "es" | "en"] ?? group}
                </h4>
                <div className="space-y-2">
                  {perms.map((p) => {
                    const hasOverride = overrides.has(p.route_key);
                    const effectiveAllowed = hasOverride ? overrides.get(p.route_key)! : p.allowed;
                    const isRoleDefault = p.allowed;

                    return (
                      <div
                        key={p.route_key}
                        className="flex items-center justify-between py-1.5 px-3 rounded-md hover:bg-muted/50"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-sm">
                            {ROUTE_LABELS[p.route_key]?.[lang as "es" | "en"] ?? p.route_key}
                          </span>
                          {isRoleDefault && !hasOverride && (
                            <span className="text-[10px] text-green-600 dark:text-green-400 font-medium">
                              {lang === "es" ? "rol" : "role"}
                            </span>
                          )}
                          {hasOverride && (
                            <span className="text-[10px] text-blue-600 dark:text-blue-400 font-medium">
                              {lang === "es" ? "extra" : "extra"}
                            </span>
                          )}
                        </div>
                        <Switch
                          checked={effectiveAllowed}
                          onCheckedChange={() => toggleOverride(p.route_key, isRoleDefault)}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" size="sm" onClick={onClose}>
            {lang === "es" ? "Cancelar" : "Cancel"}
          </Button>
          <Button size="sm" onClick={save} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
            {lang === "es" ? "Guardar" : "Save"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ═══════════════════════════════════════════════════════════
   Role Permissions Editor — vertical list matching sidebar order
   ═══════════════════════════════════════════════════════════ */

const ROUTE_ICONS: Record<string, typeof LayoutDashboard> = {
  navDashboard: LayoutDashboard,
  navAIChat: Bot,
  navCalculator: Calculator,
  navOrders: ShoppingCart,
  navClients: Users2,
  navPromos: Tag,
  navSales: TrendingUp,
  navPnL: BarChart3,
  navProducts: Package,
  navInventory: Warehouse,
  navStock: Truck,
  navPurchaseNeeds: ClipboardList,
  navLogistics: Route,
  navCatalogo: BookOpen,
  navDocuments: FileText,
  navPortalAdmin: Link2,
  navAdmin: Settings,
};

const GROUP_ICONS: Record<string, typeof LayoutDashboard> = {
  General: LayoutDashboard,
  Sales: ShoppingCart,
  Inventory: Package,
  Operations: Route,
  Settings: Settings,
};

function RolePermissionsEditor({ lang }: { lang: string }) {
  const [selectedRole, setSelectedRole] = useState<AppRole>("ventas");
  const [perms, setPerms] = useState<RoutePerm[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchPerms = useCallback(async (role: AppRole) => {
    setLoading(true);
    const { data } = await supabase.rpc("get_role_permissions", { p_role: role });
    if (data && Array.isArray(data)) {
      setPerms(data as unknown as RoutePerm[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchPerms(selectedRole);
  }, [selectedRole, fetchPerms]);

  const togglePerm = (routeKey: string) => {
    setPerms((prev) =>
      prev.map((p) => (p.route_key === routeKey ? { ...p, allowed: !p.allowed } : p))
    );
  };

  const toggleGroup = (groupLabel: string, newValue: boolean) => {
    setPerms((prev) =>
      prev.map((p) => (p.group_label === groupLabel ? { ...p, allowed: newValue } : p))
    );
  };

  const savePerms = async () => {
    setSaving(true);
    for (const p of perms) {
      const { error } = await supabase.rpc("admin_set_role_permission", {
        p_role: selectedRole,
        p_route_key: p.route_key,
        p_allowed: p.allowed,
      });
      if (error) {
        toast.error(error.message);
        setSaving(false);
        return;
      }
    }
    notifyPermissionsChanged();
    toast.success(lang === "es" ? "Permisos del rol guardados" : "Role permissions saved");
    setSaving(false);
  };

  const grouped = groupByLabel(perms);

  return (
    <div className="space-y-6 max-w-xl">
      {/* Role selector */}
      <div className="space-y-3">
        <span className="text-sm font-medium">
          {lang === "es" ? "Editar permisos de:" : "Edit permissions for:"}
        </span>
        <div className="flex gap-2">
          {ROLES.filter((r) => r !== "admin").map((r) => (
            <Button
              key={r}
              variant={selectedRole === r ? "default" : "outline"}
              size="sm"
              className={selectedRole === r ? "" : ROLE_COLORS[r]}
              onClick={() => setSelectedRole(r)}
            >
              {r}
            </Button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          {lang === "es"
            ? "Admin siempre tiene acceso completo."
            : "Admin always has full access."}
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-1">
          {Object.entries(grouped).map(([group, items]) => {
            const allOn = items.every((p) => p.allowed);
            const enabledCount = items.filter((p) => p.allowed).length;
            const GroupIcon = GROUP_ICONS[group] ?? LayoutDashboard;

            return (
              <div key={group}>
                {/* Section header — toggle for entire section */}
                <div
                  className="flex items-center justify-between py-3 px-4 bg-muted/50 rounded-lg cursor-pointer hover:bg-muted/80 transition-colors"
                  onClick={() => toggleGroup(group, !allOn)}
                >
                  <div className="flex items-center gap-3">
                    <GroupIcon className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-semibold">
                      {GROUP_LABELS[group]?.[lang as "es" | "en"] ?? group}
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      {enabledCount}/{items.length}
                    </span>
                  </div>
                  <Switch
                    checked={allOn}
                    onCheckedChange={(v) => toggleGroup(group, v)}
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>

                {/* Individual routes — indented under section */}
                <div className="ml-4 border-l border-border pl-4 py-1">
                  {items.map((p) => {
                    const Icon = ROUTE_ICONS[p.route_key];
                    return (
                      <div
                        key={p.route_key}
                        className="flex items-center justify-between py-2 px-3 rounded-md hover:bg-muted/30 transition-colors cursor-pointer"
                        onClick={() => togglePerm(p.route_key)}
                      >
                        <div className="flex items-center gap-3">
                          {Icon && <Icon className="h-3.5 w-3.5 text-muted-foreground" />}
                          <span className="text-sm">
                            {ROUTE_LABELS[p.route_key]?.[lang as "es" | "en"] ?? p.route_key}
                          </span>
                        </div>
                        <Switch
                          checked={p.allowed}
                          onCheckedChange={() => togglePerm(p.route_key)}
                          onClick={(e) => e.stopPropagation()}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          <div className="flex justify-end pt-4">
            <Button onClick={savePerms} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              {lang === "es" ? "Guardar permisos" : "Save permissions"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   Route visibility editor — toggle which tabs are visible
   app-wide. Powered by admin_list_all_routes + admin_set_route_active.
   Inactive routes vanish from the sidebar AND get blocked by the
   permission system, but code/routes/data stay intact so flipping
   back to active revives everything.
   ═══════════════════════════════════════════════════════════ */
interface RouteVisibilityRow {
  route_key: string;
  route_path: string;
  group_label: string;
  active: boolean;
  sort_order: number;
}

function RouteVisibilityEditor({ lang }: { lang: string }) {
  const [rows, setRows] = useState<RouteVisibilityRow[]>([]);
  const [loading, setLoading] = useState(true);
  // Per-row saving state so a slow toggle doesn't lock the rest of the UI
  const [savingKey, setSavingKey] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data, error } = await supabase.rpc("admin_list_all_routes");
      if (error) {
        toast.error(error.message);
        setLoading(false);
        return;
      }
      if (data && Array.isArray(data)) {
        setRows(data as unknown as RouteVisibilityRow[]);
      }
      setLoading(false);
    })();
  }, []);

  const toggleActive = async (row: RouteVisibilityRow) => {
    const next = !row.active;
    setSavingKey(row.route_key);
    // Optimistic update so the toggle feels instant
    setRows((prev) =>
      prev.map((r) => (r.route_key === row.route_key ? { ...r, active: next } : r)),
    );
    const { error } = await supabase.rpc("admin_set_route_active", {
      p_route_key: row.route_key,
      p_active: next,
    });
    if (error) {
      // Roll back the optimistic update on failure
      setRows((prev) =>
        prev.map((r) => (r.route_key === row.route_key ? { ...r, active: row.active } : r)),
      );
      toast.error(error.message);
    } else {
      // Tell every active usePermissions hook (sidebar, mobile nav,
      // AppLayout canAccess guard) to refetch so the change reflects
      // instantly — no page refresh needed.
      notifyPermissionsChanged();
      const label = ROUTE_LABELS[row.route_key]?.[lang as "es" | "en"] ?? row.route_key;
      toast.success(
        next
          ? (lang === "es" ? `${label} activada` : `${label} activated`)
          : (lang === "es" ? `${label} oculta` : `${label} hidden`),
      );
    }
    setSavingKey(null);
  };

  // Group rows for display (sort_order already encodes the desired order)
  const grouped: Record<string, RouteVisibilityRow[]> = {};
  for (const r of rows) {
    if (!grouped[r.group_label]) grouped[r.group_label] = [];
    grouped[r.group_label].push(r);
  }

  const totalActive = rows.filter((r) => r.active).length;
  const totalHidden = rows.length - totalActive;

  return (
    <div className="space-y-6 max-w-xl">
      <div className="space-y-1">
        <p className="text-sm text-muted-foreground">
          {lang === "es"
            ? "Apaga el switch para ocultar una pestaña en todo el sistema. El código se queda intacto — actívala otra vez cuando la necesites."
            : "Turn off a switch to hide a tab system-wide. The code stays intact — flip it back on whenever you need it."}
        </p>
        {!loading && (
          <p className="text-[11px] text-muted-foreground">
            {totalActive} {lang === "es" ? "activas" : "active"} · {totalHidden}{" "}
            {lang === "es" ? "ocultas" : "hidden"}
          </p>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(grouped).map(([group, items]) => {
            const GroupIcon = GROUP_ICONS[group] ?? LayoutDashboard;
            const visibleCount = items.filter((r) => r.active).length;
            return (
              <div key={group}>
                <div className="flex items-center gap-3 py-2 px-4 bg-muted/50 rounded-lg">
                  <GroupIcon className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-semibold">
                    {GROUP_LABELS[group]?.[lang as "es" | "en"] ?? group}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    {visibleCount}/{items.length}
                  </span>
                </div>

                <div className="ml-4 border-l border-border pl-4 py-1">
                  {items.map((r) => {
                    const Icon = ROUTE_ICONS[r.route_key];
                    const label =
                      ROUTE_LABELS[r.route_key]?.[lang as "es" | "en"] ?? r.route_key;
                    const isSaving = savingKey === r.route_key;
                    return (
                      <div
                        key={r.route_key}
                        className={cn(
                          "flex items-center justify-between py-2 px-3 rounded-md transition-colors",
                          r.active ? "hover:bg-muted/30" : "opacity-60 hover:opacity-80",
                        )}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          {r.active ? (
                            Icon ? (
                              <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            ) : (
                              <Eye className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            )
                          ) : (
                            <EyeOff className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          )}
                          <span className="text-sm truncate">{label}</span>
                          <span className="text-[10px] text-muted-foreground font-mono shrink-0">
                            {r.route_path}
                          </span>
                        </div>
                        <Switch
                          checked={r.active}
                          disabled={isSaving}
                          onCheckedChange={() => toggleActive(r)}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ─── helpers ─── */
function groupByLabel(perms: RoutePerm[]): Record<string, RoutePerm[]> {
  const groups: Record<string, RoutePerm[]> = {};
  for (const p of perms) {
    if (!groups[p.group_label]) groups[p.group_label] = [];
    groups[p.group_label].push(p);
  }
  return groups;
}
