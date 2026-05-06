import { createMiddleware } from "hono/factory";
import { jwtVerify } from "jose";
import { config } from "../config.js";

let cachedSecret: Uint8Array | null = null;
function getSecret(): Uint8Array {
  if (!cachedSecret) {
    cachedSecret = new TextEncoder().encode(config.supabaseJwtSecret);
  }
  return cachedSecret;
}

export type AuthUser = {
  id: string;
  email?: string;
  role: string;
};

export const authMiddleware = createMiddleware<{
  Variables: { user: AuthUser };
}>(async (c, next) => {
  const auth = c.req.header("Authorization") ?? "";
  const match = auth.match(/^Bearer (.+)$/);
  if (!match) {
    return c.json({ error: "Missing Authorization Bearer token" }, 401);
  }

  try {
    const { payload } = await jwtVerify(match[1], getSecret());
    if (payload.role === "anon") {
      return c.json({ error: "Authenticated user required" }, 401);
    }
    if (!payload.sub) {
      return c.json({ error: "Token missing sub claim" }, 401);
    }
    c.set("user", {
      id: payload.sub,
      email: typeof payload.email === "string" ? payload.email : undefined,
      role: typeof payload.role === "string" ? payload.role : "authenticated",
    });
    await next();
  } catch {
    return c.json({ error: "Invalid or expired token" }, 401);
  }
});
