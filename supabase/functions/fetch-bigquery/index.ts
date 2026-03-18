import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const TABLES = {
  relatorio: "sbc-data-int.relatorio_bq.relatorio_actual",
  retiros: "sbc-data-int.r_retiros.r_retiros_gmf_2025",
  servitram: "sbc-data-int.r_retiros_tramitadores.r_tramitadores_servitram_gmf",
  gestramites: "sbc-data-int.r_retiros_tramitadores.r_tramitadores_gestramites",
};

const GCP_TOKEN_TTL_MS = 55 * 60 * 1000;
const DASHBOARD_STATS_TTL_MS = 2 * 60 * 1000;
const FILTER_RESULT_TTL_MS = 2 * 60 * 1000;

let gcpTokenCache: { accessToken: string; expiresAt: number } | null = null;
let dashboardStatsCache: { stats: Record<string, string>; expiresAt: number } | null = null;
const filterResultsCache = new Map<string, { payload: string; expiresAt: number }>();

async function createGCPToken(sa: { client_email: string; private_key: string }): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/bigquery.readonly https://www.googleapis.com/auth/drive.readonly",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };

  const encode = (obj: unknown) =>
    btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  const signingInput = `${encode(header)}.${encode(payload)}`;

  const pemContent = sa.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\n/g, '');

  const binaryDer = Uint8Array.from(atob(pemContent), (c) => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8", binaryDer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false, ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5", cryptoKey,
    new TextEncoder().encode(signingInput)
  );

  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  const jwt = `${signingInput}.${sigB64}`;

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });

  const tokenData = await tokenRes.json();
  if (!tokenRes.ok) throw new Error(`GCP token error: ${JSON.stringify(tokenData)}`);
  return tokenData.access_token;
}

async function getGCPToken(sa: { client_email: string; private_key: string }): Promise<string> {
  if (gcpTokenCache && gcpTokenCache.expiresAt > Date.now()) {
    return gcpTokenCache.accessToken;
  }

  const accessToken = await createGCPToken(sa);
  gcpTokenCache = {
    accessToken,
    expiresAt: Date.now() + GCP_TOKEN_TTL_MS,
  };

  return accessToken;
}

async function queryBQ(token: string, projectId: string, sql: string): Promise<Record<string, string | null>[]> {
  const url = `https://bigquery.googleapis.com/bigquery/v2/projects/${projectId}/queries`;
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: sql, useLegacySql: false, maxResults: 5000, timeoutMs: 30000, useQueryCache: false }),
  });

  let data = await res.json();
  if (!res.ok) throw new Error(`BigQuery error: ${JSON.stringify(data)}`);

  const jobId = data.jobReference?.jobId;
  let attempts = 0;
  while (!data.jobComplete && jobId && attempts < 10) {
    attempts++;
    console.log(`[BQ] Job ${jobId} not complete, polling attempt ${attempts}...`);
    await new Promise((r) => setTimeout(r, 1200));
    const pollUrl = `https://bigquery.googleapis.com/bigquery/v2/projects/${projectId}/queries/${jobId}?timeoutMs=10000`;
    const pollRes = await fetch(pollUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    data = await pollRes.json();
    if (!pollRes.ok) throw new Error(`BigQuery poll error: ${JSON.stringify(data)}`);
  }

  if (!data.jobComplete) {
    console.warn(`[BQ] Job ${jobId} did not complete after ${attempts} attempts`);
    return [];
  }

  if (!data.rows) return [];

  const fields = data.schema.fields.map((f: { name: string }) => f.name);
  return data.rows.map((row: { f: { v: string | null }[] }) => {
    const obj: Record<string, string | null> = {};
    row.f.forEach((cell, i) => { obj[fields[i]] = cell.v; });
    return obj;
  });
}

function sanitize(input: string): string {
  return input.replace(/[^a-zA-Z0-9\s\-_.áéíóúñÁÉÍÓÚÑ()]/g, '').substring(0, 100);
}

function normalizeSearchText(value: string | null | undefined): string {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .substring(0, 100);
}

function normalizePlaca(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = value.trim().toUpperCase();
  return normalized.length > 0 ? normalized : null;
}

function getAdminClient() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error("Supabase admin credentials not configured");
  }

  return createClient(supabaseUrl, supabaseServiceRoleKey);
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

