import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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

function isLikelyJson(value: string): boolean {
  const trimmed = value.trim();
  return (trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]"));
}

function validateBucketSecret(rawBucketName: string): string {
  if (isLikelyJson(rawBucketName)) {
    throw new Error(
      "GCS_BUCKET_NAME está mal configurado: actualmente contiene un JSON de credenciales y debe contener únicamente el nombre del bucket (por ejemplo: mi-bucket-documentos).",
    );
  }

  const bucketName = normalizeBucketName(rawBucketName);

  if (!bucketName) {
    throw new Error("GCS_BUCKET_NAME está vacío después de normalizarse");
  }

  if (!/^[a-z0-9._-]+$/.test(bucketName)) {
    throw new Error(`GCS_BUCKET_NAME no es válido: ${bucketName}`);
  }

  return bucketName;
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

function parseJsonRecord(value: FormDataEntryValue | null): Record<string, unknown> {
  if (typeof value !== "string") return {};

  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
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
    btoa(JSON.stringify(obj)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

  const signingInput = `${encode(header)}.${encode(payload)}`;

  const pemContent = sa.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\n/g, "");

  const binaryDer = Uint8Array.from(atob(pemContent), (c) => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    binaryDer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    new TextEncoder().encode(signingInput),
  );

  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

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

    const bucketName = validateBucketSecret(rawBucketName);

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

    if (action === "diagnose-permissions") {
      const authHeaders = { Authorization: `Bearer ${token}` };
      const bucketApiBase = `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucketName)}`;
      const tempObjectPath = `diagnostico-permisos/${Date.now()}.txt`;
      const uploadUrl = `https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(bucketName)}/o?uploadType=media&name=${encodeURIComponent(tempObjectPath)}`;

      const bucketRes = await fetch(bucketApiBase, { headers: authHeaders });
      const listRes = await fetch(`${bucketApiBase}/o?maxResults=1`, { headers: authHeaders });
      const writeRes = await fetch(uploadUrl, {
        method: "POST",
        headers: {
          ...authHeaders,
          "Content-Type": "text/plain",
        },
        body: `diagnostic check ${new Date().toISOString()}`,
      });

      let deleteStatus: number | null = null;
      let deleteBody: string | null = null;

      if (writeRes.ok) {
        const deleteRes = await fetch(`${bucketApiBase}/o/${encodeURIComponent(tempObjectPath)}`, {
          method: "DELETE",
          headers: authHeaders,
        });
        deleteStatus = deleteRes.status;
        deleteBody = deleteRes.ok ? null : await readErrorBody(deleteRes);
      }

      return new Response(JSON.stringify({
        bucket: bucketName,
        service_account: sa.client_email,
        checks: {
          bucket_metadata: {
            ok: bucketRes.ok,
            status: bucketRes.status,
            detail: bucketRes.ok ? null : await readErrorBody(bucketRes),
          },
          list_objects: {
            ok: listRes.ok,
            status: listRes.status,
            detail: listRes.ok ? null : await readErrorBody(listRes),
          },
          write_object: {
            ok: writeRes.ok,
            status: writeRes.status,
            detail: writeRes.ok ? null : await readErrorBody(writeRes),
          },
          delete_object: {
            ok: deleteStatus === null ? null : deleteStatus >= 200 && deleteStatus < 300,
            status: deleteStatus,
            detail: deleteBody,
          },
        },
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "upload" && req.method === "POST") {
      const formData = await req.formData();
      const file = formData.get("file") as File;
      const documentoComprador = formData.get("documento_comprador") as string;
      const placa = formData.get("placa") as string | null;
      const placasRaw = formData.get("placas") as string | null;
      const valorSoporteRaw = formData.get("valor_soporte") as string | null;
      const valoresPorPlacaRaw = parseJsonRecord(formData.get("valores_por_placa"));

      const placas = placasRaw
        ? JSON.parse(placasRaw).filter((item: unknown): item is string => typeof item === "string" && item.trim().length > 0)
          .map((item: string) => item.trim().toUpperCase())
        : placa
          ? [placa.trim().toUpperCase()]
          : [];

      const uniquePlacas = Array.from(new Set(placas));
      const fallbackValor = Number(valorSoporteRaw || 0);
      const valoresPorPlaca = Object.fromEntries(
        uniquePlacas.map((placaItem) => {
          const rawValue = valoresPorPlacaRaw[placaItem];
          const parsedValue = typeof rawValue === "number" || typeof rawValue === "string"
            ? Number(rawValue)
            : fallbackValor;
          return [placaItem, parsedValue];
        }),
      );

      const valoresInvalidos = uniquePlacas.some((placaItem) => {
        const value = Number(valoresPorPlaca[placaItem]);
        return Number.isNaN(value) || value <= 0;
      });

      if (!file || !documentoComprador || uniquePlacas.length === 0 || valoresInvalidos) {
        return new Response(JSON.stringify({ error: "Archivo, documento_comprador, al menos una placa y un valor válido por placa son requeridos" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const timestamp = Date.now();
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const gcsPath = `documentos/${documentoComprador}/${timestamp}_${safeName}`;

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

      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const supabase = createClient(supabaseUrl, supabaseKey);

      const registros = uniquePlacas.map((placaItem) => ({
        documento_comprador: documentoComprador,
        placa: placaItem,
        placas: [placaItem],
        valor_soporte: Number(valoresPorPlaca[placaItem]),
        nombre_archivo: file.name,
        tipo_archivo: file.type,
        tamano: file.size,
        gcs_path: gcsPath,
        gcs_url: gcsUrl,
      }));

      const [insertResult, reviewStatusResult] = await Promise.all([
        supabase.from("documentos").insert(registros).select(),
        supabase.from("payment_review_status").upsert(
          uniquePlacas.map((placaItem) => ({ placa: placaItem })),
          { onConflict: "placa", ignoreDuplicates: true },
        ),
      ]);

      const { data, error } = insertResult;
      if (error) throw new Error(`DB insert error: ${error.message}`);
      if (reviewStatusResult.error) throw new Error(`Review status error: ${reviewStatusResult.error.message}`);

      return new Response(JSON.stringify({ success: true, documentos: data, documento: data?.[0] ?? null }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "list") {
      const documentoComprador = url.searchParams.get("documento_comprador");
      const placa = url.searchParams.get("placa")?.trim().toUpperCase();

      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const supabase = createClient(supabaseUrl, supabaseKey);

      let query = supabase.from("documentos").select("*").order("created_at", { ascending: false });
      if (documentoComprador) query = query.eq("documento_comprador", documentoComprador);
      if (placa) query = query.contains("placas", [placa]);

      const { data, error } = await query;
      if (error) throw new Error(`DB query error: ${error.message}`);

      return new Response(JSON.stringify({ documentos: data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "delete" && req.method === "POST") {
      const { id, gcs_path } = await req.json();

      if (!id && !gcs_path) {
        return new Response(JSON.stringify({ error: "id o gcs_path requerido" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (gcs_path) {
        const deleteUrl = `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucketName)}/o/${encodeURIComponent(gcs_path)}`;
        await fetch(deleteUrl, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        });
      }

      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const supabase = createClient(supabaseUrl, supabaseKey);

      const deleteQuery = gcs_path
        ? supabase.from("documentos").delete().eq("gcs_path", gcs_path)
        : supabase.from("documentos").delete().eq("id", id);

      const { error } = await deleteQuery;
      if (error) throw new Error(`DB delete error: ${error.message}`);

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "view") {
      const gcsPath = url.searchParams.get("path");
      if (!gcsPath) {
        return new Response(JSON.stringify({ error: "path requerido" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const objectUrl = `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucketName)}/o/${encodeURIComponent(gcsPath)}?alt=media`;
      const objectRes = await fetch(objectUrl, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!objectRes.ok) {
        throw new Error(`GCS view failed (${objectRes.status}): ${await readErrorBody(objectRes)}`);
      }

      return new Response(objectRes.body, {
        headers: {
          ...corsHeaders,
          "Content-Type": objectRes.headers.get("content-type") || "application/octet-stream",
          "Content-Disposition": "inline",
          "Cache-Control": "private, max-age=300",
        },
      });
    }

    if (action === "signed-url") {
      const gcsPath = url.searchParams.get("path");
      if (!gcsPath) {
        return new Response(JSON.stringify({ error: "path requerido" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const publicUrl = `https://storage.googleapis.com/${bucketName}/${gcsPath}`;
      return new Response(JSON.stringify({ url: publicUrl }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "action requerido: upload, list, delete, view, signed-url" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("GCS error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
