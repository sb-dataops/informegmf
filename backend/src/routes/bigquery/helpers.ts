import { runQuery } from "../../services/bigquery.js";
import { getAdminClient } from "../../services/supabase.js";
import { TABLES, COMITENTE_FILTER, ESTADO_ALLOWED_FILTER } from "../../lib/sql-constants.js";
import { normalizePlaca } from "../../lib/text-helpers.js";
import { renderQuery } from "./render-query.js";

export interface PendienteFiltroRow {
  placa: string;
  subasta: string;
  comprador: string | null;
  descripcion: string | null;
  tramitador: string | null;
  lote: string | null;
  estadoRelatorio: string | null;
}

export type PendingPaymentReviewEntry = {
  placa: string;
  latestDocumentAt: string;
  documentCount: number;
};

export type PendingPaymentRow = {
  subasta: string | null;
  placa: string;
  comprador: string | null;
  documento: string | null;
  descripcion: string | null;
  estado: string | null;
  lote: string | null;
};

export async function getPendientesFiltros(): Promise<PendienteFiltroRow[]> {
  const sql = renderQuery("stats/pendientes-filtros.sql", {
    TABLES_consolidadoChan: TABLES.consolidadoChan,
  });

  const rows = await runQuery(sql);
  return rows
    .map((r) => ({
      placa: (r.placa || "").trim(),
      subasta: (r.subasta || "").trim(),
      comprador: r.comprador || null,
      descripcion: r.descripcion || null,
      tramitador: r.tramitador || null,
      lote: r.lote || null,
      estadoRelatorio: r.estadoRelatorio || null,
    }))
    .filter((r) => r.placa !== "");
}

export async function getPendingPaymentReviewEntries(): Promise<PendingPaymentReviewEntry[]> {
  const supabase = getAdminClient();

  const [{ data: documentos, error: documentosError }, { data: reviewRows, error: reviewError }] = await Promise.all([
    supabase
      .from("documentos")
      .select("placa, created_at")
      .not("placa", "is", null)
      .order("created_at", { ascending: false })
      .range(0, 4999),
    supabase
      .from("payment_review_status")
      .select("placa, last_reviewed_at")
      .range(0, 4999),
  ]);

  if (documentosError) {
    throw new Error(`Error reading documentos: ${documentosError.message}`);
  }

  if (reviewError) {
    throw new Error(`Error reading payment review status: ${reviewError.message}`);
  }

  const latestByPlaca = new Map<string, { latestDocumentAt: string; documentCount: number }>();

  for (const documento of documentos || []) {
    const placa = normalizePlaca(documento.placa);
    if (!placa || !documento.created_at) continue;

    const existing = latestByPlaca.get(placa);
    if (!existing) {
      latestByPlaca.set(placa, {
        latestDocumentAt: documento.created_at,
        documentCount: 1,
      });
      continue;
    }

    latestByPlaca.set(placa, {
      latestDocumentAt: new Date(documento.created_at).getTime() > new Date(existing.latestDocumentAt).getTime()
        ? documento.created_at
        : existing.latestDocumentAt,
      documentCount: existing.documentCount + 1,
    });
  }

  const reviewedAtByPlaca = new Map<string, string>();
  for (const reviewRow of reviewRows || []) {
    const placa = normalizePlaca(reviewRow.placa);
    if (!placa || !reviewRow.last_reviewed_at) continue;
    reviewedAtByPlaca.set(placa, reviewRow.last_reviewed_at);
  }

  return Array.from(latestByPlaca.entries())
    .filter(([placa, entry]) => {
      const reviewedAt = reviewedAtByPlaca.get(placa);
      if (!reviewedAt) return true;
      return new Date(entry.latestDocumentAt).getTime() > new Date(reviewedAt).getTime();
    })
    .map(([placa, entry]) => ({
      placa,
      latestDocumentAt: entry.latestDocumentAt,
      documentCount: entry.documentCount,
    }))
    .sort((a, b) => new Date(b.latestDocumentAt).getTime() - new Date(a.latestDocumentAt).getTime());
}

export async function getPendingPaymentRows(): Promise<PendingPaymentRow[]> {
  const sql = renderQuery("helpers/pending-payment-rows.sql", {
    TABLES_relatorio: TABLES.relatorio,
    TABLES_retiros: TABLES.retiros,
    ESTADO_ALLOWED_FILTER,
    COMITENTE_FILTER,
  });

  const rows = await runQuery(sql);
  return rows
    .map((row) => ({
      subasta: row.subasta || null,
      placa: normalizePlaca(row.placa) || "",
      comprador: row.comprador || null,
      documento: row.documento || null,
      descripcion: row.descripcion || null,
      estado: row.estado || null,
      lote: row.lote || null,
    }))
    .filter((row) => Boolean(row.placa));
}
