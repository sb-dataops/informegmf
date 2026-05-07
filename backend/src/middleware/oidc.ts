import { createMiddleware } from "hono/factory";
import { createRemoteJWKSet, jwtVerify } from "jose";

const GOOGLE_JWKS = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));

const ALLOWED_ISSUERS = ["https://accounts.google.com", "accounts.google.com"];

export type OidcUser = {
  email?: string;
  audience: string | string[];
};

// Validates an OIDC ID token signed by Google. Used to authenticate Cloud Scheduler
// (and other GCP service callers) that hit /jobs/*. The token's audience must match
// JOBS_OIDC_AUDIENCE.
//
// Local dev: when JOBS_OIDC_AUDIENCE is unset, the middleware skips validation
// entirely so curl POSTs work directly.
export const oidcMiddleware = createMiddleware<{
  Variables: { oidcUser: OidcUser };
}>(async (c, next) => {
  const expectedAudience = process.env.JOBS_OIDC_AUDIENCE;
  if (!expectedAudience) {
    await next();
    return;
  }

  const auth = c.req.header("Authorization") ?? "";
  const match = auth.match(/^Bearer (.+)$/);
  if (!match) {
    return c.json({ error: "Missing OIDC Bearer token" }, 401);
  }

  try {
    const { payload } = await jwtVerify(match[1], GOOGLE_JWKS, {
      issuer: ALLOWED_ISSUERS,
      audience: expectedAudience,
    });

    const email = typeof payload.email === "string" ? payload.email : undefined;
    const allowedEmail = process.env.JOBS_OIDC_ALLOWED_EMAIL;
    if (allowedEmail && email !== allowedEmail) {
      return c.json({ error: "OIDC token email not allowed" }, 403);
    }

    c.set("oidcUser", {
      email,
      audience: payload.aud as string | string[],
    });
    await next();
  } catch {
    return c.json({ error: "Invalid OIDC token" }, 401);
  }
});
