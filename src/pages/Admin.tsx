import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Navigate, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Plus, Trash2 } from "lucide-react";

interface Profile {
  user_id: string;
  display_name: string | null;
  email: string | null;
}

interface UserRole {
  id: string;
  user_id: string;
  role: string;
}

export default function Admin() {
  const { isAdmin, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [roles, setRoles] = useState<UserRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState("");
  const [selectedRole, setSelectedRole] = useState("");
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (!isAdmin) return;
    Promise.all([
      supabase.from("profiles").select("user_id, display_name, email"),
      supabase.from("user_roles").select("*"),
    ]).then(([profilesRes, rolesRes]) => {
      setProfiles(profilesRes.data ?? []);
      setRoles(rolesRes.data ?? []);
      setLoading(false);
    });
  }, [isAdmin]);

  if (authLoading) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="animate-spin" /></div>;
  }

  if (!isAdmin) return <Navigate to="/" replace />;

  const getUserName = (userId: string) => {
    const p = profiles.find((p) => p.user_id === userId);
    return p?.display_name || p?.email || userId.slice(0, 8);
  };

  const getUserEmail = (userId: string) => {
    return profiles.find((p) => p.user_id === userId)?.email || "";
  };

  const handleAddRole = async () => {
    if (!selectedUser || !selectedRole) return;
    setAdding(true);
    const { error } = await supabase.from("user_roles").insert({
      user_id: selectedUser,
      role: selectedRole as "admin" | "lector_con_notificacion",
    });
    if (error) {
      if (error.code === "23505") toast.error("Este usuario ya tiene ese rol");
      else toast.error(error.message);
    } else {
      toast.success("Rol asignado");
      const { data } = await supabase.from("user_roles").select("*");
      setRoles(data ?? []);
      setSelectedUser("");
      setSelectedRole("");
    }
    setAdding(false);
  };

  const handleRemoveRole = async (roleId: string) => {
    const { error } = await supabase.from("user_roles").delete().eq("id", roleId);
    if (error) toast.error(error.message);
    else {
      toast.success("Rol eliminado");
      setRoles((prev) => prev.filter((r) => r.id !== roleId));
    }
  };

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-2xl font-bold">Administración de usuarios</h1>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Asignar rol</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3 items-end">
              <div className="flex-1 min-w-[200px]">
                <Select value={selectedUser} onValueChange={setSelectedUser}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar usuario" />
                  </SelectTrigger>
                  <SelectContent>
                    {profiles.map((p) => (
                      <SelectItem key={p.user_id} value={p.user_id}>
                        {p.display_name || p.email || p.user_id.slice(0, 8)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="min-w-[200px]">
                <Select value={selectedRole} onValueChange={setSelectedRole}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar rol" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="lector_con_notificacion">Lector con notificación</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={handleAddRole} disabled={adding || !selectedUser || !selectedRole}>
                {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4 mr-1" />}
                Asignar
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Roles asignados</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center py-8"><Loader2 className="animate-spin" /></div>
            ) : roles.length === 0 ? (
              <p className="text-muted-foreground text-center py-4">No hay roles asignados</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Usuario</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Rol</TableHead>
                    <TableHead className="w-16"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {roles.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{getUserName(r.user_id)}</TableCell>
                      <TableCell className="text-muted-foreground">{getUserEmail(r.user_id)}</TableCell>
                      <TableCell>
                        <Badge variant={r.role === "admin" ? "default" : "secondary"}>
                          {r.role === "admin" ? "Admin" : "Lector con notificación"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" onClick={() => handleRemoveRole(r.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
