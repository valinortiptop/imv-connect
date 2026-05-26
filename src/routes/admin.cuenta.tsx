import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/cuenta")({
  component: CuentaPage,
});

function CuentaPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [userId, setUserId] = useState("");
  const [createdAt, setCreatedAt] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const u = data.user;
      if (!u) return;
      setEmail(u.email ?? "");
      setNewEmail(u.email ?? "");
      setUserId(u.id);
      setCreatedAt(u.created_at ?? "");
    });
  }, []);

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
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setLoading(false);
    if (error) return toast.error(error.message);
    setNewPassword("");
    toast.success("Contraseña actualizada.");
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/login" });
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Ajustes de cuenta</h1>
        <p className="text-sm text-muted-foreground">
          Administra tus datos de acceso.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Información</CardTitle>
          <CardDescription>Datos básicos de tu sesión.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">User ID</span>
            <span className="font-mono text-xs">{userId}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Email actual</span>
            <span>{email}</span>
          </div>
          {createdAt && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Creado</span>
              <span>{new Date(createdAt).toLocaleDateString()}</span>
            </div>
          )}
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
          <Button onClick={updatePassword} disabled={loading}>
            Actualizar contraseña
          </Button>
        </CardContent>
      </Card>

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
