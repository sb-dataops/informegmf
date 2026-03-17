import {
  SearchResult,
  DashboardStatsData,
  FilteredLotsResult,
  Comprador,
  VehiculoConsolidado,
} from "@/types";
import { buildAllowedPlacasFromRelatorio, isAllowedPlaca, isCondicionalRechazado, normalizePlaca } from "@/lib/vehicle-filters";

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

  result.relatorio
    .filter((r) => !isCondicionalRechazado(r.estado))
    .forEach((r) =>
      addBuyer(r.documento, r.comprador, r.email, r.movil, r.direccion, r.ciudad_comprador, r.departamento_comprador)
    );

  result.retiros
    .filter((r) => isAllowedPlaca(r.placa, allowedPlacas))
    .forEach((r) =>
      addBuyer(r.documento, r.comprador, r.email, r.movil, r.direccion, r.ciudadComprador, r.departamentoComprador)
    );

  result.servitram
    .filter((r) => isAllowedPlaca(r.placa, allowedPlacas))
    .forEach((r) => addBuyer(r.documento, r.comprador, r.email, r.movil, r.direccion));

  result.gestramites
    .filter((r) => isAllowedPlaca(r.placa, allowedPlacas))
    .forEach((r) => addBuyer(r.documento, r.comprador, r.email, r.movil, r.direccion));

  return Array.from(map.values());
}

// Consolidate vehicle data from all 4 tables for a specific buyer
export function consolidateVehiculos(result: SearchResult, documento?: string): VehiculoConsolidado[] {
  const vehicleMap = new Map<string, VehiculoConsolidado>();
  const allowedPlacas = buildAllowedPlacasFromRelatorio(result.relatorio);

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
    .filter((r) => r.placa && (!documento || r.documento === documento))
    .filter((r) => !isCondicionalRechazado(r.estado))
    .forEach((r) => {
      const v = getVehicle(r.placa!);
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
    .filter((r) => r.placa && (!documento || r.documento === documento))
    .filter((r) => isAllowedPlaca(r.placa, allowedPlacas))
    .forEach((r) => {
      const v = getVehicle(r.placa!);
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
    });

  const allTramitadores = [...result.servitram, ...result.gestramites];
  allTramitadores
    .filter((r) => r.placa && (!documento || r.documento === documento))
    .filter((r) => isAllowedPlaca(r.placa, allowedPlacas))
    .forEach((r) => {
      const v = getVehicle(r.placa!);
      v.descripcion = r.descripcion || v.descripcion;
      v.tramitador = r.tramitador || v.tramitador;
      v.transito = r.transito || v.transito;
      v.fechaRecibidoImprontas = r.fechaRecibidoImprontas || v.fechaRecibidoImprontas;
      v.estadoTraspaso = r.estadoTraspaso || v.estadoTraspaso;
      v.observacion = r.observacion || v.observacion;
      v.fechaAprobadoRunt = r.fechaAprobadoRunt || v.fechaAprobadoRunt;
      v.fechaTp = r.fechaTp || v.fechaTp;
      v.comprador = r.comprador || v.comprador;
      v.documento = r.documento || v.documento;
    });

  return Array.from(vehicleMap.values());
}

export function extractVehiculosBySubasta(result: SearchResult, query: string): VehiculoConsolidado[] {
  const normalizedQuery = (query || "").trim().toUpperCase();
  if (!normalizedQuery) return [];

  const matchedPlacas = new Set<string>();

  result.relatorio
    .filter(
      (row) =>
        !isCondicionalRechazado(row.estado) &&
        ((row.subasta || "").trim().toUpperCase() === normalizedQuery ||
          (row.codigoSubasta || "").trim().toUpperCase() === normalizedQuery),
    )
    .forEach((row) => {
      const placa = normalizePlaca(row.placa);
      if (placa) matchedPlacas.add(placa);
    });

  [result.retiros, result.servitram, result.gestramites].forEach((rows) => {
    rows
      .filter((row) => ((row.subasta || "").trim().toUpperCase() === normalizedQuery))
      .forEach((row) => {
        const placa = normalizePlaca(row.placa);
        if (placa) matchedPlacas.add(placa);
      });
  });

  if (matchedPlacas.size === 0) return [];

  return consolidateVehiculos(result).filter((vehiculo) => matchedPlacas.has(normalizePlaca(vehiculo.placa) || ""));
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
