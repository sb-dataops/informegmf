export interface DocumentoRecord {
  id: string;
  documento_comprador: string;
  placa: string | null;
  placas: string[];
  valor_soporte: number;
  nombre_archivo: string;
  tipo_archivo: string | null;
  tamano: number | null;
  gcs_path: string;
  gcs_url: string | null;
  created_at: string;
}

export interface GroupedDocumentoRecord {
  id: string;
  documento_comprador: string;
  nombre_archivo: string;
  tipo_archivo: string | null;
  tamano: number | null;
  gcs_path: string;
  gcs_url: string | null;
  created_at: string;
  soportes: Array<{
    placa: string;
    valor_soporte: number;
  }>;
}

const FUNCTION_NAME = "gcs-documents";

function buildUrl(action: string, params?: Record<string, string>): string {
  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
  const base = `https://${projectId}.supabase.co/functions/v1/${FUNCTION_NAME}?action=${action}`;
  if (!params) return base;
  const qs = Object.entries(params).map(([k, v]) => `&${k}=${encodeURIComponent(v)}`).join("");
  return base + qs;
}

function headers(): Record<string, string> {
  const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  return {
    Authorization: `Bearer ${anonKey}`,
    apikey: anonKey,
  };
}

export async function uploadDocumento(
  file: File,
  documentoComprador: string,
  valoresPorPlaca: Record<string, number>,
): Promise<DocumentoRecord[]> {
  const normalizedEntries = Object.entries(valoresPorPlaca)
    .map(([placa, valor]) => [placa.trim().toUpperCase(), Number(valor)] as const)
    .filter(([placa, valor]) => placa.length > 0 && Number.isFinite(valor) && valor > 0);

  const placas = normalizedEntries.map(([placa]) => placa);
  const valoresNormalizados = Object.fromEntries(normalizedEntries);

  const formData = new FormData();
  formData.append("file", file);
  formData.append("documento_comprador", documentoComprador);
  formData.append("placas", JSON.stringify(placas));
  formData.append("valores_por_placa", JSON.stringify(valoresNormalizados));
  formData.append("valor_soporte", String(valoresNormalizados[placas[0]] ?? 0));
  if (placas[0]) formData.append("placa", placas[0]);

  const res = await fetch(buildUrl("upload"), {
    method: "POST",
    headers: headers(),
    body: formData,
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Error subiendo documento");
  }

  const result = await res.json();
  if (Array.isArray(result.documentos)) return result.documentos;
  return result.documento ? [result.documento] : [];
}

export async function listDocumentos(params: {
  documento_comprador?: string;
  placa?: string;
}): Promise<DocumentoRecord[]> {
  const queryParams: Record<string, string> = {};
  if (params.documento_comprador) queryParams.documento_comprador = params.documento_comprador;
  if (params.placa) queryParams.placa = params.placa;

  const res = await fetch(buildUrl("list", queryParams), { headers: headers() });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Error listando documentos");
  }

  const result = await res.json();
  return result.documentos;
}

export async function fetchDocumentoBlob(gcsPath: string): Promise<Blob> {
  const res = await fetch(buildUrl("view", { path: gcsPath }), {
    headers: headers(),
  });

  if (!res.ok) {
    const contentType = res.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const err = await res.json();
      throw new Error(err.error || "Error cargando documento");
    }

    throw new Error(await res.text() || "Error cargando documento");
  }

  return res.blob();
}

export async function deleteDocumento(id: string, gcsPath: string): Promise<void> {
  const res = await fetch(buildUrl("delete"), {
    method: "POST",
    headers: { ...headers(), "Content-Type": "application/json" },
    body: JSON.stringify({ id, gcs_path: gcsPath }),
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Error eliminando documento");
  }
}

export function groupDocumentosByArchivo(documentos: DocumentoRecord[]): GroupedDocumentoRecord[] {
  const grouped = new Map<string, GroupedDocumentoRecord>();

  documentos.forEach((documento) => {
    const key = documento.gcs_path || documento.id;
    const existing = grouped.get(key);
    const placas = documento.placas?.length ? documento.placas : documento.placa ? [documento.placa] : [];
    const soportes = placas.map((placa) => ({
      placa: placa.toUpperCase(),
      valor_soporte: Number(documento.valor_soporte || 0),
    }));

    if (!existing) {
      grouped.set(key, {
        id: documento.id,
        documento_comprador: documento.documento_comprador,
        nombre_archivo: documento.nombre_archivo,
        tipo_archivo: documento.tipo_archivo,
        tamano: documento.tamano,
        gcs_path: documento.gcs_path,
        gcs_url: documento.gcs_url,
        created_at: documento.created_at,
        soportes,
      });
      return;
    }

    const seen = new Set(existing.soportes.map((item) => `${item.placa}-${item.valor_soporte}`));
    soportes.forEach((soporte) => {
      const signature = `${soporte.placa}-${soporte.valor_soporte}`;
      if (!seen.has(signature)) {
        existing.soportes.push(soporte);
        seen.add(signature);
      }
    });
  });

  return Array.from(grouped.values()).sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
}

export function sumValorSoportesByPlaca(documentos: DocumentoRecord[], placa: string): number {
  const placaNormalizada = placa.toUpperCase();
  return documentos.reduce((acc, documento) => {
    const placas = documento.placas?.length ? documento.placas : documento.placa ? [documento.placa] : [];
    return placas.map((item) => item.toUpperCase()).includes(placaNormalizada)
      ? acc + Number(documento.valor_soporte || 0)
      : acc;
  }, 0);
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
