import type { Context } from "hono";
import { runQuery } from "../../../../services/bigquery.js";
import { getAdminClient } from "../../../../services/supabase.js";
import { TABLES, COMITENTE_FILTER, ESTADO_ALLOWED_FILTER } from "../../../../lib/sql-constants.js";
import { renderQuery } from "../../render-query.js";
import { FILTER_RESULT_TTL_MS, filterResultsCache } from "../../caches.js";
import { EXCLUDED_ESTADOS_RETIROS } from "./common.js";

export async function handlePendientesPago(c: Context, category: string, canUseFilterCache: boolean) {
  const pagoSQL = renderQuery("filter/pendientes-pago.sql", {
    TABLES_relatorio: TABLES.relatorio,
    TABLES_retiros: TABLES.retiros,
    TABLES_consolidadoChan: TABLES.consolidadoChan,
    ESTADO_ALLOWED_FILTER,
    COMITENTE_FILTER,
    EXCLUDED_ESTADOS_RETIROS,
  });

  const supabase = getAdminClient();
  const [bqRows, { data: pagosData }] = await Promise.all([
    runQuery(pagoSQL),
    supabase.from("pagos").select("placa, observacion_pago").range(0, 4999),
  ]);

  const observacionByPlaca = new Map<string, string>();
  for (const p of pagosData || []) {
    if (p.placa && p.observacion_pago) {
      observacionByPlaca.set(p.placa.toUpperCase(), p.observacion_pago);
    }
  }

  const rows = bqRows.map((row) => {
    const placa = (row.placa || "").toUpperCase().trim();
    return {
      subasta: row.subasta || null,
      placa,
      comprador: row.comprador || null,
      documento: row.documento || null,
      descripcion: null,
      lote: row.lote || null,
      fechaAprobacionFiltros: row.fechaAprobacionFiltros || null,
      observacionPago: observacionByPlaca.get(placa) || null,
    };
  });

  const payload = JSON.stringify({ category, rows, count: rows.length });
  if (canUseFilterCache) {
    filterResultsCache.set(category, { payload, expiresAt: Date.now() + FILTER_RESULT_TTL_MS });
  }
  c.header("Cache-Control", "public, max-age=30, s-maxage=120");
  c.header("Content-Type", "application/json");
  return c.body(payload);
}
