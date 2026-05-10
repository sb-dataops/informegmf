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
  const { id, gcs_path } = await c.req.json();

  if (!id && !gcs_path) {
    return c.json({ error: "id o gcs_path requerido" }, 400);
  }

  if (gcs_path) {
    try {
      await bucket.file(gcs_path).delete();
    } catch {
      // matches original behavior: it does not check the response status
    }
  }

  const supabase = getAdminClient();
  const deleteQuery = gcs_path
    ? supabase.from("documentos").delete().eq("gcs_path", gcs_path)
    : supabase.from("documentos").delete().eq("id", id);

  const { error } = await deleteQuery;
  if (error) throw new Error(`DB delete error: ${error.message}`);

  return c.json({ success: true });
}
