import type { Context } from "hono";
import type { Bucket } from "@google-cloud/storage";

// Resuelve (best-effort) el email del SA con el que GCS está autenticado.
// Devuelve null si no se puede determinar (ej. ADC sin client_email expuesto).
export async function getServiceAccountEmail(
  bucket: Bucket,
): Promise<string | null> {
  try {
    const credentials = await bucket.storage.authClient.getCredentials();
    return credentials.client_email ?? null;
  } catch {
    return null;
  }
}

// Lee 'action' del query string. Si la request es JSON y no hay query, intenta el body.
// Reproduce la lógica original de routes/documents.ts (dispatch único por action).
export async function parseAction(c: Context): Promise<string> {
  let action = c.req.query("action") || "";
  if (
    !action &&
    c.req.method !== "GET" &&
    (c.req.header("content-type") || "").includes("application/json")
  ) {
    try {
      const requestJson = await c.req.json();
      if (requestJson && typeof requestJson.action === "string") {
        action = requestJson.action;
      }
    } catch {
      // ignore
    }
  }
  return action;
}
