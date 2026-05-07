import type { Context } from "hono";
import { runQuery } from "../../../../services/bigquery.js";
import { getAdminClient } from "../../../../services/supabase.js";
import { TABLES, COMITENTE_FILTER, ESTADO_ALLOWED_FILTER } from "../../../../lib/sql-constants.js";
import { sanitize, normalizePlaca } from "../../../../lib/text-helpers.js";
import { renderQuery } from "../../render-query.js";
import { getPendingPaymentReviewEntries, getPendingPaymentRows } from "../../helpers.js";

export async function handlePagosPendientesRevision(c: Context, category: string) {
  const [pendingPaymentReviewEntries, pendingPaymentRows] = await Promise.all([
    getPendingPaymentReviewEntries(),
    getPendingPaymentRows(),
  ]);

  if (pendingPaymentReviewEntries.length === 0 && pendingPaymentRows.length === 0) {
    return c.json({ category, rows: [], count: 0 });
  }

  const reviewByPlaca = new Map(
    pendingPaymentReviewEntries.map((entry) => [entry.placa, entry]),
  );
  const paymentByPlaca = new Map(
    pendingPaymentRows.map((row) => [row.placa, row]),
  );

  const placaList = Array.from(new Set([
    ...pendingPaymentReviewEntries.map((entry) => entry.placa),
    ...pendingPaymentRows.map((row) => row.placa),
  ]))
    .map((entry) => normalizePlaca(entry))
    .filter((entry): entry is string => Boolean(entry))
    .map((entry) => `'${sanitize(entry)}'`);

  const supabase = getAdminClient();
  const [metadataRows, consolidadoRows, { data: pagosData }] = await Promise.all([
    placaList.length > 0
      ? runQuery(renderQuery("filter/pagos-revision-metadata.sql", {
          TABLES_relatorio: TABLES.relatorio,
          ESTADO_ALLOWED_FILTER,
          COMITENTE_FILTER,
          placaList: placaList.join(","),
        }))
      : Promise.resolve([]),
    placaList.length > 0
      ? runQuery(renderQuery("filter/pagos-revision-consolidado.sql", {
          TABLES_consolidadoChan: TABLES.consolidadoChan,
          placaList: placaList.join(","),
        }))
      : Promise.resolve([]),
    supabase.from("pagos").select("placa, observacion_pago").range(0, 4999),
  ]);

  const metadataByPlaca = new Map(
    metadataRows.map((row) => [normalizePlaca(row.placa) || "", row]),
  );
  const consolidadoByPlaca = new Map(
    consolidadoRows.map((row) => [normalizePlaca(row.placa) || "", row]),
  );
  const observacionByPlaca = new Map<string, string>();
  for (const p of pagosData || []) {
    if (p.placa && p.observacion_pago) {
      observacionByPlaca.set(p.placa.toUpperCase(), p.observacion_pago);
    }
  }

  const rows = Array.from(new Set([...reviewByPlaca.keys(), ...paymentByPlaca.keys()]))
    .map((placa) => {
      const reviewEntry = reviewByPlaca.get(placa);
      const paymentEntry = paymentByPlaca.get(placa);
      const metadata = metadataByPlaca.get(placa);
      const consolidado = consolidadoByPlaca.get(placa);
      const hasPendingReview = Boolean(reviewEntry);
      const hasPendingPayment = Boolean(paymentEntry);

      return {
        subasta: paymentEntry?.subasta || metadata?.subasta || "Sin subasta",
        placa,
        comprador: paymentEntry?.comprador || metadata?.comprador || null,
        documento: paymentEntry?.documento || metadata?.documento || null,
        descripcion: paymentEntry?.descripcion || metadata?.descripcion || null,
        estado: paymentEntry?.estado || metadata?.estado || "Pendiente por revisar",
        lote: paymentEntry?.lote || metadata?.lote || null,
        cantidadSoportes: reviewEntry?.documentCount || null,
        ultimoSoporteAt: reviewEntry?.latestDocumentAt || null,
        fechaAprobacionFiltros: consolidado?.fechaAprobacionFiltros || null,
        observacionPago: observacionByPlaca.get(placa) || null,
        hasPendingReview,
        hasPendingPayment,
        reviewPriority: hasPendingReview ? 0 : 1,
      };
    })
    .sort((a, b) => {
      if ((a.reviewPriority || 0) !== (b.reviewPriority || 0)) {
        return (a.reviewPriority || 0) - (b.reviewPriority || 0);
      }

      const subastaCompare = (a.subasta || "Sin subasta").localeCompare(b.subasta || "Sin subasta");
      if (subastaCompare !== 0) return subastaCompare;

      const latestA = a.ultimoSoporteAt ? new Date(a.ultimoSoporteAt).getTime() : 0;
      const latestB = b.ultimoSoporteAt ? new Date(b.ultimoSoporteAt).getTime() : 0;
      if (latestA !== latestB) return latestB - latestA;

      return a.placa.localeCompare(b.placa);
    });

  return c.json({ category, rows, count: rows.length });
}
