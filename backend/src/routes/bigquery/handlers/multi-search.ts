import type { Context } from "hono";
import { runQuery } from "../../../services/bigquery.js";
import { TABLES, COMITENTE_FILTER, ESTADO_ALLOWED_FILTER } from "../../../lib/sql-constants.js";
import { sanitize, normalizePlaca } from "../../../lib/text-helpers.js";
import { renderQuery } from "../render-query.js";
import { buildPazSalvoDateExpr, buildWhereConditions, type MultiSearchFilters } from "./multi-search-conditions.js";

// ── MULTI-FILTER SEARCH: combined AND search ──
export async function handleMultiSearch(c: Context) {
  const filters: MultiSearchFilters = {
    subasta: sanitize(c.req.query("subasta") || ""),
    comprador: sanitize(c.req.query("comprador") || ""),
    documento: sanitize(c.req.query("documento") || ""),
    placa: sanitize(c.req.query("placa") || ""),
    fechaSubastaDesde: sanitize(c.req.query("fechaSubastaDesde") || ""),
    fechaSubastaHasta: sanitize(c.req.query("fechaSubastaHasta") || ""),
    fechaPazSalvoDesde: sanitize(c.req.query("fechaPazSalvoDesde") || ""),
    fechaPazSalvoHasta: sanitize(c.req.query("fechaPazSalvoHasta") || ""),
  };
  const { subasta, comprador, documento, placa, fechaSubastaDesde, fechaSubastaHasta, fechaPazSalvoDesde, fechaPazSalvoHasta } = filters;

  if (!subasta && !comprador && !documento && !placa && !fechaSubastaDesde && !fechaSubastaHasta && !fechaPazSalvoDesde && !fechaPazSalvoHasta) {
    return c.json({ error: "Al menos un filtro es requerido" }, 400);
  }

  // When the user filters ONLY by fecha paz y salvo (no other relatorio-side filter),
  // we must skip the initial relatorio query — otherwise it would return up to 1000 rows
  // unfiltered (every comprador). The placas-fallback below will then pull only the
  // relatorio rows whose placa appears in retiros/servitram/gestramites for that date range.
  const hasRelatorioSideFilter = !!(subasta || comprador || documento || placa || fechaSubastaDesde || fechaSubastaHasta);
  const onlyPazSalvoFilter = !hasRelatorioSideFilter && !!(fechaPazSalvoDesde || fechaPazSalvoHasta);
  const hasPazSalvoFilter = !!(fechaPazSalvoDesde || fechaPazSalvoHasta);

  const relatorioSQL = renderQuery("multi-search/relatorio.sql", {
    TABLES_relatorio: TABLES.relatorio,
    COMITENTE_FILTER,
    ESTADO_ALLOWED_FILTER,
    whereConditions: buildWhereConditions(filters, "", "relatorio"),
  });

  const retirosSQL = renderQuery("multi-search/retiros.sql", {
    TABLES_retiros: TABLES.retiros,
    pazSalvoDateExpr: buildPazSalvoDateExpr(),
    whereConditions: buildWhereConditions(filters, "", "retiros"),
  });

  const servitramSQL = renderQuery("multi-search/servitram.sql", {
    TABLES_servitram: TABLES.servitram,
    whereConditions: buildWhereConditions(filters, "", "servitram"),
  });

  const gestramitesSQL = renderQuery("multi-search/gestramites.sql", {
    TABLES_gestramites: TABLES.gestramites,
    whereConditions: buildWhereConditions(filters, "", "gestramites"),
  });

  const safeQuery = async (sql: string) => {
    try { return await runQuery(sql); }
    catch (e) { console.warn("Query failed:", e); return []; }
  };

  let [relatorio, retiros, servitram, gestramites] = await Promise.all([
    // Skip the unfiltered relatorio query when only paz-y-salvo is set; the placas fallback
    // below will pull only the relatorio rows whose placa matches the paz y salvo date range.
    onlyPazSalvoFilter ? Promise.resolve([] as Record<string, string | null>[]) : safeQuery(relatorioSQL),
    safeQuery(retirosSQL),
    safeQuery(servitramSQL),
    safeQuery(gestramitesSQL),
  ]);

  if (relatorio.length === 0 || hasPazSalvoFilter) {
    const placasFallback = Array.from(new Set([
      ...(hasPazSalvoFilter ? [] : servitram.map((row) => normalizePlaca(row.placa)).filter(Boolean)),
      ...(hasPazSalvoFilter ? [] : gestramites.map((row) => normalizePlaca(row.placa)).filter(Boolean)),
      ...retiros.map((row) => normalizePlaca(row.placa)).filter(Boolean),
    ]));

    if (placasFallback.length > 0) {
      const placasList = placasFallback.map((p) => `'${p}'`).join(", ");
      const relatorioByPlacasSQL = renderQuery("multi-search/relatorio-by-placas.sql", {
        TABLES_relatorio: TABLES.relatorio,
        COMITENTE_FILTER,
        ESTADO_ALLOWED_FILTER,
        placasList,
      });
      relatorio = await safeQuery(relatorioByPlacasSQL);
      if (hasPazSalvoFilter) {
        // Restrict servitram/gestramites to the placas matched in retiros (paz y salvo source).
        servitram = servitram.filter((row) => {
          const rowPlaca = normalizePlaca(row.placa);
          return !!rowPlaca && placasFallback.includes(rowPlaca);
        });
        gestramites = gestramites.filter((row) => {
          const rowPlaca = normalizePlaca(row.placa);
          return !!rowPlaca && placasFallback.includes(rowPlaca);
        });
      } else {
        retiros = retiros.filter((row) => {
          const rowPlaca = normalizePlaca(row.placa);
          return !!rowPlaca && placasFallback.includes(rowPlaca);
        });
      }
    } else if (hasPazSalvoFilter) {
      relatorio = [];
      servitram = [];
      gestramites = [];
    }
  }

  return c.json({ relatorio, retiros, servitram, gestramites });
}
