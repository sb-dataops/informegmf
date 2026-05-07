import type { Context } from "hono";
import { runQuery } from "../../../services/bigquery.js";
import { TABLES, COMITENTE_FILTER, ESTADO_ALLOWED_FILTER } from "../../../lib/sql-constants.js";
import { renderQuery } from "../render-query.js";

export async function handleStatsRetiros(c: Context) {
  const statsSQL = renderQuery("stats/retiros.sql", {
    TABLES_relatorio: TABLES.relatorio,
    TABLES_retiros: TABLES.retiros,
    ESTADO_ALLOWED_FILTER,
    COMITENTE_FILTER,
  });

  try {
    const result = await runQuery(statsSQL);
    c.header("Cache-Control", "public, max-age=15");
    return c.json({
      pendientes_traspaso: result[0]?.pendientes_traspaso || '0',
      pendientes_retiro: result[0]?.pendientes_retiro || '0',
      vehiculos_entregados: result[0]?.vehiculos_entregados || '0',
    });
  } catch (e) {
    console.error("[stats_retiros] FAILED:", e);
    return c.json({ pendientes_traspaso: '0', pendientes_retiro: '0', vehiculos_entregados: '0' });
  }
}
