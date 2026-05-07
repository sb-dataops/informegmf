import type { Context } from "hono";
import { runQuery } from "../../../services/bigquery.js";
import { TABLES, COMITENTE_FILTER, ESTADO_ALLOWED_FILTER } from "../../../lib/sql-constants.js";
import { renderQuery } from "../render-query.js";
import {
  DASHBOARD_STATS_TTL_MS,
  getDashboardStatsCache,
  setDashboardStatsCache,
} from "../caches.js";
import {
  getPendientesFiltros,
  getPendingPaymentReviewEntries,
  getPendingPaymentRows,
} from "../helpers.js";
import type {
  PendingPaymentReviewEntry,
  PendingPaymentRow,
} from "../helpers.js";

// ── STATS for dashboard ──
export async function handleStats(c: Context) {
  const cached = getDashboardStatsCache();
  if (cached && cached.expiresAt > Date.now()) {
    c.header("Cache-Control", "public, max-age=30, s-maxage=120");
    return c.json({ stats: cached.stats, cached: true });
  }

  const statsSQL = renderQuery("stats/full.sql", {
    TABLES_relatorio: TABLES.relatorio,
    TABLES_retiros: TABLES.retiros,
    ESTADO_ALLOWED_FILTER,
    COMITENTE_FILTER,
  });

  let stats = {
    total: '0',
    aprobados: '0',
    en_proceso: '0',
    pendientes: '0',
    pendientes_pago: '0',
    pendientes_traspaso: '0',
    pendientes_retiro: '0',
    pendientes_filtros: '0',
    pagos_pendientes_revision: '0',
    soportes_pendientes_revision: '0',
  };

  try {
    const [result, pendingPaymentReviewEntries, pendingPaymentRows, pendientesFiltrosRows] = await Promise.all([
      runQuery(statsSQL),
      getPendingPaymentReviewEntries().catch((error) => {
        console.error(`[payment-review-stats] FAILED:`, error instanceof Error ? error.message : error);
        return [] as PendingPaymentReviewEntry[];
      }),
      getPendingPaymentRows().catch((error) => {
        console.error(`[pending-payment-stats] FAILED:`, error instanceof Error ? error.message : error);
        return [] as PendingPaymentRow[];
      }),
      getPendientesFiltros().catch((error) => {
        console.error(`[pendientes-filtros] FAILED:`, error instanceof Error ? error.message : error);
        return [] as { placa: string; subasta: string }[];
      }),
    ]);

    console.log(`[stats] pendientes_filtros from BQ: ${pendientesFiltrosRows.length}, placas: ${JSON.stringify(pendientesFiltrosRows.map(r => r.placa))}`);
    console.log(`[stats] result:`, JSON.stringify(result));

    const combinedPendingPlacas = new Set([
      ...pendingPaymentReviewEntries.map((entry) => entry.placa),
      ...pendingPaymentRows.map((row) => row.placa),
    ]);

    stats = {
      total: result[0]?.total || '0',
      aprobados: result[0]?.aprobados || '0',
      en_proceso: result[0]?.en_proceso || '0',
      pendientes: result[0]?.pendientes || '0',
      pendientes_pago: result[0]?.pendientes_pago || '0',
      pendientes_traspaso: result[0]?.pendientes_traspaso || '0',
      pendientes_retiro: result[0]?.pendientes_retiro || '0',
      pendientes_filtros: String(pendientesFiltrosRows.length),
      pagos_pendientes_revision: String(combinedPendingPlacas.size),
      soportes_pendientes_revision: String(pendingPaymentReviewEntries.length),
    };
  } catch (e) {
    console.error(`[stats] FAILED:`, e instanceof Error ? e.message : e);
  }

  setDashboardStatsCache({
    stats,
    expiresAt: Date.now() + DASHBOARD_STATS_TTL_MS,
  });

  c.header("Cache-Control", "public, max-age=30, s-maxage=120");
  return c.json({ stats });
}
