import {
  SearchResult,
  DashboardStatsData,
  FilteredLotsResult,
  Comprador,
  VehiculoConsolidado,
} from "@/types";
import { buildAllowedPlacasFromRelatorio, isAllowedPlaca, isCondicionalRechazado, matchesNormalizedSearch, normalizePlaca } from "@/lib/vehicle-filters";

const FUNCTION_NAME = "fetch-bigquery";

export async function searchBigQuery(query: string): Promise<SearchResult> {
  // supabase.functions.invoke doesn't support query params well for GET,
  // so let's use fetch directly
  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
  const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const url = `https://${projectId}.supabase.co/functions/v1/${FUNCTION_NAME}?action=search&q=${encodeURIComponent(query)}`;

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

export async function fetchDashboardStats(): Promise<DashboardStatsData> {
  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
  const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const url = `https://${projectId}.supabase.co/functions/v1/${FUNCTION_NAME}?action=stats`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${anonKey}`,
      apikey: anonKey,
    },
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Error obteniendo estadísticas");
  }

  const result = await res.json();
  return result.stats;
}

export async function fetchFilteredLots(category: string): Promise<FilteredLotsResult> {
  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
  const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const url = `https://${projectId}.supabase.co/functions/v1/${FUNCTION_NAME}?action=filter&category=${encodeURIComponent(category)}`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${anonKey}`,
      apikey: anonKey,
    },
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Error obteniendo datos filtrados");
  }

  return res.json();
}

