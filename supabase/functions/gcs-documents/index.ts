import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function normalizeBucketName(value: string): string {
  return value
    .trim()
    .replace(/^gs:\/\//, "")
    .replace(/^https?:\/\/storage.googleapis.com\//, "")
    .replace(/^https?:\/\/console\.cloud\.google\.com\/storage\/browser\//, "")
    .replace(/^buckets\//, "")
    .replace(/\?.*$/, "")
    .replace(/\/.*$/, "");
}

async function readErrorBody(response: Response): Promise<string> {
  const contentType = response.headers.get("content-type") || "";

  try {
    if (contentType.includes("application/json")) {
      return JSON.stringify(await response.json());
    }

    return await response.text();
  } catch {
    return "No se pudo leer la respuesta del proveedor";
  }
}

async function createGCPToken(sa: { client_email: string; private_key: string }, scopes: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: sa.client_email,
    scope: scopes,
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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const saJson = Deno.env.get("GCP_SERVICE_ACCOUNT_KEY");
    if (!saJson) throw new Error("GCP_SERVICE_ACCOUNT_KEY not configured");

    const rawBucketName = Deno.env.get("GCS_BUCKET_NAME");
    if (!rawBucketName) throw new Error("GCS_BUCKET_NAME not configured");

    const bucketName = normalizeBucketName(rawBucketName);
    if (!bucketName) throw new Error("GCS_BUCKET_NAME is empty after normalization");

    const sa = JSON.parse(saJson);
    const token = await createGCPToken(sa, "https://www.googleapis.com/auth/devstorage.read_write");

    console.log("GCS config loaded", {
      bucketConfigured: true,
      bucketName,
      serviceAccountEmail: sa.client_email,
    });

    const url = new URL(req.url);
    let action = url.searchParams.get("action");

    if (!action && req.method !== "GET" && (req.headers.get("content-type") || "").includes("application/json")) {
      const requestJson = await req.clone().json().catch(() => null);
      if (requestJson && typeof requestJson.action === "string") {
        action = requestJson.action;
      }
    }

    // ── UPLOAD ──
    if (action === "upload" && req.method === "POST") {
      const formData = await req.formData();
      const file = formData.get("file") as File;
      const documentoComprador = formData.get("documento_comprador") as string;
      const placa = formData.get("placa") as string | null;

      if (!file || !documentoComprador) {
        return new Response(JSON.stringify({ error: "Archivo y documento_comprador requeridos" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const timestamp = Date.now();
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const gcsPath = `documentos/${documentoComprador}/${timestamp}_${safeName}`;

      // Upload to GCS
      const uploadUrl = `https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(bucketName)}/o?uploadType=media&name=${encodeURIComponent(gcsPath)}`;
      const fileBuffer = await file.arrayBuffer();

      const uploadRes = await fetch(uploadUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": file.type || "application/octet-stream",
        },
        body: fileBuffer,
      });

      if (!uploadRes.ok) {
        const err = await readErrorBody(uploadRes);
        if (uploadRes.status === 404) {
          throw new Error(`Bucket de Google Cloud no encontrado: ${bucketName}. Verifica el secreto GCS_BUCKET_NAME y los permisos de la cuenta de servicio.`);
        }
        throw new Error(`GCS upload failed (${uploadRes.status}): ${err}`);
      }

      const gcsUrl = `https://storage.googleapis.com/${bucketName}/${gcsPath}`;

      // Save metadata to Supabase
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const supabase = createClient(supabaseUrl, supabaseKey);

      const { data, error } = await supabase.from("documentos").insert({
        documento_comprador: documentoComprador,
        placa: placa || null,
        nombre_archivo: file.name,
        tipo_archivo: file.type,
        tamano: file.size,
        gcs_path: gcsPath,
        gcs_url: gcsUrl,
      }).select().single();

      if (error) throw new Error(`DB insert error: ${error.message}`);

      return new Response(JSON.stringify({ success: true, documento: data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── LIST documents ──
    if (action === "list") {
      const documentoComprador = url.searchParams.get("documento_comprador");
      const placa = url.searchParams.get("placa");

      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const supabase = createClient(supabaseUrl, supabaseKey);

      let query = supabase.from("documentos").select("*").order("created_at", { ascending: false });
      if (documentoComprador) query = query.eq("documento_comprador", documentoComprador);
      if (placa) query = query.eq("placa", placa);

      const { data, error } = await query;
      if (error) throw new Error(`DB query error: ${error.message}`);

      return new Response(JSON.stringify({ documentos: data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── DELETE ──
    if (action === "delete" && req.method === "POST") {
      const { id, gcs_path } = await req.json();

      // Delete from GCS
      const deleteUrl = `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucketName)}/o/${encodeURIComponent(gcs_path)}`;
      await fetch(deleteUrl, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      // Delete metadata from Supabase
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const supabase = createClient(supabaseUrl, supabaseKey);

      await supabase.from("documentos").delete().eq("id", id);

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── SIGNED URL (for private buckets) ──
    if (action === "signed-url") {
      const gcsPath = url.searchParams.get("path");
      if (!gcsPath) {
        return new Response(JSON.stringify({ error: "path requerido" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // For simplicity, return the public URL. If bucket is private, we'd generate a signed URL.
      const publicUrl = `https://storage.googleapis.com/${bucketName}/${gcsPath}`;
      return new Response(JSON.stringify({ url: publicUrl }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "action requerido: upload, list, delete, signed-url" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: unknown) {
    console.error("GCS error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
