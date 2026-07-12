import type { Context } from "hono";
import type { Bucket } from "@google-cloud/storage";

// Límite de tamaño de soporte (los soportes de pago son PDFs/imágenes chicos).
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024; // 20 MB

// Tipos que se pueden renderizar inline sin ejecutar script. Cualquier otro se
// sirve como attachment (descarga), neutralizando XSS almacenado en el origen de la API.
export const INLINE_SAFE_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
]);

// Tipos que pueden ejecutar script si el navegador los renderiza — se rechazan en upload.
export const BLOCKED_UPLOAD_TYPES = new Set([
  "text/html",
  "application/xhtml+xml",
  "image/svg+xml",
  "application/javascript",
  "text/javascript",
]);

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
