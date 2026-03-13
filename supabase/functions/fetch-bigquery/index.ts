import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Create a JWT for GCP authentication using service account credentials
async function createGCPToken(serviceAccount: { client_email: string; private_key: string }): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: serviceAccount.client_email,
    scope: "https://www.googleapis.com/auth/bigquery.readonly https://www.googleapis.com/auth/drive.readonly",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };

  const encode = (obj: unknown) =>
    btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  const headerB64 = encode(header);
  const payloadB64 = encode(payload);
  const signingInput = `${headerB64}.${payloadB64}`;

  // Import the RSA private key
  const pemContent = serviceAccount.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\n/g, '');

  const binaryDer = Uint8Array.from(atob(pemContent), (c) => c.charCodeAt(0));

  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    binaryDer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    new TextEncoder().encode(signingInput)
  );

  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  const jwt = `${signingInput}.${sigB64}`;

  // Exchange JWT for access token
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });

  const tokenData = await tokenRes.json();
  if (!tokenRes.ok) {
    throw new Error(`GCP token error: ${JSON.stringify(tokenData)}`);
  }
  return tokenData.access_token;
}

// Run a BigQuery SQL query
async function queryBigQuery(accessToken: string, projectId: string, sql: string): Promise<unknown[]> {
  const url = `https://bigquery.googleapis.com/bigquery/v2/projects/${projectId}/queries`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query: sql,
      useLegacySql: false,
      maxResults: 10000,
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(`BigQuery error: ${JSON.stringify(data)}`);
  }

  if (!data.rows) return [];

  const fields = data.schema.fields.map((f: { name: string }) => f.name);
  return data.rows.map((row: { f: { v: string | null }[] }) => {
    const obj: Record<string, string | null> = {};
    row.f.forEach((cell, i) => {
      obj[fields[i]] = cell.v;
    });
    return obj;
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const serviceAccountJson = Deno.env.get("GCP_SERVICE_ACCOUNT_KEY");
    if (!serviceAccountJson) {
      throw new Error("GCP_SERVICE_ACCOUNT_KEY is not configured");
    }

    const serviceAccount = JSON.parse(serviceAccountJson);
    const projectId = serviceAccount.project_id || "sbc-data-int";
    const accessToken = await createGCPToken(serviceAccount);

    const url = new URL(req.url);
    const action = url.searchParams.get("action") || "search";
    const query = url.searchParams.get("q") || "";

    if (action === "schema") {
      // Discover table schemas
      const tables = [
        "sbc-data-int.relatorio_bq.relatorio_actual",
        "sbc-data-int.r_retiros_tramitadores.r_tramitadores_servitram_gmf",
        "sbc-data-int.r_retiros_tramitadores.r_tramitadores_gestramites",
        "sbc-data-int.r_retiros.r_retiros_gmf_2025",
      ];

      const schemas: Record<string, unknown> = {};
      for (const table of tables) {
        try {
          const sample = await queryBigQuery(
            accessToken,
            projectId,
            `SELECT * FROM \`${table}\` LIMIT 2`
          );
          schemas[table] = {
            columns: sample[0] ? Object.keys(sample[0]) : [],
            sample_rows: sample,
            row_count: sample.length,
          };
        } catch (e) {
          schemas[table] = { error: e instanceof Error ? e.message : String(e) };
        }
      }

      return new Response(JSON.stringify({ schemas }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "search" && query) {
      const q = query.trim();

      // Search in relatorio_actual by buyer name/ID or plate
      const vehiculosQuery = `
        SELECT * FROM \`sbc-data-int.relatorio_bq.relatorio_actual\`
        WHERE LOWER(CAST(placa AS STRING)) = LOWER('${q}')
           OR LOWER(CAST(id_comprador AS STRING)) LIKE LOWER('%${q}%')
           OR LOWER(CAST(nombre_completo AS STRING)) LIKE LOWER('%${q}%')
        LIMIT 100
      `;

      const vehiculos = await queryBigQuery(accessToken, projectId, vehiculosQuery);

      // Get retiros data
      const retirosQuery = `
        SELECT * FROM \`sbc-data-int.r_retiros.r_retiros_gmf_2025\`
        WHERE LOWER(CAST(placa AS STRING)) = LOWER('${q}')
           OR LOWER(CAST(id_comprador AS STRING)) LIKE LOWER('%${q}%')
        LIMIT 100
      `;
      const retiros = await queryBigQuery(accessToken, projectId, retirosQuery);

      // Get tramitadores servitram
      const servitramQuery = `
        SELECT * FROM \`sbc-data-int.r_retiros_tramitadores.r_tramitadores_servitram_gmf\`
        WHERE LOWER(CAST(placa AS STRING)) = LOWER('${q}')
        LIMIT 100
      `;
      const servitram = await queryBigQuery(accessToken, projectId, servitramQuery);

      // Get tramitadores gestramites
      const gestramitesQuery = `
        SELECT * FROM \`sbc-data-int.r_retiros_tramitadores.r_tramitadores_gestramites\`
        WHERE LOWER(CAST(placa AS STRING)) = LOWER('${q}')
        LIMIT 100
      `;
      const gestramites = await queryBigQuery(accessToken, projectId, gestramitesQuery);

      return new Response(JSON.stringify({
        vehiculos,
        retiros,
        servitram,
        gestramites,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Stats / dashboard
    if (action === "stats") {
      const statsQuery = `
        SELECT 
          COUNT(*) as total_vehiculos,
          COUNTIF(estado_traspaso = 'Aprobado') as aprobados,
          COUNTIF(estado_traspaso = 'En Proceso') as en_proceso,
          COUNTIF(estado_traspaso = 'Pendiente') as pendientes,
          COUNTIF(estado_traspaso = 'Rechazado') as rechazados
        FROM \`sbc-data-int.relatorio_bq.relatorio_actual\`
      `;
      const stats = await queryBigQuery(accessToken, projectId, statsQuery);

      return new Response(JSON.stringify({ stats: stats[0] || {} }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Acción no válida. Use action=search&q=..., action=stats, o action=schema" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: unknown) {
    console.error("BigQuery error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
