import type { Context } from "hono";
import { runQuery } from "../../../services/bigquery.js";
import { TABLES, COMITENTE_FILTER, ESTADO_ALLOWED_FILTER } from "../../../lib/sql-constants.js";
import { sanitize, normalizeSearchText } from "../../../lib/text-helpers.js";
import { renderQuery } from "../render-query.js";

// ── AUTOCOMPLETE: get distinct values for a field (with context filters) ──
export async function handleAutocomplete(c: Context) {
  const field = c.req.query("field") || "";
  const q = sanitize(c.req.query("q") || "");
  const qUpper = q.toUpperCase();
  const qNormalized = normalizeSearchText(q);

  // Context filters: other active filters to scope results
  const ctxSubasta = c.req.query("ctx_subasta") || "";
  const ctxComprador = c.req.query("ctx_comprador") || "";
  const ctxDocumento = c.req.query("ctx_documento") || "";
  const ctxPlaca = c.req.query("ctx_placa") || "";

  if (!q || q.length < 2) {
    return c.json({ field, options: [] });
  }

  // Build context WHERE conditions (multi-value support with pipe separator)
  const buildCtxConditions = (): string[] => {
    const conds: string[] = [];
    if (ctxSubasta && field !== "subasta") {
      const vals = ctxSubasta.split("|").map(v => sanitize(v.trim())).filter(Boolean);
      if (vals.length === 1) {
        const norm = normalizeSearchText(vals[0]);
        conds.push(`(UPPER(IFNULL(CAST(subasta AS STRING),'')) = '${vals[0].toUpperCase()}' OR REGEXP_REPLACE(NORMALIZE_AND_CASEFOLD(IFNULL(CAST(subasta AS STRING),''), NFD), r'[^a-z0-9]', '') LIKE '%${norm.toLowerCase()}%')`);
      } else if (vals.length > 1) {
        const orParts = vals.map(v => {
          const norm = normalizeSearchText(v);
          return `UPPER(IFNULL(CAST(subasta AS STRING),'')) = '${v.toUpperCase()}' OR REGEXP_REPLACE(NORMALIZE_AND_CASEFOLD(IFNULL(CAST(subasta AS STRING),''), NFD), r'[^a-z0-9]', '') LIKE '%${norm.toLowerCase()}%'`;
        });
        conds.push(`(${orParts.map(p => `(${p})`).join(' OR ')})`);
      }
    }
    if (ctxComprador && field !== "comprador") {
      const vals = ctxComprador.split("|").map(v => sanitize(v.trim())).filter(Boolean);
      const orParts = vals.map(v => `UPPER(IFNULL(CAST(comprador AS STRING),'')) LIKE '%${v.toUpperCase()}%'`);
      conds.push(`(${orParts.join(' OR ')})`);
    }
    if (ctxDocumento && field !== "documento") {
      const vals = ctxDocumento.split("|").map(v => sanitize(v.trim())).filter(Boolean);
      const orParts = vals.map(v => `UPPER(IFNULL(CAST(documento AS STRING),'')) = '${v.toUpperCase()}'`);
      conds.push(`(${orParts.join(' OR ')})`);
    }
    if (ctxPlaca && field !== "placa") {
      const vals = ctxPlaca.split("|").map(v => sanitize(v.trim())).filter(Boolean);
      const orParts = vals.map(v => {
        const norm = normalizeSearchText(v);
        return `REGEXP_REPLACE(UPPER(IFNULL(CAST(placa AS STRING), '')), r'[^A-Z0-9]', '') = '${norm}'`;
      });
      conds.push(`(${orParts.join(' OR ')})`);
    }
    return conds;
  };

  const ctxWhere = buildCtxConditions();
  const ctxSQL = ctxWhere.length > 0 ? ` AND ${ctxWhere.join(' AND ')}` : '';

  let sql = "";

  if (field === "subasta") {
    sql = renderQuery("autocomplete/subasta.sql", {
      TABLES_relatorio: TABLES.relatorio,
      COMITENTE_FILTER,
      ESTADO_ALLOWED_FILTER,
      qUpper,
      qNormalizedLower: qNormalized.toLowerCase(),
      ctxSQL,
    });
  } else if (field === "comprador") {
    sql = renderQuery("autocomplete/comprador.sql", {
      TABLES_relatorio: TABLES.relatorio,
      COMITENTE_FILTER,
      ESTADO_ALLOWED_FILTER,
      qUpper,
      qNormalizedLower: qNormalized.toLowerCase(),
      ctxSQL,
    });
  } else if (field === "documento") {
    sql = renderQuery("autocomplete/documento.sql", {
      TABLES_relatorio: TABLES.relatorio,
      COMITENTE_FILTER,
      ESTADO_ALLOWED_FILTER,
      qUpper,
      ctxSQL,
    });
  } else if (field === "placa") {
    sql = renderQuery("autocomplete/placa.sql", {
      TABLES_relatorio: TABLES.relatorio,
      COMITENTE_FILTER,
      ESTADO_ALLOWED_FILTER,
      qUpper,
      ctxSQL,
    });
  } else {
    return c.json({ error: "Campo no válido. Use: subasta, comprador, documento, placa" }, 400);
  }

  const rows = await runQuery(sql);
  const options = rows.map((row) => ({
    value: row.value || "",
    extra: row.extra || null,
  })).filter((o) => o.value);

  c.header("Cache-Control", "public, max-age=30");
  return c.json({ field, options });
}
