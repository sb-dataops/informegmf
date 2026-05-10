import { SearchResult, VehiculoConsolidado } from "@/types";
import { isCondicionalRechazado, normalizePlaca } from "@/lib/vehicle-filters";

// Constructor de un VehiculoConsolidado vacío con todos los campos en sus
// defaults (null o "" según corresponda). Centralizar aquí evita duplicar
// el bloque enorme de campos en cada caller.
export function createEmptyVehiculo(placa: string): VehiculoConsolidado {
  return {
    placa,
    descripcion: "",
    fecha: null, subasta: null, lote: null, estado: null,
    marca: null, linea: null, modelo: null, mayor_oferta: null,
    transito: null, tramitador: null,
    inicioTramiteFecha: null, cierreContableFecha: null,
    envioDocFirmaFecha: null, docsConTramitadorFecha: null,
    fechaAprobacionTramite: null, fechaEntregaVehiculo: null,
    estadoRetiro: null, comentarios: null,
    fechaRecibidoImprontas: null, estadoTraspaso: null,
    observacion: null, fechaAprobadoRunt: null, fechaTp: null,
    comprador: null, documento: null, email: null, movil: null,
    ciudadComprador: null, departamentoComprador: null,
    fechaAprobacionVendedor: null,
  };
}

export function normalizeDocumento(
  value: string | null | undefined,
): string | null {
  const normalized = (value || "").trim();
  return normalized || null;
}

export function getAllowedRelatorioRows(result: SearchResult) {
  return result.relatorio.filter((row) => !isCondicionalRechazado(row.estado));
}

export function buildAllowedDocumentosByPlaca(
  result: SearchResult,
): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();

  getAllowedRelatorioRows(result).forEach((row) => {
    const placa = normalizePlaca(row.placa);
    const documento = normalizeDocumento(row.documento);
    if (!placa || !documento) return;

    if (!map.has(placa)) {
      map.set(placa, new Set());
    }

    map.get(placa)!.add(documento);
  });

  return map;
}

// Parsea una fecha string a timestamp comparable. Intenta dd/mm/yyyy primero
// para evitar que Date.parse la interprete como mm/dd/yyyy.
export function parseSortableDate(value: string | null | undefined): number {
  if (!value) return 0;

  const trimmed = value.trim();
  const match = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (match) {
    const [, day, month, year] = match;
    const fullYear = year.length === 2 ? Number(`20${year}`) : Number(year);
    return new Date(fullYear, Number(month) - 1, Number(day)).getTime();
  }

  const parsed = Date.parse(trimmed);
  if (!Number.isNaN(parsed)) return parsed;

  return 0;
}

// Devuelve el timestamp más reciente entre los campos de fecha de un row de tramitador.
// Se usa para ordenar tramitadores cronológicamente al consolidar.
export function getTramitadorSortTime(
  row: SearchResult["servitram"][number],
): number {
  return Math.max(
    parseSortableDate(row.fechaTp),
    parseSortableDate(row.fechaAprobadoRunt),
    parseSortableDate(row.fechaRecibidoImprontas),
    parseSortableDate(row.fechaOkDocsTraspaso),
    parseSortableDate(row.fechaEnvioFirmasVendedor),
    parseSortableDate(row.fechasFirmasComprador),
    parseSortableDate(row.fechaDeAsignacion),
    parseSortableDate(row.fechaDeSubasta),
  );
}
