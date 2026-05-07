import type { Context } from "hono";
import { runQuery } from "../../../services/bigquery.js";
import { TABLES, COMITENTE_FILTER, ESTADO_ALLOWED_FILTER } from "../../../lib/sql-constants.js";
import { sanitize, normalizeSearchText, normalizePlaca } from "../../../lib/text-helpers.js";
import { renderQuery } from "../render-query.js";

// ── SEARCH by documento, comprador name, placa, or subasta ──
export async function handleSearch(c: Context) {
  const q = sanitize(c.req.query("q") || "");
  const qUpper = q.toUpperCase();
  const qNormalized = normalizeSearchText(q);
  if (!q) {
    return c.json({ error: "Parámetro 'q' requerido" }, 400);
  }

  const normalizedContains = (fieldSql: string) => `REGEXP_REPLACE(NORMALIZE_AND_CASEFOLD(IFNULL(CAST(${fieldSql} AS STRING),''), NFD), r'[^a-z0-9]', '') LIKE '%${qNormalized.toLowerCase()}%'`;
  const normalizedPlacaEquals = (fieldSql: string) => `REGEXP_REPLACE(UPPER(IFNULL(CAST(${fieldSql} AS STRING), '')), r'[^A-Z0-9]', '') = '${qNormalized}'`;

  // 1) Search relatorio_actual (main sales data)
  const relatorioSQL = renderQuery("search/relatorio.sql", {
    TABLES_relatorio: TABLES.relatorio,
    COMITENTE_FILTER,
    ESTADO_ALLOWED_FILTER,
    placa_eq: normalizedPlacaEquals("placa"),
    desc_contains: normalizedContains("descripcion"),
    subasta_contains: normalizedContains("subasta"),
    qUpper,
  });

  // 2) Search retiros (process tracking)
  const retirosSQL = renderQuery("search/retiros.sql", {
    TABLES_retiros: TABLES.retiros,
    placa_eq: normalizedPlacaEquals("placa"),
    subasta_contains: normalizedContains("CAST(subasta AS STRING)"),
    qUpper,
  });

  // 3) Search tramitadores servitram
  const servitramSQL = renderQuery("search/servitram.sql", {
    TABLES_servitram: TABLES.servitram,
    placa_eq: normalizedPlacaEquals("placa"),
    subasta_contains: normalizedContains("subasta"),
    qUpper,
  });

  // 4) Search tramitadores gestramites
  const gestramitesSQL = renderQuery("search/gestramites.sql", {
    TABLES_gestramites: TABLES.gestramites,
    placa_eq: normalizedPlacaEquals("placa"),
    subasta_contains: normalizedContains("subasta"),
    qUpper,
  });

  // Run all 4 queries in parallel with fault tolerance
  const safeQuery = async (sql: string) => {
    try { return await runQuery(sql); }
    catch (e) { console.warn("Query failed:", e); return []; }
  };

  let [relatorio, retiros, servitram, gestramites] = await Promise.all([
    safeQuery(relatorioSQL),
    safeQuery(retirosSQL),
    safeQuery(servitramSQL),
    safeQuery(gestramitesSQL),
  ]);

  if (relatorio.length === 0) {
    const placasFallback = Array.from(new Set([
      ...servitram.map((row) => normalizePlaca(row.placa)).filter(Boolean),
      ...gestramites.map((row) => normalizePlaca(row.placa)).filter(Boolean),
      ...retiros.map((row) => normalizePlaca(row.placa)).filter(Boolean),
    ]));

    if (placasFallback.length > 0) {
      const placasList = placasFallback.map((placa) => `'${placa}'`).join(", ");
      const relatorioByPlacasSQL = renderQuery("search/relatorio-by-placas.sql", {
        TABLES_relatorio: TABLES.relatorio,
        COMITENTE_FILTER,
        ESTADO_ALLOWED_FILTER,
        placasList,
      });

      relatorio = await safeQuery(relatorioByPlacasSQL);
    }
  }

  return c.json({ relatorio, retiros, servitram, gestramites });
}
