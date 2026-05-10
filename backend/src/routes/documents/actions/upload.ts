import type { Context } from "hono";
import type { Bucket } from "@google-cloud/storage";
import { getAdminClient } from "../../../services/supabase.js";
import { parseJsonRecord } from "../../../services/gcs.js";

export interface UploadDeps {
  bucket: Bucket;
  bucketName: string;
}

export async function uploadDocument(
  c: Context,
  deps: UploadDeps,
): Promise<Response> {
  const { bucket, bucketName } = deps;
  const formData = await c.req.parseBody();
  const file = formData.file as File | undefined;
  const documentoComprador =
    typeof formData.documento_comprador === "string"
      ? formData.documento_comprador
      : "";
  const placa = typeof formData.placa === "string" ? formData.placa : null;
  const placasRaw = typeof formData.placas === "string" ? formData.placas : null;
  const valorSoporteRaw =
    typeof formData.valor_soporte === "string" ? formData.valor_soporte : null;
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
      const parsedValue =
        typeof rawValue === "number" || typeof rawValue === "string"
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
    return c.json(
      {
        error:
          "Archivo, documento_comprador, al menos una placa y un valor válido por placa son requeridos",
      },
      400,
    );
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
      throw new Error(
        `Bucket de Google Cloud no encontrado: ${bucketName}. Verifica el secreto GCS_BUCKET_NAME y los permisos de la cuenta de servicio.`,
      );
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
  if (reviewStatusResult.error) {
    throw new Error(`Review status error: ${reviewStatusResult.error.message}`);
  }

  // Notifications (best-effort, no falla el upload si falla)
  try {
    const { data: recipients } = await supabase.rpc("get_notification_recipients");
    if (recipients && recipients.length > 0) {
      const placasStr = uniquePlacas.join(", ");
      const title = "Nuevo soporte cargado";
      const message = `Archivo: ${file.name} | Comprador: ${documentoComprador} | Placas: ${placasStr}`;
      const firstDocId = data?.[0]?.id ?? null;

      const notifRows = recipients.map(
        (r: { user_id: string; email: string; display_name: string }) => ({
          user_id: r.user_id,
          title,
          message,
          documento_ref: firstDocId,
        }),
      );
      await supabase.from("notifications").insert(notifRows);
    }
  } catch (notifErr) {
    console.error("Error creating notifications:", notifErr);
  }

  return c.json({ success: true, documentos: data, documento: data?.[0] ?? null });
}
