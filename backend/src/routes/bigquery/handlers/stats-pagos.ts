import type { Context } from "hono";
import { runQuery } from "../../../services/bigquery.js";
import { TABLES, COMITENTE_FILTER, ESTADO_ALLOWED_FILTER } from "../../../lib/sql-constants.js";
import { renderQuery } from "../render-query.js";
import { getPendingPaymentReviewEntries, getPendingPaymentRows } from "../helpers.js";
import type { PendingPaymentReviewEntry, PendingPaymentRow } from "../helpers.js";

// ── INDIVIDUAL STAT ACTIONS for progressive dashboard loading ──
export async function handleStatsPagos(c: Context) {
  const statsSQL = renderQuery("stats/pagos.sql", {
    TABLES_relatorio: TABLES.relatorio,
    TABLES_retiros: TABLES.retiros,
    ESTADO_ALLOWED_FILTER,
    COMITENTE_FILTER,
  });

  try {
    const [bqResult, pendingPaymentReviewEntries, pendingPaymentRows] = await Promise.all([
      runQuery(statsSQL),
      getPendingPaymentReviewEntries().catch(() => [] as PendingPaymentReviewEntry[]),
      getPendingPaymentRows().catch(() => [] as PendingPaymentRow[]),
    ]);

    const combinedPendingPlacas = new Set([
      ...pendingPaymentReviewEntries.map((e) => e.placa),
      ...pendingPaymentRows.map((r) => r.placa),
    ]);
    void combinedPendingPlacas;

    c.header("Cache-Control", "public, max-age=15");
    return c.json({
      pendientes_pago: bqResult[0]?.pendientes_pago || '0',
      soportes_pendientes_revision: String(pendingPaymentReviewEntries.length),
    });
  } catch (e) {
    console.error("[stats_pagos] FAILED:", e);
    return c.json({ pendientes_pago: '0', soportes_pendientes_revision: '0' });
  }
}
