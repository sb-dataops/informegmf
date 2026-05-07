import { createMiddleware } from "hono/factory";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { config } from "../config.js";

// Supabase emits user JWTs signed with ES256 (asymmetric), and exposes the
// public key at /auth/v1/.well-known/jwks.json. We use that JWKS to verify
// instead of the legacy HS256 shared secret. createRemoteJWKSet caches the
// JWKS for 5 min and re-fetches on unknown kid.
let cachedJWKS: ReturnType<typeof createRemoteJWKSet> | null = null;
function getJWKS() {
  if (!cachedJWKS) {
    cachedJWKS = createRemoteJWKSet(
      new URL(`${config.supabaseUrl}/auth/v1/.well-known/jwks.json`),
    );
  }
  return cachedJWKS;
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
    const { payload } = await jwtVerify(match[1], getJWKS(), {
      issuer: `${config.supabaseUrl}/auth/v1`,
    });
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
