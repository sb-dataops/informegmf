import { SearchResult, Comprador, VehiculoConsolidado } from "@/types";
import {
  isCondicionalRechazado,
  matchesNormalizedSearch,
  normalizePlaca,
  normalizeSearchText,
} from "@/lib/vehicle-filters";
import { consolidateVehiculosBase } from "./consolidate";
import { getAllowedRelatorioRows } from "./consolidate-helpers";

// Extrae compradores únicos de los resultados de búsqueda.
export function extractCompradores(result: SearchResult): Comprador[] {
  const map = new Map<string, Comprador>();

  const addBuyer = (
    doc: string | null,
    name: string | null,
    email?: string | null,
    movil?: string | null,
    dir?: string | null,
    ciudad?: string | null,
    depto?: string | null,
  ) => {
    if (!doc) return;
    if (!map.has(doc)) {
      map.set(doc, {
        documento: doc,
        nombre: name || "Sin nombre",
        email: email || undefined,
        movil: movil || undefined,
        direccion: dir || undefined,
        ciudad: ciudad || undefined,
        departamento: depto || undefined,
      });
    }
  };

  getAllowedRelatorioRows(result)
    .filter((r) => !isCondicionalRechazado(r.estado))
    .forEach((r) =>
      addBuyer(
        r.documento,
        r.comprador,
        r.email,
        r.movil,
        r.direccion,
        r.ciudad_comprador,
        r.departamento_comprador,
      ),
    );

  return Array.from(map.values());
}

export interface SubastaMatch {
  nombre: string;
  codigo: string | null;
  vehiculoCount: number;
}

export function extractUniqueSubastas(
  result: SearchResult,
  query: string,
): SubastaMatch[] {
  if (!query?.trim()) return [];

  const subastaMap = new Map<
    string,
    { nombre: string; codigo: string | null; placas: Set<string> }
  >();

  getAllowedRelatorioRows(result)
    .filter((row) => matchesNormalizedSearch(row.subasta, query))
    .forEach((row) => {
      const key = normalizeSearchText(row.subasta);
      if (!key) return;
      if (!subastaMap.has(key)) {
        subastaMap.set(key, {
          nombre: row.subasta || key,
          codigo: null,
          placas: new Set(),
        });
      }
      const entry = subastaMap.get(key)!;
      const placa = normalizePlaca(row.placa);
      if (placa) entry.placas.add(placa);
    });

  return Array.from(subastaMap.values()).map((s) => ({
    nombre: s.nombre,
    codigo: s.codigo,
    vehiculoCount: s.placas.size,
  }));
}

export function extractVehiculosBySubasta(
  result: SearchResult,
  query: string,
): VehiculoConsolidado[] {
  if (!query?.trim()) return [];

  const matchedPlacas = new Set<string>();

  getAllowedRelatorioRows(result)
    .filter((row) => matchesNormalizedSearch(row.subasta, query))
    .forEach((row) => {
      const placa = normalizePlaca(row.placa);
      if (placa) matchedPlacas.add(placa);
    });

  if (matchedPlacas.size === 0) return [];

  return consolidateVehiculosBase(result, { placaFilter: matchedPlacas });
}

// Como extractVehiculosBySubasta pero TAMBIÉN incluye lotes con estado "venta con
// incumplimiento de pago" (o cualquier otro estado normalmente filtrado). Usar SOLO
// para el resumen de cobranza para que los incumplimientos sean visibles allí sin
// contaminar el resto del dashboard.
export function extractVehiculosBySubastaIncluyendoRechazados(
  result: SearchResult,
  query: string,
): VehiculoConsolidado[] {
  if (!query?.trim()) return [];

  const matchedPlacas = new Set<string>();

  result.relatorio
    .filter((row) => matchesNormalizedSearch(row.subasta, query))
    .forEach((row) => {
      const placa = normalizePlaca(row.placa);
      if (placa) matchedPlacas.add(placa);
    });

  if (matchedPlacas.size === 0) return [];

  return consolidateVehiculosBase(result, {
    placaFilter: matchedPlacas,
    allowedPlacas: null,
    includeRechazados: true,
  });
}
