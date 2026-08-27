import { useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useRoles } from "@/lib/use-roles";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

/**
 * Personal account settings — available to EVERY signed-in user
 * (representantes, ventas, almacén, etc.). Administrative settings
 * (managing other users, roles and their passwords) live in
 * /admin/administracion and /admin/usuarios and are admin-only.
 */
export default function AccountSettingsPage() {
  const navigate = useNavigate();
  const { roles, isAdmin } = useRoles();
  const [email, setEmail] = useState("");
  const [userId, setUserId] = useState("");
  const [fullName, setFullName] = useState("");
  const [createdAt, setCreatedAt] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const u = data.user;
      if (!u) return;
      setEmail(u.email ?? "");
      setNewEmail(u.email ?? "");
      setUserId(u.id);
      setFullName((u.user_metadata as any)?.full_name ?? "");
      setCreatedAt(u.created_at ?? "");
    });
  }, []);

  const updateName = async () => {
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ data: { full_name: fullName } });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Nombre actualizado.");
  };

  const updateEmail = async () => {
    if (!newEmail || newEmail === email) return;
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ email: newEmail });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Te enviamos un correo para confirmar el cambio.");
  };

  const updatePassword = async () => {
    if (!newPassword || newPassword.length < 6) {
      return toast.error("La contraseña debe tener al menos 6 caracteres.");
    }
    if (newPassword !== confirmPassword) {
      return toast.error("Las contraseñas no coinciden.");
    }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setLoading(false);
    if (error) return toast.error(error.message);
    setNewPassword("");
    setConfirmPassword("");
    toast.success("Contraseña actualizada.");
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/login" });
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Mi cuenta</h1>
        <p className="text-sm text-muted-foreground">
          Administra tus datos de acceso personales.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Información</CardTitle>
          <CardDescription>Datos básicos de tu sesión.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-muted-foreground">Email actual</span>
            <span className="break-all text-right">{email}</span>
          </div>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-muted-foreground">Roles</span>
            <span className="flex flex-wrap justify-end gap-1">
              {roles.length === 0 ? (
                <span className="text-muted-foreground">—</span>
              ) : (
                roles.map((r) => (
                  <Badge key={r} variant="secondary" className="capitalize">
                    {r}
                  </Badge>
                ))
              )}
            </span>
          </div>
          {createdAt && (
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-muted-foreground">Creado</span>
              <span>{new Date(createdAt).toLocaleDateString()}</span>
            </div>
          )}
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-muted-foreground">User ID</span>
            <span className="font-mono text-xs break-all text-right">{userId}</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Nombre</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Label htmlFor="fullName">Nombre completo</Label>
          <Input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} />
          <Button onClick={updateName} disabled={loading}>
            Guardar nombre
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Cambiar email</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Label htmlFor="email">Nuevo email</Label>
          <Input
            id="email"
            type="email"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
          />
          <Button onClick={updateEmail} disabled={loading}>
            Actualizar email
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Cambiar contraseña</CardTitle>
          <CardDescription>Solo tú puedes cambiar tu propia contraseña aquí.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Label htmlFor="password">Nueva contraseña</Label>
          <Input
            id="password"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="Mínimo 6 caracteres"
          />
          <Label htmlFor="password2">Confirmar contraseña</Label>
          <Input
            id="password2"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
          <Button onClick={updatePassword} disabled={loading}>
            Actualizar contraseña
          </Button>
        </CardContent>
      </Card>

      {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle>Administración</CardTitle>
            <CardDescription>
              Como administrador puedes gestionar usuarios, roles y sus contraseñas.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link to="/admin/administracion">Usuarios y permisos</Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/admin/usuarios">Roles de usuarios</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Sesión</CardTitle>
        </CardHeader>
        <CardContent>
          <Button variant="destructive" onClick={signOut}>
            Cerrar sesión
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