// Extract unique buyers from search results
export function extractCompradores(result: SearchResult): Comprador[] {
  const map = new Map<string, Comprador>();
  const allowedPlacas = buildAllowedPlacasFromRelatorio(result.relatorio);
  const hasRelatorioFilter = allowedPlacas.size > 0;

  const addBuyer = (doc: string | null, name: string | null, email?: string | null, movil?: string | null, dir?: string | null, ciudad?: string | null, depto?: string | null) => {
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

  const isAllowed = (placa: string | null | undefined) => {
    if (!hasRelatorioFilter) return true;
    return isAllowedPlaca(placa, allowedPlacas);
  };

  result.relatorio
    .filter((r) => !isCondicionalRechazado(r.estado))
    .forEach((r) =>
      addBuyer(r.documento, r.comprador, r.email, r.movil, r.direccion, r.ciudad_comprador, r.departamento_comprador)
    );

  result.retiros
    .filter((r) => isAllowed(r.placa))
    .forEach((r) =>
      addBuyer(r.documento, r.comprador, r.email, r.movil, r.direccion, r.ciudadComprador, r.departamentoComprador)
    );

  result.servitram
    .filter((r) => isAllowed(r.placa))
    .forEach((r) => addBuyer(r.documento, r.comprador, r.email, r.movil, r.direccion));

  result.gestramites
    .filter((r) => isAllowed(r.placa))
    .forEach((r) => addBuyer(r.documento, r.comprador, r.email, r.movil, r.direccion));

  return Array.from(map.values());
}

function consolidateVehiculosBase(
  result: SearchResult,
  options?: {
    documento?: string;
    placaFilter?: Set<string>;
    allowedPlacas?: Set<string> | null;
  },
): VehiculoConsolidado[] {
  const vehicleMap = new Map<string, VehiculoConsolidado>();
  const { documento, placaFilter, allowedPlacas = buildAllowedPlacasFromRelatorio(result.relatorio) } = options || {};

  const matchesDocumento = (value: string | null | undefined) => !documento || value === documento;
  const matchesPlaca = (value: string | null | undefined) => {
    if (!placaFilter) return true;
    const placa = normalizePlaca(value);
    return !!placa && placaFilter.has(placa);
  };
  const matchesAllowedPlaca = (value: string | null | undefined) => {
    if (allowedPlacas === null) return true;
    return isAllowedPlaca(value, allowedPlacas);
  };

  const getVehicle = (placa: string): VehiculoConsolidado => {
    if (!vehicleMap.has(placa)) {
      vehicleMap.set(placa, {
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
      });
    }
    return vehicleMap.get(placa)!;
  };

  result.relatorio
    .filter((r) => r.placa && matchesDocumento(r.documento) && matchesPlaca(r.placa))
    .filter((r) => !isCondicionalRechazado(r.estado))
    .forEach((r) => {
      const placa = normalizePlaca(r.placa);
      if (!placa) return;
      const v = getVehicle(placa);
      v.descripcion = r.descripcion || v.descripcion;
      v.fecha = r.fecha || v.fecha;
      v.subasta = r.subasta || v.subasta;
      v.lote = r.lote || v.lote;
      v.estado = r.estado || v.estado;
      v.marca = r.marca || v.marca;
      v.linea = r.linea || v.linea;
      v.modelo = r.modelo || v.modelo;
      v.mayor_oferta = r.mayor_oferta || v.mayor_oferta;
      v.comprador = r.comprador || v.comprador;
      v.documento = r.documento || v.documento;
      v.email = r.email || v.email;
      v.movil = r.movil || v.movil;
      v.ciudadComprador = r.ciudad_comprador || v.ciudadComprador;
      v.departamentoComprador = r.departamento_comprador || v.departamentoComprador;
    });

  result.retiros
    .filter((r) => r.placa && matchesDocumento(r.documento) && matchesPlaca(r.placa) && matchesAllowedPlaca(r.placa))
    .forEach((r) => {
      const placa = normalizePlaca(r.placa);
      if (!placa) return;
      const v = getVehicle(placa);
      v.descripcion = r.descripcion || v.descripcion;
      v.fecha = r.fecha || v.fecha;
      v.subasta = r.subasta || v.subasta;
      v.lote = r.lote || v.lote;
      v.estado = r.estado || v.estado;
      v.transito = r.transito || v.transito;
      v.tramitador = r.tramitador || v.tramitador;
      v.inicioTramiteFecha = r.incioServitramFecha || v.inicioTramiteFecha;
      v.cierreContableFecha = r.cierrecontableTraspasoComision || v.cierreContableFecha;
      v.envioDocFirmaFecha = r.enviodoFirmarGmFinancial || v.envioDocFirmaFecha;
      v.docsConTramitadorFecha = r.documentosConTramitador || v.docsConTramitadorFecha;
      v.fechaAprobacionTramite = r.fechaAprobacionTramite || v.fechaAprobacionTramite;
      v.fechaEntregaVehiculo = r.fechaEntregaVehiculo || v.fechaEntregaVehiculo;
      v.estadoRetiro = r.estadoRetiro || v.estadoRetiro;
      v.comentarios = r.comentarios || v.comentarios;
      v.mayor_oferta = r.mayoroferta || v.mayor_oferta;
      v.comprador = r.comprador || v.comprador;
      v.documento = r.documento || v.documento;
      v.email = r.email || v.email;
      v.movil = r.movil || v.movil;
      v.ciudadComprador = r.ciudadComprador || v.ciudadComprador;
      v.departamentoComprador = r.departamentoComprador || v.departamentoComprador;
    });

  const allTramitadores = [...result.servitram, ...result.gestramites];
  allTramitadores
    .filter((r) => r.placa && matchesDocumento(r.documento) && matchesPlaca(r.placa) && matchesAllowedPlaca(r.placa))
    .forEach((r) => {
      const placa = normalizePlaca(r.placa);
      if (!placa) return;
      const v = getVehicle(placa);
      v.descripcion = r.descripcion || v.descripcion;
      v.subasta = r.subasta || v.subasta;
      v.lote = r.lote || v.lote;
      v.tramitador = r.tramitador || v.tramitador;
      v.transito = r.transito || v.transito;
      v.fechaRecibidoImprontas = r.fechaRecibidoImprontas || v.fechaRecibidoImprontas;
      v.estadoTraspaso = r.estadoTraspaso || v.estadoTraspaso;
      v.observacion = r.observacion || v.observacion;
      v.fechaAprobadoRunt = r.fechaAprobadoRunt || v.fechaAprobadoRunt;
      v.fechaTp = r.fechaTp || v.fechaTp;
      v.comprador = r.comprador || v.comprador;
      v.documento = r.documento || v.documento;
      v.email = r.email || v.email;
      v.movil = r.movil || v.movil;
    });

  return Array.from(vehicleMap.values());
}

// Consolidate vehicle data from all 4 tables for a specific buyer
export function consolidateVehiculos(result: SearchResult, documento?: string, skipAllowedFilter?: boolean): VehiculoConsolidado[] {
  return consolidateVehiculosBase(result, { documento, allowedPlacas: skipAllowedFilter ? null : undefined });
}

export function extractVehiculosBySubasta(result: SearchResult, query: string): VehiculoConsolidado[] {
  if (!query?.trim()) return [];

  const matchedPlacas = new Set<string>();

  result.relatorio
    .filter(
      (row) =>
        !isCondicionalRechazado(row.estado) &&
        (matchesNormalizedSearch(row.subasta, query) || matchesNormalizedSearch(row.codigoSubasta, query)),
    )
    .forEach((row) => {
      const placa = normalizePlaca(row.placa);
      if (placa) matchedPlacas.add(placa);
    });

  [result.retiros, result.servitram, result.gestramites].forEach((rows) => {
    rows
      .filter((row) => matchesNormalizedSearch(row.subasta, query))
      .forEach((row) => {
        const placa = normalizePlaca(row.placa);
        if (placa) matchedPlacas.add(placa);
      });
  });

  if (matchedPlacas.size === 0) return [];

  return consolidateVehiculosBase(result, {
    placaFilter: matchedPlacas,
    allowedPlacas: null,
  });
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    minimumFractionDigits: 0,
  }).format(amount);
}

export function formatDate(date: string | null): string {
  if (!date) return "—";
  // Handle various date formats from BigQuery
  const parsed = new Date(date);
  if (isNaN(parsed.getTime())) return date; // Return as-is if can't parse
  return new Intl.DateTimeFormat("es-CO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(parsed);
}
