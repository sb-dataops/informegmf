import { createMiddleware } from "hono/factory";
import { getUserRoles, ALL_ROLES, type AppRole } from "../services/roles.js";
import type { AuthUser } from "./auth.js";

export type RoleVars = { user: AuthUser; roles: AppRole[] };

// Exige que el usuario autenticado tenga al menos uno de los roles indicados.
// DEBE montarse DESPUÉS de authMiddleware (que fija c.get("user")).
// Guarda los roles resueltos en c.set("roles", ...) para que los handlers puedan
// re-chequear permisos más finos (p. ej. mutaciones) sin volver a consultar la DB.
// Falla-cerrado: si la consulta de roles lanza, la request no procede.
export function requireRole(...allowed: AppRole[]) {
  return createMiddleware<{ Variables: RoleVars }>(async (c, next) => {
    const user = c.get("user");
    if (!user) return c.json({ error: "No autenticado" }, 401);

    const roles = await getUserRoles(user.id);
    c.set("roles", roles);

    if (!roles.some((r) => allowed.includes(r))) {
      return c.json({ error: "No autorizado: rol insuficiente" }, 403);
    }
    await next();
  });
}

// Exige un rol de staff cualquiera (lectura). Cierra el hueco de un usuario
// autenticado pero SIN rol asignado (p. ej. alguien que se auto-registró con un
// email de dominio permitido pero no está en role_seeds).
export const requireAnyRole = requireRole(...ALL_ROLES);
