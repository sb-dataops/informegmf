import type { Context } from "hono";
import { getAdminClient } from "../../../services/supabase.js";

export interface SignedUrlDeps {
  bucketName: string;
}

// NOTE: el nombre 'signed-url' es legado; en realidad devuelve la URL pública
// directa del bucket (no firmada). Se preserva el comportamiento original.
export async function signedUrl(
  c: Context,
  deps: SignedUrlDeps,
): Promise<Response> {
  const { bucketName } = deps;
  const gcsPath = c.req.query("path");
  if (!gcsPath) {
    return c.json({ error: "path requerido" }, 400);
  }

  // Solo emitir URLs para objetos que existen en la tabla documentos (no arbitrarios).
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

  const publicUrl = `https://storage.googleapis.com/${bucketName}/${gcsPath}`;
  return c.json({ url: publicUrl });
}
