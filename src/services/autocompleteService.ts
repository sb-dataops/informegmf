export interface AutocompleteOption {
  value: string;
  extra: string | null;
}

export type AutocompleteField = "subasta" | "comprador" | "documento" | "placa";

export async function fetchAutocomplete(
  field: AutocompleteField,
  query: string,
): Promise<AutocompleteOption[]> {
  if (!query || query.length < 2) return [];

  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
  const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const url = `https://${projectId}.supabase.co/functions/v1/fetch-bigquery?action=autocomplete&field=${field}&q=${encodeURIComponent(query)}`;

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
