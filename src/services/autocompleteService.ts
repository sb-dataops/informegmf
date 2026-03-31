export interface AutocompleteOption {
  value: string;
  extra: string | null;
}

export type AutocompleteField = "subasta" | "comprador" | "documento" | "placa";

export interface AutocompleteContext {
  subasta?: string[];
  comprador?: string[];
  documento?: string[];
  placa?: string[];
}

export async function fetchAutocomplete(
  field: AutocompleteField,
  query: string,
  context?: AutocompleteContext,
): Promise<AutocompleteOption[]> {
  if (!query || query.length < 2) return [];

  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
  const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  
  const params = new URLSearchParams({
    action: "autocomplete",
    field,
    q: query,
  });

  // Add context filters (pipe-separated for multi-values)
  if (context) {
    if (context.subasta?.length && field !== "subasta") params.set("ctx_subasta", context.subasta.join("|"));
    if (context.comprador?.length && field !== "comprador") params.set("ctx_comprador", context.comprador.join("|"));
    if (context.documento?.length && field !== "documento") params.set("ctx_documento", context.documento.join("|"));
    if (context.placa?.length && field !== "placa") params.set("ctx_placa", context.placa.join("|"));
  }

  const url = `https://${projectId}.supabase.co/functions/v1/fetch-bigquery?${params.toString()}`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${anonKey}`,
      apikey: anonKey,
    },
  });

  if (!res.ok) return [];

  const data = await res.json();
  return data.options || [];
}

export interface MultiSearchFilters {
  subasta?: string;
  comprador?: string;
  documento?: string;
  placa?: string;
  fechaSubastaDesde?: string;
  fechaSubastaHasta?: string;
  fechaPazSalvoDesde?: string;
  fechaPazSalvoHasta?: string;
}

export async function multiSearch(filters: MultiSearchFilters) {
  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
  const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  const params = new URLSearchParams({ action: "multi-search" });
  if (filters.subasta) params.set("subasta", filters.subasta);
  if (filters.comprador) params.set("comprador", filters.comprador);
  if (filters.documento) params.set("documento", filters.documento);
  if (filters.placa) params.set("placa", filters.placa);

  const url = `https://${projectId}.supabase.co/functions/v1/fetch-bigquery?${params.toString()}`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${anonKey}`,
      apikey: anonKey,
    },
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Error en la búsqueda");
  }

  return res.json();
}
