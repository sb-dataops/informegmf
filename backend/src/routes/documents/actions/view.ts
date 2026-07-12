import type { Context } from "hono";
import type { Bucket } from "@google-cloud/storage";
import { getAdminClient } from "../../../services/supabase.js";
import { INLINE_SAFE_TYPES } from "../helpers.js";

export interface ViewDeps {
  bucket: Bucket;
}

// Sanitiza un nombre de archivo para el header Content-Disposition (sin comillas ni CR/LF).
function safeFilename(name: string): string {
  return name.replace(/[\r\n"\\]/g, "_").slice(0, 200) || "documento";
}

export async function viewDocument(
  c: Context,
  deps: ViewDeps,
): Promise<Response> {
  const { bucket } = deps;
  const gcsPath = c.req.query("path");
  if (!gcsPath) {
    return c.json({ error: "path requerido" }, 400);
  }

  // Atar el acceso a la tabla documentos: NUNCA servir un objeto arbitrario del
  // bucket. Sin esto, ?path=<cualquier/objeto> descargaría cualquier archivo.
  const { data: row, error } = await getAdminClient()
    .from("documentos")
    .select("id, nombre_archivo")
    .eq("gcs_path", gcsPath)
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`DB query error: ${error.message}`);
  if (!row) {
    return c.json({ error: "documento no encontrado" }, 404);
  }

  const file = bucket.file(gcsPath);
  let buffer: Buffer;
  let contentType = "application/octet-stream";
  try {
    const [downloaded] = await file.download();
    buffer = downloaded;
    const [metadata] = await file.getMetadata();
    if (
      typeof metadata.contentType === "string" &&
      metadata.contentType.length > 0
    ) {
      contentType = metadata.contentType;
    }
  } catch (err) {
    const e = err as { code?: number; message?: string };
    throw new Error(`GCS view failed (${e.code ?? "?"}): ${e.message ?? String(err)}`);
  }

  // Anti-XSS: solo se renderiza inline un conjunto seguro de tipos (PDF/imágenes).
  // Cualquier otro (p. ej. HTML/SVG subido malicioso) se fuerza a descarga con
  // X-Content-Type-Options: nosniff para que el navegador no lo ejecute en el origen del API.
  const nombre = safeFilename(
    typeof (row as { nombre_archivo?: string }).nombre_archivo === "string"
      ? (row as { nombre_archivo: string }).nombre_archivo
      : "documento",
  );
  const inline = INLINE_SAFE_TYPES.has(contentType.toLowerCase());
  const disposition = inline
    ? `inline; filename="${nombre}"`
    : `attachment; filename="${nombre}"`;

  return new Response(buffer, {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": disposition,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, max-age=300",
    },
  });
}
