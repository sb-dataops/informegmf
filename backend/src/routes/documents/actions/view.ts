import type { Context } from "hono";
import type { Bucket } from "@google-cloud/storage";
import { getAdminClient } from "../../../services/supabase.js";

export interface ViewDeps {
  bucket: Bucket;
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
    .select("id")
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

  return new Response(buffer, {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": "inline",
      "Cache-Control": "private, max-age=300",
    },
  });
}
