import type { Context } from "hono";
import type { Bucket } from "@google-cloud/storage";
import { getAdminClient } from "../../../services/supabase.js";

export interface DeleteDeps {
  bucket: Bucket;
}

export async function deleteDocument(
  c: Context,
  deps: DeleteDeps,
): Promise<Response> {
  const { bucket } = deps;
  const { id } = await c.req.json();

  // Se exige `id` y el gcs_path se DERIVA de la DB. Nunca se confía en un gcs_path
  // enviado por el cliente: sin esto, {gcs_path:"cualquier/objeto"} borraría objetos
  // arbitrarios del bucket. Un objeto se comparte entre varias filas (una por placa),
  // así que borramos el objeto una vez y todas las filas que apuntan a ese path.
  if (!id) {
    return c.json({ error: "id requerido" }, 400);
  }

  const supabase = getAdminClient();

  const { data: row, error: selError } = await supabase
    .from("documentos")
    .select("gcs_path")
    .eq("id", id)
    .maybeSingle();
  if (selError) throw new Error(`DB query error: ${selError.message}`);
  if (!row) {
    return c.json({ error: "documento no encontrado" }, 404);
  }

  const canonicalPath = (row as { gcs_path: string | null }).gcs_path;

  if (canonicalPath) {
    try {
      await bucket.file(canonicalPath).delete();
    } catch {
      // el objeto ya no existe en el bucket: seguimos con el borrado en DB
    }
    const { error } = await supabase
      .from("documentos")
      .delete()
      .eq("gcs_path", canonicalPath);
    if (error) throw new Error(`DB delete error: ${error.message}`);
  } else {
    const { error } = await supabase.from("documentos").delete().eq("id", id);
    if (error) throw new Error(`DB delete error: ${error.message}`);
  }

  return c.json({ success: true });
}
