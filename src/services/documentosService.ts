export interface DocumentoRecord {
  id: string;
  documento_comprador: string;
  placa: string | null;
  nombre_archivo: string;
  tipo_archivo: string | null;
  tamano: number | null;
  gcs_path: string;
  gcs_url: string | null;
  created_at: string;
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
  placa?: string
): Promise<DocumentoRecord> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("documento_comprador", documentoComprador);
  if (placa) formData.append("placa", placa);

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
  return result.documento;
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

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
