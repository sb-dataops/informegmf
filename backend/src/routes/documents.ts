import { Hono } from "hono";
import { getAdminClient } from "../services/supabase.js";
import { getBucket, getBucketName, parseJsonRecord } from "../services/gcs.js";

const router = new Hono();

router.all("/", async (c) => {
  try {
    const bucket = getBucket();
    const bucketName = getBucketName();

    let serviceAccountEmail: string | null = null;
    try {
      const credentials = await bucket.storage.authClient.getCredentials();
      serviceAccountEmail = credentials.client_email ?? null;
    } catch {
      serviceAccountEmail = null;
    }

    console.log("GCS config loaded", {
      bucketConfigured: true,
      bucketName,
      serviceAccountEmail,
    });

    let action = c.req.query("action") || "";

    if (!action && c.req.method !== "GET" && (c.req.header("content-type") || "").includes("application/json")) {
      try {
        const requestJson = await c.req.json();
        if (requestJson && typeof requestJson.action === "string") {
          action = requestJson.action;
        }
      } catch {
        // ignore
      }
    }

    if (action === "diagnose-permissions") {
      const tempObjectPath = `diagnostico-permisos/${Date.now()}.txt`;
      const tempFile = bucket.file(tempObjectPath);

      const bucketCheck: { ok: boolean; status: number | null; detail: string | null } = {
        ok: false,
        status: null,
        detail: null,
      };
      try {
        const [metadata] = await bucket.getMetadata();
        bucketCheck.ok = true;
        bucketCheck.status = 200;
        bucketCheck.detail = null;
        void metadata;
      } catch (err) {
        const e = err as { code?: number; message?: string };
        bucketCheck.ok = false;
        bucketCheck.status = typeof e.code === "number" ? e.code : null;
        bucketCheck.detail = e.message ?? String(err);
      }

      const listCheck: { ok: boolean; status: number | null; detail: string | null } = {
        ok: false,
        status: null,
        detail: null,
      };
      try {
        await bucket.getFiles({ maxResults: 1 });
        listCheck.ok = true;
        listCheck.status = 200;
        listCheck.detail = null;
      } catch (err) {
        const e = err as { code?: number; message?: string };
        listCheck.ok = false;
        listCheck.status = typeof e.code === "number" ? e.code : null;
        listCheck.detail = e.message ?? String(err);
      }

      const writeCheck: { ok: boolean; status: number | null; detail: string | null } = {
        ok: false,
        status: null,
        detail: null,
      };
      try {
        await tempFile.save(Buffer.from(`diagnostic check ${new Date().toISOString()}`), {
          metadata: { contentType: "text/plain" },
        });
        writeCheck.ok = true;
        writeCheck.status = 200;
        writeCheck.detail = null;
      } catch (err) {
        const e = err as { code?: number; message?: string };
        writeCheck.ok = false;
        writeCheck.status = typeof e.code === "number" ? e.code : null;
        writeCheck.detail = e.message ?? String(err);
      }

      const deleteCheck: { ok: boolean | null; status: number | null; detail: string | null } = {
        ok: null,
        status: null,
        detail: null,
      };
      if (writeCheck.ok) {
        try {
          await tempFile.delete();
          deleteCheck.ok = true;
          deleteCheck.status = 204;
          deleteCheck.detail = null;
        } catch (err) {
          const e = err as { code?: number; message?: string };
          deleteCheck.ok = false;
          deleteCheck.status = typeof e.code === "number" ? e.code : null;
          deleteCheck.detail = e.message ?? String(err);
        }
      }

      return c.json({
        bucket: bucketName,
        service_account: serviceAccountEmail,
        checks: {
          bucket_metadata: bucketCheck,
          list_objects: listCheck,
          write_object: writeCheck,
          delete_object: deleteCheck,
        },
      });
    }

    if (action === "upload" && c.req.method === "POST") {
      const formData = await c.req.parseBody();
      const file = formData.file as File | undefined;
      const documentoComprador = typeof formData.documento_comprador === "string" ? formData.documento_comprador : "";
      const placa = typeof formData.placa === "string" ? formData.placa : null;
      const placasRaw = typeof formData.placas === "string" ? formData.placas : null;
      const valorSoporteRaw = typeof formData.valor_soporte === "string" ? formData.valor_soporte : null;
      const valoresPorPlacaRaw = parseJsonRecord(formData.valores_por_placa);

      const placas: string[] = placasRaw
        ? (JSON.parse(placasRaw) as unknown[])
            .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
            .map((item) => item.trim().toUpperCase())
        : placa
          ? [placa.trim().toUpperCase()]
          : [];

      const uniquePlacas = Array.from(new Set(placas));
      const fallbackValor = Number(valorSoporteRaw || 0);
      const valoresPorPlaca: Record<string, number> = Object.fromEntries(
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
        return c.json({ error: "Archivo, documento_comprador, al menos una placa y un valor válido por placa son requeridos" }, 400);
      }

      const timestamp = Date.now();
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const gcsPath = `documentos/${documentoComprador}/${timestamp}_${safeName}`;

      const fileBuffer = Buffer.from(await file.arrayBuffer());

      try {
        await bucket.file(gcsPath).save(fileBuffer, {
          metadata: { contentType: file.type || "application/octet-stream" },
        });
      } catch (err) {
        const e = err as { code?: number; message?: string };
        if (e.code === 404) {
          throw new Error(`Bucket de Google Cloud no encontrado: ${bucketName}. Verifica el secreto GCS_BUCKET_NAME y los permisos de la cuenta de servicio.`);
        }
        throw new Error(`GCS upload failed (${e.code ?? "?"}): ${e.message ?? String(err)}`);
      }

      const gcsUrl = `https://storage.googleapis.com/${bucketName}/${gcsPath}`;

      const supabase = getAdminClient();

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

      try {
        const { data: recipients } = await supabase.rpc("get_notification_recipients");
        if (recipients && recipients.length > 0) {
          const placasStr = uniquePlacas.join(", ");
          const title = "Nuevo soporte cargado";
          const message = `Archivo: ${file.name} | Comprador: ${documentoComprador} | Placas: ${placasStr}`;
          const firstDocId = data?.[0]?.id ?? null;

          const notifRows = recipients.map((r: { user_id: string; email: string; display_name: string }) => ({
            user_id: r.user_id,
            title,
            message,
            documento_ref: firstDocId,
          }));

          await supabase.from("notifications").insert(notifRows);
        }
      } catch (notifErr) {
        console.error("Error creating notifications:", notifErr);
      }

      return c.json({ success: true, documentos: data, documento: data?.[0] ?? null });
    }

    if (action === "list") {
      const documentoComprador = c.req.query("documento_comprador");
      const placaParam = c.req.query("placa")?.trim().toUpperCase();

      const supabase = getAdminClient();

      let query = supabase.from("documentos").select("*").order("created_at", { ascending: false });
      if (documentoComprador) query = query.eq("documento_comprador", documentoComprador);
      if (placaParam) query = query.contains("placas", [placaParam]);

      const { data, error } = await query;
      if (error) throw new Error(`DB query error: ${error.message}`);

      return c.json({ documentos: data });
    }

    if (action === "delete" && c.req.method === "POST") {
      const { id, gcs_path } = await c.req.json();

      if (!id && !gcs_path) {
        return c.json({ error: "id o gcs_path requerido" }, 400);
      }

      if (gcs_path) {
        try {
          await bucket.file(gcs_path).delete();
        } catch {
          // matches original behavior: it does not check the response status
        }
      }

      const supabase = getAdminClient();

      const deleteQuery = gcs_path
        ? supabase.from("documentos").delete().eq("gcs_path", gcs_path)
        : supabase.from("documentos").delete().eq("id", id);

      const { error } = await deleteQuery;
      if (error) throw new Error(`DB delete error: ${error.message}`);

      return c.json({ success: true });
    }

    if (action === "view") {
      const gcsPath = c.req.query("path");
      if (!gcsPath) {
        return c.json({ error: "path requerido" }, 400);
      }

      const file = bucket.file(gcsPath);
      let buffer: Buffer;
      let contentType = "application/octet-stream";
      try {
        const [downloaded] = await file.download();
        buffer = downloaded;
        const [metadata] = await file.getMetadata();
        if (typeof metadata.contentType === "string" && metadata.contentType.length > 0) {
          contentType = metadata.contentType;
        }
      } catch (err) {
        const e = err as { code?: number; message?: string };
        throw new Error(`GCS view failed (${e.code ?? "?"}): ${e.message ?? String(err)}`);
      }

      return new Response(buffer, {
        headers: {
          "Content-Type": contentType,
          "Content-Disposition": "inline",
          "Cache-Control": "private, max-age=300",
        },
      });
    }

    if (action === "signed-url") {
      const gcsPath = c.req.query("path");
      if (!gcsPath) {
        return c.json({ error: "path requerido" }, 400);
      }

      const publicUrl = `https://storage.googleapis.com/${bucketName}/${gcsPath}`;
      return c.json({ url: publicUrl });
    }

    return c.json({ error: "action requerido: upload, list, delete, view, signed-url" }, 400);
  } catch (error: unknown) {
    console.error("GCS error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return c.json({ error: message }, 500);
  }
});

export const documentsRouter = router;