async function getPendingPaymentRows(token: string, projectId: string): Promise<PendingPaymentRow[]> {
  const COMITENTE_FILTER = `UPPER(IFNULL(comitente,'')) = UPPER('Gm Financial Colombia Sa Compañia De Financiamiento')`;
  const sql = `
    WITH allowed_relatorio AS (
      SELECT DISTINCT UPPER(IFNULL(placa,'')) AS placa
      FROM \`${TABLES.relatorio}\`
      WHERE UPPER(IFNULL(estado,'')) NOT LIKE '%CONDICIONAL RECHAZADO%'
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

  const rows = await queryBQ(token, projectId, sql);
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


serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const saJson = Deno.env.get("GCP_SERVICE_ACCOUNT_KEY");
    if (!saJson) throw new Error("GCP_SERVICE_ACCOUNT_KEY not configured");

    const sa = JSON.parse(saJson);
    const projectId = sa.project_id || "sbc-data-int";
    const token = await getGCPToken(sa);

    const url = new URL(req.url);
    const action = url.searchParams.get("action") || "search";

    // ── SEARCH by documento, comprador name, placa, or subasta ──
    if (action === "search") {
      const q = sanitize(url.searchParams.get("q") || "");
      const qUpper = q.toUpperCase();
      const qNormalized = normalizeSearchText(q);
      if (!q) {
        return new Response(JSON.stringify({ error: "Parámetro 'q' requerido" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const normalizedContains = (fieldSql: string) => `REGEXP_REPLACE(NORMALIZE_AND_CASEFOLD(IFNULL(${fieldSql},''), NFD), r'[^a-z0-9]', '') LIKE '%${qNormalized.toLowerCase()}%'`;
      const normalizedPlacaEquals = (fieldSql: string) => `REGEXP_REPLACE(UPPER(IFNULL(CAST(${fieldSql} AS STRING), '')), r'[^A-Z0-9]', '') = '${qNormalized}'`;

      // 1) Search relatorio_actual (main sales data)
      const relatorioSQL = `
        SELECT codigo_k, codigo_, fecha, subasta, lote, comitente, categoria,
               estado, fecha_aprobacion_vendedor, placa, mayor_oferta, valor_inicial,
               comprador, email, documento, ciudad_comprador, departamento_comprador,
               gestor, movil, direccion, marca, linea, modelo, descripcion, codigoSubasta
        FROM \`${TABLES.relatorio}\`
         WHERE ${normalizedPlacaEquals("placa")}
           OR UPPER(IFNULL(documento,'')) = '${qUpper}'
           OR UPPER(IFNULL(comprador,'')) LIKE '%${qUpper}%'
           OR UPPER(IFNULL(subasta,'')) = '${qUpper}'
           OR UPPER(IFNULL(codigoSubasta,'')) = '${qUpper}'
           OR ${normalizedContains("subasta")}
           OR ${normalizedContains("codigoSubasta")}
        LIMIT 1000
      `;

      // 2) Search retiros (process tracking)
      const retirosSQL = `
        SELECT codigo, fecha, subasta, estado, lote, descripcion, placa, transito,
               tramitador, incioServitramFecha, cierrecontableTraspasoComision,
               procesoPazySalvoaTramitador, estadoDocuemntosComprador,
               enviodoFirmarGmFinancial, estadoGmFinancialFirmas,
               documentosConTramitador, fechaAprobacionTramite, fechaEntregaVehiculo,
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
        try { return await queryBQ(token, projectId, sql); }
        catch (e) { console.warn("Query failed:", e); return []; }
      };

      const [relatorio, retiros, servitram, gestramites] = await Promise.all([
        safeQuery(relatorioSQL),
        safeQuery(retirosSQL),
        safeQuery(servitramSQL),
        safeQuery(gestramitesSQL),
      ]);

      return new Response(JSON.stringify({ relatorio, retiros, servitram, gestramites }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── STATS for dashboard ──
    if (action === "stats") {
      if (dashboardStatsCache && dashboardStatsCache.expiresAt > Date.now()) {
        return new Response(JSON.stringify({ stats: dashboardStatsCache.stats, cached: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "public, max-age=30, s-maxage=120" },
        });
      }

      const COMITENTE_FILTER = `UPPER(IFNULL(comitente,'')) = UPPER('Gm Financial Colombia Sa Compañia De Financiamiento')`;
      const statsSQL = `
        WITH allowed_relatorio AS (
          SELECT UPPER(IFNULL(placa,'')) AS placa, UPPER(IFNULL(estado,'')) AS estado
          FROM \`${TABLES.relatorio}\`
          WHERE UPPER(IFNULL(estado,'')) NOT LIKE '%CONDICIONAL RECHAZADO%'
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
        retiros_stats AS (
          SELECT
            COUNTIF(IFNULL(CAST(r.cierrecontableTraspasoComision AS STRING), '') = '') AS pendientes_pago,
            COUNTIF(UPPER(IFNULL(CAST(r.estadoRetiro AS STRING), '')) = 'ABIERTO') AS pendientes_retiro
          FROM \`${TABLES.retiros}\` r
          INNER JOIN (
            SELECT DISTINCT placa
            FROM allowed_relatorio
            WHERE placa != ''
          ) ar ON UPPER(IFNULL(CAST(r.placa AS STRING), '')) = ar.placa
        ),
        traspaso_stats AS (
          SELECT COUNT(*) AS pendientes_traspaso
          FROM (
            SELECT placa, estadoTraspaso FROM \`${TABLES.servitram}\`
            UNION ALL
            SELECT placa, estadoTraspaso FROM \`${TABLES.gestramites}\`
          ) t
          INNER JOIN (
            SELECT DISTINCT placa
            FROM allowed_relatorio
            WHERE placa != ''
          ) ar ON UPPER(IFNULL(t.placa,'')) = ar.placa
          WHERE t.placa IS NOT NULL AND t.placa != ''
            AND UPPER(IFNULL(t.estadoTraspaso,'')) NOT LIKE '%APROBADO%'
            AND UPPER(IFNULL(t.estadoTraspaso,'')) NOT LIKE '%MATRICULADO%'
        )
        SELECT
          CAST(relatorio_stats.total AS STRING) AS total,
          CAST(relatorio_stats.aprobados AS STRING) AS aprobados,
          CAST(relatorio_stats.en_proceso AS STRING) AS en_proceso,
          CAST(relatorio_stats.pendientes AS STRING) AS pendientes,
          CAST(retiros_stats.pendientes_pago AS STRING) AS pendientes_pago,
          CAST(traspaso_stats.pendientes_traspaso AS STRING) AS pendientes_traspaso,
          CAST(retiros_stats.pendientes_retiro AS STRING) AS pendientes_retiro
        FROM relatorio_stats
        CROSS JOIN retiros_stats
        CROSS JOIN traspaso_stats
      `;

      let stats = {
        total: '0',
        aprobados: '0',
        en_proceso: '0',
        pendientes: '0',
        pendientes_pago: '0',
        pendientes_traspaso: '0',
        pendientes_retiro: '0',
        pagos_pendientes_revision: '0',
        soportes_pendientes_revision: '0',
      };

      try {
        const [result, pendingPaymentReviewEntries, pendingPaymentRows] = await Promise.all([
          queryBQ(token, projectId, statsSQL),
          getPendingPaymentReviewEntries().catch((error) => {
            console.error(`[payment-review-stats] FAILED:`, error instanceof Error ? error.message : error);
            return [] as PendingPaymentReviewEntry[];
          }),
          getPendingPaymentRows(token, projectId).catch((error) => {
            console.error(`[pending-payment-stats] FAILED:`, error instanceof Error ? error.message : error);
            return [] as PendingPaymentRow[];
          }),
        ]);

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

      return new Response(JSON.stringify({ stats }), {
        headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "public, max-age=30, s-maxage=120" },
      });
    }

    // ── FILTER: get rows by category for dashboard drill-down ──
    if (action === "filter") {
      const category = url.searchParams.get("category") || "";
      const canUseFilterCache = category !== "pagos_pendientes_revision" && category !== "soportes_pendientes_revision";
      const cachedFilter = canUseFilterCache ? filterResultsCache.get(category) : null;
      if (cachedFilter && cachedFilter.expiresAt > Date.now()) {
        return new Response(cachedFilter.payload, {
          headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "public, max-age=30, s-maxage=120" },
        });
      }

      const COMITENTE_FILTER = `UPPER(IFNULL(comitente,'')) = UPPER('Gm Financial Colombia Sa Compañia De Financiamiento')`;
      const allowedRelatorioCte = `
        WITH allowed_relatorio AS (
          SELECT DISTINCT UPPER(IFNULL(placa,'')) AS placa
          FROM \`${TABLES.relatorio}\`
          WHERE UPPER(IFNULL(estado,'')) NOT LIKE '%CONDICIONAL RECHAZADO%'
            AND ${COMITENTE_FILTER}
            AND IFNULL(placa,'') != ''
        )
      `;

      if (category === "pagos_pendientes_revision") {
        const [pendingPaymentReviewEntries, pendingPaymentRows] = await Promise.all([
          getPendingPaymentReviewEntries(),
          getPendingPaymentRows(token, projectId),
        ]);

        if (pendingPaymentReviewEntries.length === 0 && pendingPaymentRows.length === 0) {
          return new Response(JSON.stringify({ category, rows: [], count: 0 }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
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

        const metadataRows = placaList.length > 0
          ? await queryBQ(token, projectId, `
              SELECT
                UPPER(IFNULL(placa,'')) AS placa,
                ANY_VALUE(subasta) AS subasta,
                ANY_VALUE(comprador) AS comprador,
                ANY_VALUE(documento) AS documento,
                ANY_VALUE(descripcion) AS descripcion,
                ANY_VALUE(estado) AS estado,
                ANY_VALUE(lote) AS lote
              FROM \`${TABLES.relatorio}\`
              WHERE UPPER(IFNULL(estado,'')) NOT LIKE '%CONDICIONAL RECHAZADO%'
                AND ${COMITENTE_FILTER}
                AND UPPER(IFNULL(placa,'')) IN (${placaList.join(",")})
              GROUP BY UPPER(IFNULL(placa,''))
            `)
          : [];

        const metadataByPlaca = new Map(
          metadataRows.map((row) => [normalizePlaca(row.placa) || "", row]),
        );

        const rows = Array.from(new Set([...reviewByPlaca.keys(), ...paymentByPlaca.keys()]))
          .map((placa) => {
            const reviewEntry = reviewByPlaca.get(placa);
            const paymentEntry = paymentByPlaca.get(placa);
            const metadata = metadataByPlaca.get(placa);
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

        return new Response(JSON.stringify({ category, rows, count: rows.length }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (category === "soportes_pendientes_revision") {
        const pendingPaymentReviewEntries = await getPendingPaymentReviewEntries();

        if (pendingPaymentReviewEntries.length === 0) {
          return new Response(JSON.stringify({ category, rows: [], count: 0 }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const reviewByPlaca = new Map(
          pendingPaymentReviewEntries.map((entry) => [entry.placa, entry]),
        );

        const placaList = pendingPaymentReviewEntries
          .map((entry) => normalizePlaca(entry.placa))
          .filter((p): p is string => Boolean(p))
          .map((p) => `'${sanitize(p)}'`);

        const metadataRows = placaList.length > 0
          ? await queryBQ(token, projectId, `
              SELECT
                UPPER(IFNULL(placa,'')) AS placa,
                ANY_VALUE(subasta) AS subasta,
                ANY_VALUE(comprador) AS comprador,
                ANY_VALUE(documento) AS documento,
                ANY_VALUE(descripcion) AS descripcion,
                ANY_VALUE(estado) AS estado,
                ANY_VALUE(lote) AS lote
              FROM \`${TABLES.relatorio}\`
              WHERE UPPER(IFNULL(estado,'')) NOT LIKE '%CONDICIONAL RECHAZADO%'
                AND ${COMITENTE_FILTER}
                AND UPPER(IFNULL(placa,'')) IN (${placaList.join(",")})
              GROUP BY UPPER(IFNULL(placa,''))
            `)
          : [];

        const metadataByPlaca = new Map(
          metadataRows.map((row) => [normalizePlaca(row.placa) || "", row]),
        );

        const rows = Array.from(reviewByPlaca.entries())
          .map(([placa, reviewEntry]) => {
            const metadata = metadataByPlaca.get(placa);
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

        return new Response(JSON.stringify({ category, rows, count: rows.length }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      let sql = "";
      if (category === "pendientes_traspaso") {
        sql = `
          ${allowedRelatorioCte}
          SELECT t.subasta, t.placa, t.comprador, t.documento, t.descripcion, t.estadoTraspaso, t.tramitador, t.transito
          FROM (
            SELECT subasta, placa, comprador, documento, descripcion, estadoTraspaso, tramitador, transito FROM \`${TABLES.servitram}\`
            UNION ALL
            SELECT subasta, placa, comprador, documento, descripcion, estadoTraspaso, tramitador, transito FROM \`${TABLES.gestramites}\`
          ) t
          INNER JOIN allowed_relatorio ar ON UPPER(IFNULL(t.placa,'')) = ar.placa
          WHERE t.placa IS NOT NULL AND t.placa != ''
            AND (UPPER(IFNULL(t.estadoTraspaso,'')) NOT LIKE '%APROBADO%'
                 AND UPPER(IFNULL(t.estadoTraspaso,'')) NOT LIKE '%MATRICULADO%')
          ORDER BY t.subasta, t.placa
          LIMIT 2000
        `;
      } else if (category === "pendientes_pago") {
        sql = `
          ${allowedRelatorioCte}
          SELECT r.subasta, r.placa, r.comprador, r.documento, r.descripcion, r.estado, r.lote
          FROM \`${TABLES.retiros}\` r
          INNER JOIN allowed_relatorio ar ON UPPER(IFNULL(CAST(r.placa AS STRING), '')) = ar.placa
          WHERE IFNULL(CAST(r.cierrecontableTraspasoComision AS STRING), '') = ''
          ORDER BY r.subasta, r.placa
          LIMIT 2000
        `;
      } else if (category === "pendientes_retiro") {
        sql = `
          ${allowedRelatorioCte}
          SELECT r.subasta, r.placa, r.comprador, r.documento, r.descripcion, r.estado, r.estadoRetiro, r.lote
          FROM \`${TABLES.retiros}\` r
          INNER JOIN allowed_relatorio ar ON UPPER(IFNULL(CAST(r.placa AS STRING), '')) = ar.placa
          WHERE UPPER(IFNULL(CAST(r.estadoRetiro AS STRING), '')) = 'ABIERTO'
          ORDER BY r.subasta, r.placa
          LIMIT 2000
        `;
      } else if (category === "aprobados") {
        sql = `
          SELECT subasta, placa, comprador, documento, descripcion, estado, lote
          FROM \`${TABLES.relatorio}\`
          WHERE UPPER(IFNULL(estado,'')) LIKE '%APROBADO%'
            AND UPPER(IFNULL(estado,'')) NOT LIKE '%CONDICIONAL RECHAZADO%'
            AND ${COMITENTE_FILTER}
          ORDER BY subasta, placa
          LIMIT 2000
        `;
      } else if (category === "en_proceso") {
        sql = `
          SELECT subasta, placa, comprador, documento, descripcion, estado, lote
          FROM \`${TABLES.relatorio}\`
          WHERE (UPPER(IFNULL(estado,'')) LIKE '%PROCESO%' OR UPPER(IFNULL(estado,'')) LIKE '%CONDICIONAL%')
            AND UPPER(IFNULL(estado,'')) NOT LIKE '%CONDICIONAL RECHAZADO%'
            AND ${COMITENTE_FILTER}
          ORDER BY subasta, placa
          LIMIT 2000
        `;
      } else if (category === "total") {
        sql = `
          SELECT subasta, placa, comprador, documento, descripcion, estado, lote
          FROM \`${TABLES.relatorio}\`
          WHERE UPPER(IFNULL(estado,'')) NOT LIKE '%CONDICIONAL RECHAZADO%'
            AND ${COMITENTE_FILTER}
          ORDER BY subasta, placa
          LIMIT 2000
        `;
      } else {
        return new Response(JSON.stringify({ error: "Categoría no válida" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const rows = await queryBQ(token, projectId, sql);
      const payload = JSON.stringify({ category, rows, count: rows.length });
      if (canUseFilterCache) {
        filterResultsCache.set(category, {
          payload,
          expiresAt: Date.now() + FILTER_RESULT_TTL_MS,
        });
      }
      return new Response(payload, {
        headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "public, max-age=30, s-maxage=120" },
      });
    }

    // ── SAMPLE: get first rows from any table ──
    if (action === "sample") {
      const table = url.searchParams.get("table") || "retiros";
      const tableName = TABLES[table as keyof typeof TABLES];
      if (!tableName) {
        return new Response(JSON.stringify({ error: "Table not found" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const customSQL = url.searchParams.get("sql");
      let rows;
      if (customSQL === "distinct_estados") {
        rows = await queryBQ(token, projectId, `SELECT IFNULL(estadoRetiro,'(null)') as val, COUNT(*) as cnt FROM \`${tableName}\` GROUP BY val ORDER BY cnt DESC LIMIT 20`);
      } else if (customSQL === "count") {
        rows = await queryBQ(token, projectId, `SELECT COUNT(*) as total FROM \`${tableName}\``);
      } else if (customSQL === "retiro_stats") {
        rows = await queryBQ(token, projectId, `
          SELECT 
            COUNT(*) as total,
            COUNTIF(UPPER(IFNULL(CAST(estadoRetiro AS STRING), '')) = 'ABIERTO') as abierto,
            COUNTIF(UPPER(IFNULL(CAST(estadoRetiro AS STRING), '')) = 'CERRADO') as cerrado,
            COUNTIF(IFNULL(CAST(cierrecontableTraspasoComision AS STRING), '') = '') as sin_cierre,
            COUNTIF(IFNULL(CAST(fechaEntregaVehiculo AS STRING), '') = '') as sin_entrega
          FROM \`${tableName}\`
        `);
      } else {
        rows = await queryBQ(token, projectId, `SELECT * FROM \`${tableName}\` LIMIT 3`);
      }
      return new Response(JSON.stringify({ table: tableName, rows, count: rows.length }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Use action=search&q=..., action=stats, or action=sample&table=..." }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: unknown) {
    console.error("BigQuery error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
