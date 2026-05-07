import { sanitize, normalizeSearchText } from "../../../lib/text-helpers.js";

export interface MultiSearchFilters {
  subasta: string;
  comprador: string;
  documento: string;
  placa: string;
  fechaSubastaDesde: string;
  fechaSubastaHasta: string;
  fechaPazSalvoDesde: string;
  fechaPazSalvoHasta: string;
}

export function buildPazSalvoDateExpr(prefix: string = ""): string {
  const p = prefix ? `${prefix}.` : "";
  const raw = `TRIM(CAST(${p}cierrecontableTraspasoComision AS STRING))`;
  return `COALESCE(
    SAFE_CAST(${p}cierrecontableTraspasoComision AS DATE),
    DATE(SAFE_CAST(${p}cierrecontableTraspasoComision AS TIMESTAMP)),
    SAFE.PARSE_DATE('%Y-%m-%d', ${raw}),
    SAFE.PARSE_DATE('%m/%d/%Y', ${raw}),
    SAFE.PARSE_DATE('%m/%d/%y', ${raw}),
    SAFE.PARSE_DATE('%d/%m/%Y', ${raw}),
    SAFE.PARSE_DATE('%d/%m/%y', ${raw}),
    IF(SAFE_CAST(${raw} AS FLOAT64) BETWEEN 20000 AND 60000, DATE_ADD(DATE '1899-12-30', INTERVAL CAST(FLOOR(SAFE_CAST(${raw} AS FLOAT64)) AS INT64) DAY), NULL)
  )`;
}

export function buildWhereConditions(
  filters: MultiSearchFilters,
  prefix: string = "",
  tableName: string = "relatorio",
): string {
  const { subasta, comprador, documento, placa, fechaSubastaDesde, fechaSubastaHasta, fechaPazSalvoDesde, fechaPazSalvoHasta } = filters;
  const conditions: string[] = [];
  const p = prefix ? `${prefix}.` : "";
  const pazSalvoDateExpr = buildPazSalvoDateExpr(prefix);
  if (subasta) {
    const vals = subasta.split("|").map(v => sanitize(v.trim())).filter(Boolean);
    if (vals.length === 1) {
      const subNorm = normalizeSearchText(vals[0]);
      conditions.push(`(UPPER(IFNULL(CAST(${p}subasta AS STRING),'')) = '${vals[0].toUpperCase()}' OR REGEXP_REPLACE(NORMALIZE_AND_CASEFOLD(IFNULL(CAST(${p}subasta AS STRING),''), NFD), r'[^a-z0-9]', '') LIKE '%${subNorm.toLowerCase()}%')`);
    } else {
      const orParts = vals.map(v => {
        const norm = normalizeSearchText(v);
        return `(UPPER(IFNULL(CAST(${p}subasta AS STRING),'')) = '${v.toUpperCase()}' OR REGEXP_REPLACE(NORMALIZE_AND_CASEFOLD(IFNULL(CAST(${p}subasta AS STRING),''), NFD), r'[^a-z0-9]', '') LIKE '%${norm.toLowerCase()}%')`;
      });
      conditions.push(`(${orParts.join(' OR ')})`);
    }
  }
  if (comprador) {
    const vals = comprador.split("|").map(v => sanitize(v.trim())).filter(Boolean);
    const orParts = vals.map(v => `UPPER(IFNULL(CAST(${p}comprador AS STRING),'')) LIKE '%${v.toUpperCase()}%'`);
    conditions.push(`(${orParts.join(' OR ')})`);
  }
  if (documento) {
    const vals = documento.split("|").map(v => sanitize(v.trim())).filter(Boolean);
    const orParts = vals.map(v => `UPPER(IFNULL(CAST(${p}documento AS STRING),'')) = '${v.toUpperCase()}'`);
    conditions.push(`(${orParts.join(' OR ')})`);
  }
  if (placa) {
    const vals = placa.split("|").map(v => sanitize(v.trim())).filter(Boolean);
    const orParts = vals.map(v => {
      const norm = normalizeSearchText(v);
      return `REGEXP_REPLACE(UPPER(IFNULL(CAST(${p}placa AS STRING), '')), r'[^A-Z0-9]', '') = '${norm}'`;
    });
    conditions.push(`(${orParts.join(' OR ')})`);
  }
  // Date filters only apply to relatorio (has fecha field for subasta date)
  if (tableName === "relatorio") {
    if (fechaSubastaDesde) {
      conditions.push(`CAST(${p}fecha AS STRING) >= '${fechaSubastaDesde}'`);
    }
    if (fechaSubastaHasta) {
      conditions.push(`CAST(${p}fecha AS STRING) <= '${fechaSubastaHasta}'`);
    }
  }
  // fechaPazSalvo (cierrecontableTraspasoComision) only exists in retiros.
  // The relatorio/servitram/gestramites tables do NOT have this column, so we must not reference it there.
  if (tableName === "retiros") {
    if (fechaPazSalvoDesde || fechaPazSalvoHasta) {
      conditions.push(`${pazSalvoDateExpr} IS NOT NULL`);
      conditions.push(`IFNULL(TRIM(CAST(${p}cierrecontableTraspasoComision AS STRING)), '') != ''`);
    }
    if (fechaPazSalvoDesde) {
      conditions.push(`${pazSalvoDateExpr} >= DATE '${fechaPazSalvoDesde}'`);
    }
    if (fechaPazSalvoHasta) {
      conditions.push(`${pazSalvoDateExpr} <= DATE '${fechaPazSalvoHasta}'`);
    }
  }
  return conditions.length > 0 ? conditions.join(" AND ") : "TRUE";
}
