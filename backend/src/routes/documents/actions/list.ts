import type { Context } from "hono";
import { getAdminClient } from "../../../services/supabase.js";

export async function listDocuments(c: Context): Promise<Response> {
  const documentoComprador = c.req.query("documento_comprador");
  const placaParam = c.req.query("placa")?.trim().toUpperCase();

  const supabase = getAdminClient();

  let query = supabase
    .from("documentos")
    .select("*")
    .order("created_at", { ascending: false });
  if (documentoComprador) query = query.eq("documento_comprador", documentoComprador);
  if (placaParam) query = query.contains("placas", [placaParam]);

  const { data, error } = await query;
  if (error) throw new Error(`DB query error: ${error.message}`);

  return c.json({ documentos: data });
}
