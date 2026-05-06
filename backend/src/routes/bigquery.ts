import { Hono } from "hono";
import { runQuery } from "../services/bigquery.js";
import { getAdminClient } from "../services/supabase.js";
import { TABLES, COMITENTE_FILTER, ESTADO_ALLOWED_FILTER } from "../lib/sql-constants.js";
import { sanitize, normalizeSearchText, normalizePlaca } from "../lib/text-helpers.js";

const DASHBOARD_STATS_TTL_MS = 2 * 60 * 1000;
const FILTER_RESULT_TTL_MS = 2 * 60 * 1000;

let dashboardStatsCache: { stats: Record<string, string>; expiresAt: number } | null = null;
const filterResultsCache = new Map<string, { payload: string; expiresAt: number }>();

interface PendienteFiltroRow {
  placa: string;
  subasta: string;
  comprador: string | null;
  descripcion: string | null;
  tramitador: string | null;
  lote: string | null;
  estadoRelatorio: string | null;
}

async function getPendientesFiltros(): Promise<PendienteFiltroRow[]> {
  const sql = `
    SELECT
      UPPER(TRIM(IFNULL(CAST(placa AS STRING), ''))) AS placa,
      TRIM(IFNULL(CAST(subasta AS STRING), '')) AS subasta,
      TRIM(IFNULL(CAST(comprador AS STRING), '')) AS comprador,
      TRIM(IFNULL(CAST(descripcion AS STRING), '')) AS descripcion,
      TRIM(IFNULL(CAST(tramitador AS STRING), '')) AS tramitador,
      TRIM(IFNULL(CAST(lote AS STRING), '')) AS lote,
      TRIM(IFNULL(CAST(estadoRelatorio AS STRING), '')) AS estadoRelatorio
    FROM \`${TABLES.consolidadoChan}\`
    WHERE LOWER(IFNULL(CAST(comitente AS STRING), '')) = 'gm financial colombia sa compañia de financiamiento'
      AND IFNULL(CAST(estadoRelatorio AS STRING), '') IN ('Venta', 'Condicional Aprobado', 'Post-oferta Aprobada')
      AND CAST(fechaSubasta AS STRING) > '2026-01-01'
      AND fechaAprobacionVendedorDocsCreacionFiltros IS NULL
      AND IFNULL(TRIM(CAST(placa AS STRING)), '') != ''
    ORDER BY subasta, placa
  `;

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

type PendingPaymentReviewEntry = {
  placa: string;
  latestDocumentAt: string;
  documentCount: number;
};

type PendingPaymentRow = {
  subasta: string | null;
  placa: string;
  comprador: string | null;
  documento: string | null;
  descripcion: string | null;
  estado: string | null;
  lote: string | null;
};

async function getPendingPaymentReviewEntries(): Promise<PendingPaymentReviewEntry[]> {
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

async function getPendingPaymentRows(): Promise<PendingPaymentRow[]> {
  const sql = `
    WITH allowed_relatorio AS (
      SELECT DISTINCT UPPER(IFNULL(placa,'')) AS placa
      FROM \`${TABLES.relatorio}\`
      WHERE ${ESTADO_ALLOWED_FILTER}
        AND ${COMITENTE_FILTER}
        AND IFNULL(placa,'') != ''
    )
    SELECT
      ANY_VALUE(r.subasta) AS subasta,
      UPPER(IFNULL(CAST(r.placa AS STRING), '')) AS placa,
      ANY_VALUE(r.comprador) AS comprador,
      ANY_VALUE(r.documento) AS documento,
      ANY_VALUE(r.descripcion) AS descripcion,
      ANY_VALUE(r.estado) AS estado,
      ANY_VALUE(r.lote) AS lote
    FROM \`${TABLES.retiros}\` r
    INNER JOIN allowed_relatorio ar ON UPPER(IFNULL(CAST(r.placa AS STRING), '')) = ar.placa
    WHERE IFNULL(CAST(r.cierrecontableTraspasoComision AS STRING), '') = ''
      AND IFNULL(CAST(r.placa AS STRING), '') != ''
    GROUP BY UPPER(IFNULL(CAST(r.placa AS STRING), ''))
    ORDER BY subasta, placa
    LIMIT 5000
  `;

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

const router = new Hono();

router.get("/", async (c) => {
  try {
    const action = c.req.query("action") || "search";

    if (action === "debug_columns") {
      const sql = `
        SELECT
          UPPER(TRIM(IFNULL(CAST(c.placa AS STRING), ''))) AS placa,
          UPPER(TRIM(IFNULL(CAST(c.subasta AS STRING), ''))) AS subasta,
          CAST(c.fechaAprobacionVendedorDocsCreacionFiltros AS STRING) AS fecha_raw,
          IFNULL(TRIM(CAST(c.fechaAprobacionVendedorDocsCreacionFiltros AS STRING)), '') AS fecha_trimmed
        FROM \`${TABLES.consolidadoChan}\` c
        WHERE UPPER(IFNULL(CAST(c.subasta AS STRING), '')) LIKE '%GM FINANCIAL 6%'
        ORDER BY c.subasta, c.placa
        LIMIT 50
      `;
      const rows = await runQuery(sql);
      return c.json(rows);
    }

    // ── SEARCH by documento, comprador name, placa, or subasta ──
    if (action === "search") {
      const q = sanitize(c.req.query("q") || "");
      const qUpper = q.toUpperCase();
      const qNormalized = normalizeSearchText(q);
      if (!q) {
        return c.json({ error: "Parámetro 'q' requerido" }, 400);
      }

      const normalizedContains = (fieldSql: string) => `REGEXP_REPLACE(NORMALIZE_AND_CASEFOLD(IFNULL(CAST(${fieldSql} AS STRING),''), NFD), r'[^a-z0-9]', '') LIKE '%${qNormalized.toLowerCase()}%'`;
      const normalizedPlacaEquals = (fieldSql: string) => `REGEXP_REPLACE(UPPER(IFNULL(CAST(${fieldSql} AS STRING), '')), r'[^A-Z0-9]', '') = '${qNormalized}'`;

      // 1) Search relatorio_actual (main sales data)
      const relatorioSQL = `
        SELECT codigo_k, codigo_, fecha, subasta, lote, comitente, categoria,
               estado, fecha_aprobacion_vendedor, placa, mayor_oferta, valor_inicial,
               comprador, email, documento, ciudad_comprador, departamento_comprador,
               gestor, movil, direccion, marca, linea, modelo, descripcion, codigoSubasta
        FROM \`${TABLES.relatorio}\`
         WHERE ${COMITENTE_FILTER}
           AND ${ESTADO_ALLOWED_FILTER}
           AND (
             ${normalizedPlacaEquals("placa")}
             OR ${normalizedContains("descripcion")}
             OR UPPER(IFNULL(documento,'')) = '${qUpper}'
             OR UPPER(IFNULL(comprador,'')) LIKE '%${qUpper}%'
             OR UPPER(IFNULL(subasta,'')) = '${qUpper}'
             OR ${normalizedContains("subasta")}
           )
        LIMIT 1000
      `;

      // 2) Search retiros (process tracking)
      const retirosSQL = `
        SELECT codigo, fecha, subasta, estado, lote, descripcion, placa, transito,
               tramitador, incioServitramFecha, cierrecontableTraspasoComision,
               procesoPazySalvoaTramitador, estadoDocuemntosComprador,
               enviodoFirmarGmFinancial, estadoGmFinancialFirmas,
               SAFE_CAST(documentosConTramitador AS STRING) AS documentosConTramitador, fechaAprobacionTramite, fechaEntregaVehiculo,
               comentarios, mayoroferta, comprador, email, documento, movil,
               direccion, ciudadComprador, departamentoComprador,
               ubicacionVehiculo, ciudadUbicacionVehiculo, direccionUbicacionVehiculo,
               quienRetira, estadoRetiro, fechaEstadoRetiro
        FROM \`${TABLES.retiros}\`
        WHERE ${normalizedPlacaEquals("placa")}
           OR UPPER(IFNULL(documento,'')) = '${qUpper}'
           OR UPPER(IFNULL(comprador,'')) LIKE '%${qUpper}%'
           OR UPPER(IFNULL(subasta,'')) = '${qUpper}'
           OR ${normalizedContains("CAST(subasta AS STRING)")}
        LIMIT 1000
      `;

      // 3) Search tramitadores servitram
      const servitramSQL = `
        SELECT tramitador, codigo, fechaDeAsignacion, fechaDeSubasta, subasta,
               descripcion, placa, lote, comprador, documento, email, movil,
               direccion, ciudadYDepartamento, pazYSalvoContabilidad,
               fechaRecibidoImprontas, fechasFirmasComprador, fechaEnvioFirmasVendedor,
               fechaOkDocsTraspaso, transito, estadoTraspaso, fechaAprobadoRunt,
               fechaTp, fechaEnvioTpComprador, ans, observacion
        FROM \`${TABLES.servitram}\`
         WHERE ${normalizedPlacaEquals("placa")}
           OR UPPER(IFNULL(documento,'')) = '${qUpper}'
           OR UPPER(IFNULL(comprador,'')) LIKE '%${qUpper}%'
           OR UPPER(IFNULL(subasta,'')) = '${qUpper}'
           OR ${normalizedContains("subasta")}
        LIMIT 1000
      `;

      // 4) Search tramitadores gestramites
      const gestramitesSQL = `
        SELECT tramitador, codigo, fechaDeAsignacion, fechaDeSubasta, subasta,
               descripcion, placa, lote, comprador, documento, email, movil,
               direccion, ciudadYDepartamento, pazYSalvoContabilidad,
               fechaRecibidoImprontas, fechasFirmasComprador, fechaEnvioFirmasVendedor,
               fechaOkDocsTraspaso, transito, estadoTraspaso, fechaAprobadoRunt,
               fechaTp, fechaEnvioTpComprador, ans, observacion, fechaVencimientoRtm
        FROM \`${TABLES.gestramites}\`
        WHERE ${normalizedPlacaEquals("placa")}
           OR UPPER(IFNULL(documento,'')) = '${qUpper}'
           OR UPPER(IFNULL(comprador,'')) LIKE '%${qUpper}%'
           OR UPPER(IFNULL(subasta,'')) = '${qUpper}'
           OR ${normalizedContains("subasta")}
        LIMIT 1000
      `;

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
          const relatorioByPlacasSQL = `
            SELECT codigo_k, codigo_, fecha, subasta, lote, comitente, categoria,
                   estado, fecha_aprobacion_vendedor, placa, mayor_oferta, valor_inicial,
                   comprador, email, documento, ciudad_comprador, departamento_comprador,
                   gestor, movil, direccion, marca, linea, modelo, descripcion, codigoSubasta
            FROM \`${TABLES.relatorio}\`
            WHERE ${COMITENTE_FILTER}
              AND ${ESTADO_ALLOWED_FILTER}
              AND (
                REGEXP_REPLACE(UPPER(IFNULL(CAST(placa AS STRING), '')), r'[^A-Z0-9]', '') IN (${placasList})
                OR REGEXP_EXTRACT(UPPER(IFNULL(descripcion, '')), r'PLACA\s*:\s*([A-Z0-9]+)') IN (${placasList})
              )
            LIMIT 5000
          `;

          relatorio = await safeQuery(relatorioByPlacasSQL);
        }
      }

      return c.json({ relatorio, retiros, servitram, gestramites });
    }

    // ── STATS for dashboard ──
    if (action === "stats") {
      if (dashboardStatsCache && dashboardStatsCache.expiresAt > Date.now()) {
        c.header("Cache-Control", "public, max-age=30, s-maxage=120");
        return c.json({ stats: dashboardStatsCache.stats, cached: true });
      }

      const statsSQL = `
        WITH allowed_relatorio AS (
          SELECT UPPER(IFNULL(placa,'')) AS placa, UPPER(IFNULL(estado,'')) AS estado
          FROM \`${TABLES.relatorio}\`
          WHERE ${ESTADO_ALLOWED_FILTER}
            AND ${COMITENTE_FILTER}
        ),
        relatorio_stats AS (
          SELECT
            COUNT(*) AS total,
            COUNTIF(estado LIKE '%APROBADO%') AS aprobados,
            COUNTIF((estado LIKE '%PROCESO%' OR estado LIKE '%CONDICIONAL%') AND estado NOT LIKE '%CONDICIONAL RECHAZADO%') AS en_proceso,
            COUNTIF(estado LIKE '%PENDIENTE%') AS pendientes
          FROM allowed_relatorio
        ),
        excluded_retiros AS (
          SELECT DISTINCT UPPER(IFNULL(CAST(placa AS STRING), '')) AS placa
          FROM \`${TABLES.retiros}\`
          WHERE UPPER(IFNULL(CAST(estado AS STRING), '')) LIKE '%VENTA RESCINDIDA%'
             OR UPPER(IFNULL(CAST(estado AS STRING), '')) LIKE '%INCUMPLIMIENTO DE PAGO%'
             OR UPPER(IFNULL(CAST(estado AS STRING), '')) LIKE '%VENTA NO EFECTUADA POR EL COMITENTE%'
        ),
        retiros_filtered AS (
          SELECT
            UPPER(IFNULL(CAST(r.placa AS STRING), '')) AS placa,
            MAX(IFNULL(CAST(r.cierrecontableTraspasoComision AS STRING), '')) AS cierre,
            MAX(IFNULL(CAST(r.fechaAprobacionTramite AS STRING), '')) AS aprobacion
          FROM \`${TABLES.retiros}\` r
          INNER JOIN (
            SELECT DISTINCT placa
            FROM allowed_relatorio
            WHERE placa != ''
          ) ar ON UPPER(IFNULL(CAST(r.placa AS STRING), '')) = ar.placa
          LEFT JOIN excluded_retiros er ON UPPER(IFNULL(CAST(r.placa AS STRING), '')) = er.placa
          WHERE er.placa IS NULL
          GROUP BY UPPER(IFNULL(CAST(r.placa AS STRING), ''))
        ),
        retiros_pendientes_retiro AS (
          SELECT DISTINCT UPPER(IFNULL(CAST(r.placa AS STRING), '')) AS placa
          FROM \`${TABLES.retiros}\` r
          INNER JOIN (
            SELECT DISTINCT placa
            FROM allowed_relatorio
            WHERE placa != ''
          ) ar2 ON UPPER(IFNULL(CAST(r.placa AS STRING), '')) = ar2.placa
          WHERE IFNULL(CAST(r.fechaEntregaVehiculo AS STRING), '') = ''
            AND IFNULL(CAST(r.fechaAprobacionTramite AS STRING), '') != ''
            AND UPPER(IFNULL(CAST(r.estado AS STRING), '')) NOT LIKE '%VENTA RESCINDIDA%'
            AND UPPER(IFNULL(CAST(r.estado AS STRING), '')) NOT LIKE '%INCUMPLIMIENTO DE PAGO%'
            AND UPPER(IFNULL(CAST(r.estado AS STRING), '')) NOT LIKE '%VENTA NO EFECTUADA POR EL COMITENTE%'
        ),
        retiros_pendientes_traspaso AS (
          SELECT DISTINCT UPPER(IFNULL(CAST(r.placa AS STRING), '')) AS placa
          FROM \`${TABLES.retiros}\` r
          INNER JOIN (
            SELECT DISTINCT placa
            FROM allowed_relatorio
            WHERE placa != ''
          ) ar3 ON UPPER(IFNULL(CAST(r.placa AS STRING), '')) = ar3.placa
          WHERE IFNULL(CAST(r.fechaAprobacionTramite AS STRING), '') = ''
            AND UPPER(IFNULL(CAST(r.estado AS STRING), '')) NOT LIKE '%VENTA RESCINDIDA%'
            AND UPPER(IFNULL(CAST(r.estado AS STRING), '')) NOT LIKE '%INCUMPLIMIENTO DE PAGO%'
            AND UPPER(IFNULL(CAST(r.estado AS STRING), '')) NOT LIKE '%VENTA NO EFECTUADA POR EL COMITENTE%'
        ),
        retiros_stats AS (
          SELECT
            COUNTIF(cierre = '') AS pendientes_pago,
            (SELECT COUNT(*) FROM retiros_pendientes_retiro) AS pendientes_retiro,
            (SELECT COUNT(*) FROM retiros_pendientes_traspaso) AS pendientes_traspaso
          FROM retiros_filtered
        )
        SELECT
          CAST(relatorio_stats.total AS STRING) AS total,
          CAST(relatorio_stats.aprobados AS STRING) AS aprobados,
          CAST(relatorio_stats.en_proceso AS STRING) AS en_proceso,
          CAST(relatorio_stats.pendientes AS STRING) AS pendientes,
          CAST(retiros_stats.pendientes_pago AS STRING) AS pendientes_pago,
          CAST(retiros_stats.pendientes_traspaso AS STRING) AS pendientes_traspaso,
          CAST(retiros_stats.pendientes_retiro AS STRING) AS pendientes_retiro
        FROM relatorio_stats
        CROSS JOIN retiros_stats
      `;

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

      dashboardStatsCache = {
        stats,
        expiresAt: Date.now() + DASHBOARD_STATS_TTL_MS,
      };

      c.header("Cache-Control", "public, max-age=30, s-maxage=120");
      return c.json({ stats });
    }

    // ── INDIVIDUAL STAT ACTIONS for progressive dashboard loading ──
    if (action === "stats_pagos") {
      const statsSQL = `
        WITH allowed_relatorio AS (
          SELECT UPPER(IFNULL(placa,'')) AS placa
          FROM \`${TABLES.relatorio}\`
          WHERE ${ESTADO_ALLOWED_FILTER} AND ${COMITENTE_FILTER}
        ),
        excluded_retiros AS (
          SELECT DISTINCT UPPER(IFNULL(CAST(placa AS STRING), '')) AS placa
          FROM \`${TABLES.retiros}\`
          WHERE UPPER(IFNULL(CAST(estado AS STRING), '')) LIKE '%VENTA RESCINDIDA%'
             OR UPPER(IFNULL(CAST(estado AS STRING), '')) LIKE '%INCUMPLIMIENTO DE PAGO%'
             OR UPPER(IFNULL(CAST(estado AS STRING), '')) LIKE '%VENTA NO EFECTUADA POR EL COMITENTE%'
        ),
        retiros_filtered AS (
          SELECT
            UPPER(IFNULL(CAST(r.placa AS STRING), '')) AS placa,
            MAX(IFNULL(CAST(r.cierrecontableTraspasoComision AS STRING), '')) AS cierre
          FROM \`${TABLES.retiros}\` r
          INNER JOIN (SELECT DISTINCT placa FROM allowed_relatorio WHERE placa != '') ar ON UPPER(IFNULL(CAST(r.placa AS STRING), '')) = ar.placa
          LEFT JOIN excluded_retiros er ON UPPER(IFNULL(CAST(r.placa AS STRING), '')) = er.placa
          WHERE er.placa IS NULL
          GROUP BY UPPER(IFNULL(CAST(r.placa AS STRING), ''))
        )
        SELECT CAST(COUNTIF(cierre = '') AS STRING) AS pendientes_pago FROM retiros_filtered
      `;

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

    if (action === "stats_retiros") {
      const statsSQL = `
        WITH allowed_placas AS (
          SELECT DISTINCT UPPER(IFNULL(placa,'')) AS placa
          FROM \`${TABLES.relatorio}\`
          WHERE ${ESTADO_ALLOWED_FILTER} AND ${COMITENTE_FILTER}
            AND IFNULL(TRIM(placa),'') != ''
        ),
        base AS (
          SELECT
            UPPER(IFNULL(CAST(r.placa AS STRING), '')) AS placa,
            IFNULL(CAST(r.fechaAprobacionTramite AS STRING), '') AS fat,
            IFNULL(CAST(r.fechaEntregaVehiculo AS STRING), '') AS fev
          FROM \`${TABLES.retiros}\` r
          INNER JOIN allowed_placas ap ON UPPER(IFNULL(CAST(r.placa AS STRING), '')) = ap.placa
          WHERE UPPER(IFNULL(CAST(r.estado AS STRING), '')) NOT LIKE '%VENTA RESCINDIDA%'
            AND UPPER(IFNULL(CAST(r.estado AS STRING), '')) NOT LIKE '%INCUMPLIMIENTO DE PAGO%'
            AND UPPER(IFNULL(CAST(r.estado AS STRING), '')) NOT LIKE '%VENTA NO EFECTUADA POR EL COMITENTE%'
        ),
        agg AS (
          SELECT
            placa,
            MAX(fat) AS fat,
            MAX(fev) AS fev
          FROM base
          GROUP BY placa
        )
        SELECT
          CAST(COUNTIF(fat = '') AS STRING) AS pendientes_traspaso,
          CAST(COUNTIF(fat != '' AND fev = '') AS STRING) AS pendientes_retiro,
          CAST(COUNTIF(fev != '') AS STRING) AS vehiculos_entregados
        FROM agg
      `;

      try {
        const result = await runQuery(statsSQL);
        c.header("Cache-Control", "public, max-age=15");
        return c.json({
          pendientes_traspaso: result[0]?.pendientes_traspaso || '0',
          pendientes_retiro: result[0]?.pendientes_retiro || '0',
          vehiculos_entregados: result[0]?.vehiculos_entregados || '0',
        });
      } catch (e) {
        console.error("[stats_retiros] FAILED:", e);
        return c.json({ pendientes_traspaso: '0', pendientes_retiro: '0', vehiculos_entregados: '0' });
      }
    }

    if (action === "stats_filtros") {
      try {
        const rows = await getPendientesFiltros();
        c.header("Cache-Control", "public, max-age=15");
        return c.json({
          pendientes_filtros: String(rows.length),
        });
      } catch (e) {
        console.error("[stats_filtros] FAILED:", e);
        return c.json({ pendientes_filtros: '0' });
      }
    }

    // ── FILTER: get rows by category for dashboard drill-down ──
    if (action === "filter") {
      const category = c.req.query("category") || "";
      const canUseFilterCache = category !== "pagos_pendientes_revision" && category !== "soportes_pendientes_revision";
      const cachedFilter = canUseFilterCache ? filterResultsCache.get(category) : null;
      if (cachedFilter && cachedFilter.expiresAt > Date.now()) {
        c.header("Cache-Control", "public, max-age=30, s-maxage=120");
        c.header("Content-Type", "application/json");
        return c.body(cachedFilter.payload);
      }

      const EXCLUDED_ESTADOS_RETIROS = `
        AND UPPER(IFNULL(CAST(r.estado AS STRING), '')) NOT LIKE '%VENTA RESCINDIDA%'
        AND UPPER(IFNULL(CAST(r.estado AS STRING), '')) NOT LIKE '%INCUMPLIMIENTO DE PAGO%'
        AND UPPER(IFNULL(CAST(r.estado AS STRING), '')) NOT LIKE '%VENTA NO EFECTUADA POR EL COMITENTE%'
      `;
      const allowedRelatorioCte = `
        WITH allowed_relatorio AS (
          SELECT DISTINCT UPPER(IFNULL(placa,'')) AS placa
          FROM \`${TABLES.relatorio}\`
          WHERE ${ESTADO_ALLOWED_FILTER}
            AND ${COMITENTE_FILTER}
            AND IFNULL(placa,'') != ''
        )
      `;

      if (category === "pagos_pendientes_revision") {
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
            ? runQuery(`
                SELECT
                  UPPER(IFNULL(placa,'')) AS placa,
                  ANY_VALUE(subasta) AS subasta,
                  ANY_VALUE(comprador) AS comprador,
                  ANY_VALUE(documento) AS documento,
                  ANY_VALUE(descripcion) AS descripcion,
                  ANY_VALUE(estado) AS estado,
                  ANY_VALUE(lote) AS lote
                FROM \`${TABLES.relatorio}\`
                WHERE ${ESTADO_ALLOWED_FILTER}
                  AND ${COMITENTE_FILTER}
                  AND UPPER(IFNULL(placa,'')) IN (${placaList.join(",")})
                GROUP BY UPPER(IFNULL(placa,''))
              `)
            : Promise.resolve([]),
          placaList.length > 0
            ? runQuery(`
                SELECT
                  UPPER(TRIM(IFNULL(CAST(placa AS STRING), ''))) AS placa,
                  ANY_VALUE(CAST(fechaAprobacionVendedorDocsCreacionFiltros AS STRING)) AS fechaAprobacionFiltros
                FROM \`${TABLES.consolidadoChan}\`
                WHERE LOWER(IFNULL(CAST(comitente AS STRING), '')) = 'gm financial colombia sa compañia de financiamiento'
                  AND UPPER(TRIM(IFNULL(CAST(placa AS STRING), ''))) IN (${placaList.join(",")})
                GROUP BY UPPER(TRIM(IFNULL(CAST(placa AS STRING), '')))
              `)
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

      if (category === "soportes_pendientes_revision") {
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
            ? runQuery(`
                SELECT
                  UPPER(IFNULL(placa,'')) AS placa,
                  ANY_VALUE(subasta) AS subasta,
                  ANY_VALUE(comprador) AS comprador,
                  ANY_VALUE(documento) AS documento,
                  ANY_VALUE(descripcion) AS descripcion,
                  ANY_VALUE(estado) AS estado,
                  ANY_VALUE(lote) AS lote
                FROM \`${TABLES.relatorio}\`
                WHERE ${ESTADO_ALLOWED_FILTER}
                  AND ${COMITENTE_FILTER}
                  AND UPPER(IFNULL(placa,'')) IN (${placaList.join(",")})
                GROUP BY UPPER(IFNULL(placa,''))
              `)
            : Promise.resolve([]),
          placaList.length > 0
            ? runQuery(`
                SELECT
                  UPPER(TRIM(IFNULL(CAST(placa AS STRING), ''))) AS placa,
                  ANY_VALUE(CAST(fechaAprobacionVendedorDocsCreacionFiltros AS STRING)) AS fechaAprobacionFiltros
                FROM \`${TABLES.consolidadoChan}\`
                WHERE LOWER(IFNULL(CAST(comitente AS STRING), '')) = 'gm financial colombia sa compañia de financiamiento'
                  AND UPPER(TRIM(IFNULL(CAST(placa AS STRING), ''))) IN (${placaList.join(",")})
                GROUP BY UPPER(TRIM(IFNULL(CAST(placa AS STRING), '')))
              `)
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

      let sql = "";
      if (category === "pendientes_traspaso") {
        sql = `
          ${allowedRelatorioCte},
          tramitadores_lookup AS (
            SELECT
              UPPER(IFNULL(CAST(placa AS STRING), '')) AS placa,
              ANY_VALUE(CAST(pazYSalvoContabilidad AS STRING)) AS fechaPazSalvo,
              ANY_VALUE(CAST(observacion AS STRING)) AS observacionTramitador,
              ANY_VALUE(CAST(estadoTraspaso AS STRING)) AS estadoTraspaso
            FROM (
              SELECT placa, pazYSalvoContabilidad, observacion, estadoTraspaso FROM \`${TABLES.servitram}\`
              UNION ALL
              SELECT placa, pazYSalvoContabilidad, observacion, estadoTraspaso FROM \`${TABLES.gestramites}\`
            )
            WHERE IFNULL(CAST(placa AS STRING), '') != ''
            GROUP BY UPPER(IFNULL(CAST(placa AS STRING), ''))
          )
          SELECT r.subasta, r.placa, r.comprador, r.documento, r.descripcion, r.estado, r.fechaAprobacionTramite, r.lote, r.tramitador,
                 SAFE_CAST(r.documentosConTramitador AS STRING) AS documentosConTramitador, t.fechaPazSalvo,
                 r.comentarios, t.estadoTraspaso,
                 t.observacionTramitador,
                 SAFE_CAST(r.fechaAutorizacionEntregaVh AS STRING) AS fechaAutorizacionEntregaVh
          FROM \`${TABLES.retiros}\` r
          INNER JOIN allowed_relatorio ar ON UPPER(IFNULL(CAST(r.placa AS STRING), '')) = ar.placa
          LEFT JOIN tramitadores_lookup t ON UPPER(IFNULL(CAST(r.placa AS STRING), '')) = t.placa
          WHERE IFNULL(CAST(r.fechaAprobacionTramite AS STRING), '') = ''
            ${EXCLUDED_ESTADOS_RETIROS}
          ORDER BY r.subasta, r.placa
          LIMIT 2000
        `;
      } else if (category === "pendientes_pago") {
        const pagoSQL = `
          ${allowedRelatorioCte},
          consolidado_lookup AS (
            SELECT
              UPPER(TRIM(IFNULL(CAST(placa AS STRING), ''))) AS placa,
              ANY_VALUE(CAST(fechaAprobacionVendedorDocsCreacionFiltros AS STRING)) AS fechaAprobacionFiltros
            FROM \`${TABLES.consolidadoChan}\`
            WHERE LOWER(IFNULL(CAST(comitente AS STRING), '')) = 'gm financial colombia sa compañia de financiamiento'
              AND IFNULL(TRIM(CAST(placa AS STRING)), '') != ''
            GROUP BY UPPER(TRIM(IFNULL(CAST(placa AS STRING), '')))
          )
          SELECT r.subasta, UPPER(IFNULL(CAST(r.placa AS STRING), '')) AS placa, r.comprador, r.documento, r.lote,
                 c.fechaAprobacionFiltros
          FROM \`${TABLES.retiros}\` r
          INNER JOIN allowed_relatorio ar ON UPPER(IFNULL(CAST(r.placa AS STRING), '')) = ar.placa
          LEFT JOIN consolidado_lookup c ON UPPER(IFNULL(CAST(r.placa AS STRING), '')) = c.placa
          WHERE IFNULL(CAST(r.cierrecontableTraspasoComision AS STRING), '') = ''
            ${EXCLUDED_ESTADOS_RETIROS}
          ORDER BY r.subasta, r.placa
          LIMIT 2000
        `;

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
      } else if (category === "pendientes_retiro") {
        sql = `
          ${allowedRelatorioCte},
          tramitadores_lookup AS (
            SELECT
              UPPER(IFNULL(CAST(placa AS STRING), '')) AS placa,
              ANY_VALUE(CAST(pazYSalvoContabilidad AS STRING)) AS fechaPazSalvo,
              ANY_VALUE(CAST(observacion AS STRING)) AS observacionTramitador
            FROM (
              SELECT placa, pazYSalvoContabilidad, observacion FROM \`${TABLES.servitram}\`
              UNION ALL
              SELECT placa, pazYSalvoContabilidad, observacion FROM \`${TABLES.gestramites}\`
            )
            WHERE IFNULL(CAST(placa AS STRING), '') != ''
            GROUP BY UPPER(IFNULL(CAST(placa AS STRING), ''))
          )
          SELECT r.subasta, r.placa, r.comprador, r.documento, r.descripcion, r.estado, r.estadoRetiro, r.fechaEntregaVehiculo, r.lote, r.tramitador,
                 SAFE_CAST(r.documentosConTramitador AS STRING) AS documentosConTramitador, t.fechaPazSalvo,
                 r.comentarios,
                 t.observacionTramitador,
                 CAST(r.procesoPazySalvoaTramitador AS STRING) AS fechaPazSalvoTramitador,
                 SAFE_CAST(r.fechaAutorizacionEntregaVh AS STRING) AS fechaAutorizacionEntregaVh
          FROM \`${TABLES.retiros}\` r
          INNER JOIN allowed_relatorio ar ON UPPER(IFNULL(CAST(r.placa AS STRING), '')) = ar.placa
          LEFT JOIN tramitadores_lookup t ON UPPER(IFNULL(CAST(r.placa AS STRING), '')) = t.placa
          WHERE IFNULL(CAST(r.fechaEntregaVehiculo AS STRING), '') = ''
            AND IFNULL(CAST(r.fechaAprobacionTramite AS STRING), '') != ''
            ${EXCLUDED_ESTADOS_RETIROS}
          ORDER BY r.subasta, r.placa
          LIMIT 2000
        `;
      } else if (category === "vehiculos_entregados") {
        sql = `
          ${allowedRelatorioCte},
          tramitadores_lookup AS (
            SELECT
              UPPER(IFNULL(CAST(placa AS STRING), '')) AS placa,
              ANY_VALUE(CAST(pazYSalvoContabilidad AS STRING)) AS fechaPazSalvo,
              ANY_VALUE(CAST(observacion AS STRING)) AS observacionTramitador
            FROM (
              SELECT placa, pazYSalvoContabilidad, observacion FROM \`${TABLES.servitram}\`
              UNION ALL
              SELECT placa, pazYSalvoContabilidad, observacion FROM \`${TABLES.gestramites}\`
            )
            WHERE IFNULL(CAST(placa AS STRING), '') != ''
            GROUP BY UPPER(IFNULL(CAST(placa AS STRING), ''))
          )
          SELECT r.subasta, r.placa, r.comprador, r.documento, r.descripcion, r.estado, r.estadoRetiro, r.lote, r.tramitador,
                 SAFE_CAST(r.documentosConTramitador AS STRING) AS documentosConTramitador, t.fechaPazSalvo,
                 r.comentarios,
                 t.observacionTramitador,
                 CAST(r.fechaEntregaVehiculo AS STRING) AS fechaEntregaVehiculo,
                 SAFE_CAST(r.fechaAprobacionTramite AS STRING) AS fechaAprobacionTramite,
                 SAFE_CAST(r.fechaAutorizacionEntregaVh AS STRING) AS fechaAutorizacionEntregaVh
          FROM \`${TABLES.retiros}\` r
          INNER JOIN allowed_relatorio ar ON UPPER(IFNULL(CAST(r.placa AS STRING), '')) = ar.placa
          LEFT JOIN tramitadores_lookup t ON UPPER(IFNULL(CAST(r.placa AS STRING), '')) = t.placa
          WHERE IFNULL(CAST(r.fechaEntregaVehiculo AS STRING), '') != ''
            ${EXCLUDED_ESTADOS_RETIROS}
          ORDER BY r.subasta, r.placa
          LIMIT 2000
        `;
      } else if (category === "aprobados") {
        sql = `
          SELECT subasta, placa, comprador, documento, descripcion, estado, lote
          FROM \`${TABLES.relatorio}\`
          WHERE ${ESTADO_ALLOWED_FILTER}
            AND UPPER(IFNULL(estado,'')) LIKE '%APROBADO%'
            AND ${COMITENTE_FILTER}
          ORDER BY subasta, placa
          LIMIT 2000
        `;
      } else if (category === "en_proceso") {
        sql = `
          SELECT subasta, placa, comprador, documento, descripcion, estado, lote
          FROM \`${TABLES.relatorio}\`
          WHERE ${ESTADO_ALLOWED_FILTER}
            AND (UPPER(IFNULL(estado,'')) LIKE '%PROCESO%' OR UPPER(IFNULL(estado,'')) LIKE '%CONDICIONAL%')
            AND ${COMITENTE_FILTER}
          ORDER BY subasta, placa
          LIMIT 2000
        `;
      } else if (category === "pendientes_filtros") {
        const pendientesFiltrosRows = await getPendientesFiltros();
        const rows = pendientesFiltrosRows.map((r) => ({
          subasta: r.subasta,
          placa: r.placa,
          comprador: r.comprador,
          documento: null,
          descripcion: r.descripcion,
          estado: r.estadoRelatorio || "",
          lote: r.lote,
          tramitador: r.tramitador,
        }));
        const payload = JSON.stringify({ category, rows, count: rows.length });
        if (canUseFilterCache) {
          filterResultsCache.set(category, { payload, expiresAt: Date.now() + FILTER_RESULT_TTL_MS });
        }
        c.header("Content-Type", "application/json");
        return c.body(payload);
      } else if (category === "total") {
        sql = `
          SELECT subasta, placa, comprador, documento, descripcion, estado, lote
          FROM \`${TABLES.relatorio}\`
          WHERE ${ESTADO_ALLOWED_FILTER}
            AND ${COMITENTE_FILTER}
          ORDER BY subasta, placa
          LIMIT 2000
        `;
      } else {
        return c.json({ error: "Categoría no válida" }, 400);
      }

      const rows = await runQuery(sql);
      const payload = JSON.stringify({ category, rows, count: rows.length });
      if (canUseFilterCache) {
        filterResultsCache.set(category, {
          payload,
          expiresAt: Date.now() + FILTER_RESULT_TTL_MS,
        });
      }
      c.header("Cache-Control", "public, max-age=30, s-maxage=120");
      c.header("Content-Type", "application/json");
      return c.body(payload);
    }

    // ── AUTOCOMPLETE: get distinct values for a field (with context filters) ──
    if (action === "autocomplete") {
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
        sql = `
          SELECT DISTINCT CAST(subasta AS STRING) AS value, NULL AS extra
          FROM \`${TABLES.relatorio}\`
          WHERE ${COMITENTE_FILTER}
            AND ${ESTADO_ALLOWED_FILTER}
            AND IFNULL(CAST(subasta AS STRING),'') != ''
            AND (
              UPPER(IFNULL(CAST(subasta AS STRING),'')) LIKE '%${qUpper}%'
              OR REGEXP_REPLACE(NORMALIZE_AND_CASEFOLD(IFNULL(CAST(subasta AS STRING),''), NFD), r'[^a-z0-9]', '') LIKE '%${qNormalized.toLowerCase()}%'
            )${ctxSQL}
          ORDER BY value
          LIMIT 20
        `;
      } else if (field === "comprador") {
        sql = `
          SELECT DISTINCT CAST(comprador AS STRING) AS value, CAST(documento AS STRING) AS extra
          FROM \`${TABLES.relatorio}\`
          WHERE ${COMITENTE_FILTER}
            AND ${ESTADO_ALLOWED_FILTER}
            AND IFNULL(CAST(comprador AS STRING),'') != ''
            AND (
              UPPER(IFNULL(CAST(comprador AS STRING),'')) LIKE '%${qUpper}%'
              OR REGEXP_REPLACE(NORMALIZE_AND_CASEFOLD(IFNULL(CAST(comprador AS STRING),''), NFD), r'[^a-z0-9]', '') LIKE '%${qNormalized.toLowerCase()}%'
            )${ctxSQL}
          ORDER BY value
          LIMIT 20
        `;
      } else if (field === "documento") {
        sql = `
          SELECT DISTINCT CAST(documento AS STRING) AS value, CAST(comprador AS STRING) AS extra
          FROM \`${TABLES.relatorio}\`
          WHERE ${COMITENTE_FILTER}
            AND ${ESTADO_ALLOWED_FILTER}
            AND IFNULL(CAST(documento AS STRING),'') != ''
            AND UPPER(IFNULL(CAST(documento AS STRING),'')) LIKE '%${qUpper}%'${ctxSQL}
          ORDER BY value
          LIMIT 20
        `;
      } else if (field === "placa") {
        sql = `
          SELECT DISTINCT UPPER(IFNULL(CAST(placa AS STRING),'')) AS value, CAST(descripcion AS STRING) AS extra
          FROM \`${TABLES.relatorio}\`
          WHERE ${COMITENTE_FILTER}
            AND ${ESTADO_ALLOWED_FILTER}
            AND IFNULL(CAST(placa AS STRING),'') != ''
            AND UPPER(IFNULL(CAST(placa AS STRING),'')) LIKE '%${qUpper}%'${ctxSQL}
          ORDER BY value
          LIMIT 20
        `;
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

    // ── MULTI-FILTER SEARCH: combined AND search ──
    if (action === "multi-search") {
      const subasta = sanitize(c.req.query("subasta") || "");
      const comprador = sanitize(c.req.query("comprador") || "");
      const documento = sanitize(c.req.query("documento") || "");
      const placa = sanitize(c.req.query("placa") || "");
      const fechaSubastaDesde = sanitize(c.req.query("fechaSubastaDesde") || "");
      const fechaSubastaHasta = sanitize(c.req.query("fechaSubastaHasta") || "");
      const fechaPazSalvoDesde = sanitize(c.req.query("fechaPazSalvoDesde") || "");
      const fechaPazSalvoHasta = sanitize(c.req.query("fechaPazSalvoHasta") || "");

      if (!subasta && !comprador && !documento && !placa && !fechaSubastaDesde && !fechaSubastaHasta && !fechaPazSalvoDesde && !fechaPazSalvoHasta) {
        return c.json({ error: "Al menos un filtro es requerido" }, 400);
      }

      const buildPazSalvoDateExpr = (prefix: string = "") => {
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
      };

      const buildWhereConditions = (prefix: string = "", tableName: string = "relatorio") => {
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
      };

      // When the user filters ONLY by fecha paz y salvo (no other relatorio-side filter),
      // we must skip the initial relatorio query — otherwise it would return up to 1000 rows
      // unfiltered (every comprador). The placas-fallback below will then pull only the
      // relatorio rows whose placa appears in retiros/servitram/gestramites for that date range.
      const hasRelatorioSideFilter = !!(subasta || comprador || documento || placa || fechaSubastaDesde || fechaSubastaHasta);
      const onlyPazSalvoFilter = !hasRelatorioSideFilter && !!(fechaPazSalvoDesde || fechaPazSalvoHasta);
      const hasPazSalvoFilter = !!(fechaPazSalvoDesde || fechaPazSalvoHasta);

      const relatorioSQL = `
        SELECT codigo_k, codigo_, fecha, subasta, lote, comitente, categoria,
               estado, fecha_aprobacion_vendedor, placa, mayor_oferta, valor_inicial,
               comprador, email, documento, ciudad_comprador, departamento_comprador,
               gestor, movil, direccion, marca, linea, modelo, descripcion, codigoSubasta
        FROM \`${TABLES.relatorio}\`
        WHERE ${COMITENTE_FILTER} AND ${buildWhereConditions("", "relatorio")}
          AND (${ESTADO_ALLOWED_FILTER}
               OR UPPER(IFNULL(CAST(estado AS STRING),'')) LIKE '%INCUMPLIMIENTO DE PAGO%')
        LIMIT 1000
      `;

      const retirosSQL = `
        SELECT codigo, fecha, subasta, estado, lote, descripcion, placa, transito,
               tramitador, incioServitramFecha, CAST(${buildPazSalvoDateExpr()} AS STRING) AS cierrecontableTraspasoComision,
               procesoPazySalvoaTramitador, estadoDocuemntosComprador,
               enviodoFirmarGmFinancial, estadoGmFinancialFirmas,
               SAFE_CAST(documentosConTramitador AS STRING) AS documentosConTramitador, fechaAprobacionTramite, fechaEntregaVehiculo,
               comentarios, mayoroferta, comprador, email, documento, movil,
               direccion, ciudadComprador, departamentoComprador,
               ubicacionVehiculo, ciudadUbicacionVehiculo, direccionUbicacionVehiculo,
               quienRetira, estadoRetiro, fechaEstadoRetiro
        FROM \`${TABLES.retiros}\`
        WHERE ${buildWhereConditions("", "retiros")}
        LIMIT 1000
      `;

      const servitramSQL = `
        SELECT tramitador, codigo, fechaDeAsignacion, fechaDeSubasta, subasta,
               descripcion, placa, lote, comprador, documento, email, movil,
               direccion, ciudadYDepartamento, pazYSalvoContabilidad,
               fechaRecibidoImprontas, fechasFirmasComprador, fechaEnvioFirmasVendedor,
               fechaOkDocsTraspaso, transito, estadoTraspaso, fechaAprobadoRunt,
               fechaTp, fechaEnvioTpComprador, ans, observacion
        FROM \`${TABLES.servitram}\`
        WHERE ${buildWhereConditions("", "servitram")}
        LIMIT 1000
      `;

      const gestramitesSQL = `
        SELECT tramitador, codigo, fechaDeAsignacion, fechaDeSubasta, subasta,
               descripcion, placa, lote, comprador, documento, email, movil,
               direccion, ciudadYDepartamento, pazYSalvoContabilidad,
               fechaRecibidoImprontas, fechasFirmasComprador, fechaEnvioFirmasVendedor,
               fechaOkDocsTraspaso, transito, estadoTraspaso, fechaAprobadoRunt,
               fechaTp, fechaEnvioTpComprador, ans, observacion, fechaVencimientoRtm
        FROM \`${TABLES.gestramites}\`
        WHERE ${buildWhereConditions("", "gestramites")}
        LIMIT 1000
      `;

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
          const relatorioByPlacasSQL = `
            SELECT codigo_k, codigo_, fecha, subasta, lote, comitente, categoria,
                   estado, fecha_aprobacion_vendedor, placa, mayor_oferta, valor_inicial,
                   comprador, email, documento, ciudad_comprador, departamento_comprador,
                   gestor, movil, direccion, marca, linea, modelo, descripcion, codigoSubasta
            FROM \`${TABLES.relatorio}\`
            WHERE ${COMITENTE_FILTER}
              AND REGEXP_REPLACE(UPPER(IFNULL(CAST(placa AS STRING), '')), r'[^A-Z0-9]', '') IN (${placasList})
              AND (${ESTADO_ALLOWED_FILTER}
                   OR UPPER(IFNULL(CAST(estado AS STRING),'')) LIKE '%INCUMPLIMIENTO DE PAGO%')
            LIMIT 5000
          `;
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

    // ── SAMPLE: get first rows from any table ──
    if (action === "sample") {
      const table = c.req.query("table") || "retiros";
      const tableName = TABLES[table as keyof typeof TABLES];
      if (!tableName) {
        return c.json({ error: "Table not found" }, 400);
      }
      const customSQL = c.req.query("sql");
      let rows;
      if (customSQL === "distinct_estados") {
        rows = await runQuery(`SELECT IFNULL(estadoRetiro,'(null)') as val, COUNT(*) as cnt FROM \`${tableName}\` GROUP BY val ORDER BY cnt DESC LIMIT 20`);
      } else if (customSQL === "count") {
        rows = await runQuery(`SELECT COUNT(*) as total FROM \`${tableName}\``);
      } else if (customSQL === "retiro_stats") {
        rows = await runQuery(`
          SELECT
            COUNT(*) as total,
            COUNTIF(UPPER(IFNULL(CAST(estadoRetiro AS STRING), '')) = 'ABIERTO') as abierto,
            COUNTIF(UPPER(IFNULL(CAST(estadoRetiro AS STRING), '')) = 'CERRADO') as cerrado,
            COUNTIF(IFNULL(CAST(cierrecontableTraspasoComision AS STRING), '') = '') as sin_cierre,
            COUNTIF(IFNULL(CAST(fechaEntregaVehiculo AS STRING), '') = '') as sin_entrega
          FROM \`${tableName}\`
        `);
      } else {
        rows = await runQuery(`SELECT * FROM \`${tableName}\` LIMIT 3`);
      }
      return c.json({ table: tableName, rows, count: rows.length });
    }

    return c.json({ error: "Use action=search&q=..., action=stats, or action=sample&table=..." }, 400);

  } catch (error: unknown) {
    console.error("BigQuery error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return c.json({ error: message }, 500);
  }
});

export const bigqueryRouter = router;
