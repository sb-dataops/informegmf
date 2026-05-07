import type { Context } from "hono";
import { runQuery } from "../../../../services/bigquery.js";
import { getAdminClient } from "../../../../services/supabase.js";
import { TABLES, COMITENTE_FILTER, ESTADO_ALLOWED_FILTER } from "../../../../lib/sql-constants.js";
import { sanitize, normalizePlaca } from "../../../../lib/text-helpers.js";
import { renderQuery } from "../../render-query.js";
import { getPendingPaymentReviewEntries } from "../../helpers.js";

export async function handleSoportesPendientesRevision(c: Context, category: string) {
  const pendingPaymentReviewEntries = await getPendingPaymentReviewEntries();

  if (pendingPaymentReviewEntries.length === 0) {
    return c.json({ category, rows: [], count: 0 });
  }

  const reviewByPlaca = new Map(
    pendingPaymentReviewEntries.map((entry) => [entry.placa, entry]),
  );

  const placaList = pendingPaymentReviewEntries
    .map((entry) => normalizePlaca(entry.placa))
    .filter((p): p is string => Boolean(p))
    .map((p) => `'${sanitize(p)}'`);

  const supabase2 = getAdminClient();
  const [metadataRows, consolidadoRows, { data: pagosData2 }] = await Promise.all([
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
    supabase2.from("pagos").select("placa, observacion_pago").range(0, 4999),
  ]);

  const metadataByPlaca = new Map(
    metadataRows.map((row) => [normalizePlaca(row.placa) || "", row]),
  );
  const consolidadoByPlaca = new Map(
    consolidadoRows.map((row) => [normalizePlaca(row.placa) || "", row]),
  );
  const observacionByPlaca2 = new Map<string, string>();
  for (const p of pagosData2 || []) {
    if (p.placa && p.observacion_pago) {
      observacionByPlaca2.set(p.placa.toUpperCase(), p.observacion_pago);
    }
  }

  const rows = Array.from(reviewByPlaca.entries())
    .map(([placa, reviewEntry]) => {
      const metadata = metadataByPlaca.get(placa);
      const consolidado = consolidadoByPlaca.get(placa);
      return {
        subasta: metadata?.subasta || "Sin subasta",
        placa,
        comprador: metadata?.comprador || null,
        documento: metadata?.documento || null,
        descripcion: metadata?.descripcion || null,
        estado: metadata?.estado || "Pendiente por revisar",
        lote: metadata?.lote || null,
        cantidadSoportes: reviewEntry.documentCount || null,
        ultimoSoporteAt: reviewEntry.latestDocumentAt || null,
        fechaAprobacionFiltros: consolidado?.fechaAprobacionFiltros || null,
        observacionPago: observacionByPlaca2.get(placa) || null,
        hasPendingReview: true,
        hasPendingPayment: false,
        reviewPriority: 0,
      };
    })
    .sort((a, b) => {
      const subastaCompare = (a.subasta || "").localeCompare(b.subasta || "");
      if (subastaCompare !== 0) return subastaCompare;
      const latestA = a.ultimoSoporteAt ? new Date(a.ultimoSoporteAt).getTime() : 0;
      const latestB = b.ultimoSoporteAt ? new Date(b.ultimoSoporteAt).getTime() : 0;
      if (latestA !== latestB) return latestB - latestA;
      return a.placa.localeCompare(b.placa);
    });

  return c.json({ category, rows, count: rows.length });
}
