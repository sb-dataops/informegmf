import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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

async function queryBQ(token: string, projectId: string, sql: string): Promise<Record<string, string | null>[]> {
  const url = `https://bigquery.googleapis.com/bigquery/v2/projects/${projectId}/queries`;
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: sql, useLegacySql: false, maxResults: 5000 }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(`BigQuery error: ${JSON.stringify(data)}`);
  if (!data.rows) return [];

  const fields = data.schema.fields.map((f: { name: string }) => f.name);
  return data.rows.map((row: { f: { v: string | null }[] }) => {
    const obj: Record<string, string | null> = {};
    row.f.forEach((cell, i) => { obj[fields[i]] = cell.v; });
    return obj;
  });
}

function sanitize(input: string): string {
  return input.replace(/[^a-zA-Z0-9\s\-_.áéíóúñÁÉÍÓÚÑ]/g, '').substring(0, 100);
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
    const token = await createGCPToken(sa);

    const url = new URL(req.url);
    const action = url.searchParams.get("action") || "search";

    // ── SEARCH by documento, comprador name, or placa ──
    if (action === "search") {
      const q = sanitize(url.searchParams.get("q") || "");
      if (!q) {
        return new Response(JSON.stringify({ error: "Parámetro 'q' requerido" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // 1) Search relatorio_actual (main sales data)
      const relatorioSQL = `
        SELECT codigo_k, codigo_, fecha, subasta, lote, comitente, categoria,
               estado, fecha_aprobacion_vendedor, placa, mayor_oferta, valor_inicial,
               comprador, email, documento, ciudad_comprador, departamento_comprador,
               gestor, movil, direccion, marca, linea, modelo, descripcion, codigoSubasta
        FROM \`${TABLES.relatorio}\`
        WHERE UPPER(IFNULL(placa,'')) = UPPER('${q}')
           OR UPPER(IFNULL(documento,'')) = '${q.toUpperCase()}'
           OR UPPER(IFNULL(comprador,'')) LIKE '%${q.toUpperCase()}%'
        LIMIT 200
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
        WHERE UPPER(IFNULL(CAST(placa AS STRING),'')) = UPPER('${q}')
           OR UPPER(IFNULL(documento,'')) = '${q.toUpperCase()}'
           OR UPPER(IFNULL(comprador,'')) LIKE '%${q.toUpperCase()}%'
        LIMIT 200
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
        WHERE UPPER(IFNULL(placa,'')) = UPPER('${q}')
           OR UPPER(IFNULL(documento,'')) = '${q.toUpperCase()}'
           OR UPPER(IFNULL(comprador,'')) LIKE '%${q.toUpperCase()}%'
        LIMIT 200
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
        WHERE UPPER(IFNULL(placa,'')) = UPPER('${q}')
           OR UPPER(IFNULL(documento,'')) = '${q.toUpperCase()}'
           OR UPPER(IFNULL(comprador,'')) LIKE '%${q.toUpperCase()}%'
        LIMIT 200
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
      const safeQuery2 = async (label: string, sql: string) => {
        try { 
          const result = await queryBQ(token, projectId, sql); 
          console.log(`[${label}] result:`, JSON.stringify(result));
          return result;
        }
        catch (e) { console.warn(`[${label}] failed:`, e); return []; }
      };

      // Total from relatorio
      const relatorioStatsSQL = `
        SELECT 
          COUNT(*) as total,
          COUNTIF(UPPER(IFNULL(estado,'')) LIKE '%APROBADO%') as aprobados,
          COUNTIF(UPPER(IFNULL(estado,'')) LIKE '%PROCESO%' OR UPPER(IFNULL(estado,'')) LIKE '%CONDICIONAL%') as en_proceso,
          COUNTIF(UPPER(IFNULL(estado,'')) LIKE '%PENDIENTE%') as pendientes
        FROM \`${TABLES.relatorio}\`
      `;

      // Retiros stats - all in one query to avoid type casting issues
      const retirosStatsSQL = `
        SELECT 
          COUNTIF(IFNULL(CAST(cierrecontableTraspasoComision AS STRING), '') = '') as pendientes_pago,
          COUNTIF(UPPER(IFNULL(CAST(estadoRetiro AS STRING), '')) = 'ABIERTO') as pendientes_retiro
        FROM \`${TABLES.retiros}\`
      `;

      // Pendientes de traspaso: tramitadores sin estadoTraspaso aprobado
      const pendientesTraspasoSQL = `
        SELECT COUNT(*) as pendientes_traspaso
        FROM (
          SELECT placa, estadoTraspaso FROM \`${TABLES.servitram}\`
          UNION ALL
          SELECT placa, estadoTraspaso FROM \`${TABLES.gestramites}\`
        )
        WHERE placa IS NOT NULL AND placa != ''
          AND (UPPER(IFNULL(estadoTraspaso,'')) NOT LIKE '%APROBADO%' 
               AND UPPER(IFNULL(estadoTraspaso,'')) NOT LIKE '%MATRICULADO%')
      `;

      const [relStats, retirosStats, traspasoStats] = await Promise.all([
        safeQuery2("relatorio", relatorioStatsSQL),
        safeQuery2("retiros", retirosStatsSQL),
        safeQuery2("traspaso", pendientesTraspasoSQL),
      ]);

      const stats = {
        total: relStats[0]?.total || '0',
        aprobados: relStats[0]?.aprobados || '0',
        en_proceso: relStats[0]?.en_proceso || '0',
        pendientes: relStats[0]?.pendientes || '0',
        pendientes_pago: retirosStats[0]?.pendientes_pago || '0',
        pendientes_traspaso: traspasoStats[0]?.pendientes_traspaso || '0',
        pendientes_retiro: retirosStats[0]?.pendientes_retiro || '0',
      };

      return new Response(JSON.stringify({ stats }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
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
