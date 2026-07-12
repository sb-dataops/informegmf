import { getAdminClient } from "./supabase.js";

export type AppRole = "admin" | "editor" | "lector" | "lector_con_notificacion";

// Todos los roles de aplicación. Tener CUALQUIERA de ellos = staff autorizado a leer.
export const ALL_ROLES: AppRole[] = [
  "admin",
  "editor",
  "lector",
  "lector_con_notificacion",
];

// Roles que pueden mutar (subir/borrar soportes). Coincide con `canEdit` del frontend.
export const EDIT_ROLES: AppRole[] = ["admin", "editor"];

// Lee los roles de aplicación del usuario desde public.user_roles (fuente de verdad).
// Los roles NO viajan en el JWT de Supabase — el claim `role` del token es el rol de
// Postgres (siempre "authenticated"), no el rol de la app — así que hay que consultarlos.
// Usa el admin client (service_role); la lectura es una consulta indexada por user_id.
export async function getUserRoles(userId: string): Promise<AppRole[]> {
  const { data, error } = await getAdminClient()
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  if (error) {
    throw new Error(`No se pudieron leer los roles del usuario: ${error.message}`);
  }
  return (data ?? []).map((r) => r.role as AppRole);
}
