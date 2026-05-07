import type { Context } from "hono";
import { getPendientesFiltros } from "../helpers.js";

export async function handleStatsFiltros(c: Context) {
  try {
    const rows = await getPendientesFiltros();
    c.header("Cache-Control", "public, max-age=15");
    return c.json({
      pendientes_filtros: String(rows.length),
    });
  } catch (e) {
    console.error("[stats_filtros] FAILED:", e);
    return c.json({ pendientes_filtros: '0' });
  }
}
