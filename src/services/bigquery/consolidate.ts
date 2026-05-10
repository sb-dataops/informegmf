import { SearchResult, VehiculoConsolidado } from "@/types";
import {
  buildAllowedPlacasFromRelatorio,
  isAllowedPlaca,
  isCondicionalRechazado,
  normalizePlaca,
} from "@/lib/vehicle-filters";
import {
  buildAllowedDocumentosByPlaca,
  createEmptyVehiculo,
  getTramitadorSortTime,
  normalizeDocumento,
} from "./consolidate-helpers";

export function consolidateVehiculosBase(
  result: SearchResult,
  options?: {
    documento?: string;
    placaFilter?: Set<string>;
    allowedPlacas?: Set<string> | null;
    includeRechazados?: boolean;
  },
): VehiculoConsolidado[] {
  const vehicleMap = new Map<string, VehiculoConsolidado>();
  const {
    documento,
    placaFilter,
    allowedPlacas: explicitAllowedPlacas,
    includeRechazados,
  } = options || {};
  const allowedPlacas =
    explicitAllowedPlacas !== undefined
      ? explicitAllowedPlacas
      : buildAllowedPlacasFromRelatorio(result.relatorio);
  const allowedDocumentosByPlaca = buildAllowedDocumentosByPlaca(result);
  // Cuando allowedPlacas es un set vacío (no hay relatorio), saltamos el filtro.
  const effectiveAllowedPlacas =
    allowedPlacas && allowedPlacas.size === 0 ? null : allowedPlacas;

  const matchesDocumento = (value: string | null | undefined) =>
    !documento || value === documento;
  const matchesPlaca = (value: string | null | undefined) => {
    if (!placaFilter) return true;
    const placa = normalizePlaca(value);
    return !!placa && placaFilter.has(placa);
  };
  const matchesAllowedRelacion = (
    placa: string | null | undefined,
    rowDocumento: string | null | undefined,
  ) => {
    if (effectiveAllowedPlacas === null) return true;

    const normalizedPlaca = normalizePlaca(placa);
    if (
      !normalizedPlaca ||
      !isAllowedPlaca(normalizedPlaca, effectiveAllowedPlacas)
    ) {
      return false;
    }

    const allowedDocs = allowedDocumentosByPlaca.get(normalizedPlaca);
    if (!allowedDocs || allowedDocs.size === 0) return true;

    const normalizedDocumento = normalizeDocumento(rowDocumento);
    if (!normalizedDocumento) return true;

    return allowedDocs.has(normalizedDocumento);
  };

  const getVehicle = (placa: string): VehiculoConsolidado => {
    if (!vehicleMap.has(placa)) {
      vehicleMap.set(placa, createEmptyVehiculo(placa));
    }
    return vehicleMap.get(placa)!;
  };

  result.relatorio
    .filter((r) => r.placa && matchesDocumento(r.documento) && matchesPlaca(r.placa))
    .filter((r) => includeRechazados || !isCondicionalRechazado(r.estado))
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
      v.departamentoComprador =
        r.departamento_comprador || v.departamentoComprador;
      v.fechaAprobacionVendedor =
        r.fecha_aprobacion_vendedor || v.fechaAprobacionVendedor;
    });

  result.retiros
    .filter(
      (r) =>
        r.placa &&
        matchesDocumento(r.documento) &&
        matchesPlaca(r.placa) &&
        matchesAllowedRelacion(r.placa, r.documento),
    )
    .forEach((r) => {
      const placa = normalizePlaca(r.placa);
      if (!placa) return;
      const v = getVehicle(placa);
      v.descripcion = r.descripcion || v.descripcion;
      v.subasta = r.subasta || v.subasta;
      v.lote = r.lote || v.lote;
      v.estado = r.estado || v.estado;
      v.transito = r.transito || v.transito;
      v.tramitador = r.tramitador || v.tramitador;
      v.inicioTramiteFecha = r.incioServitramFecha || v.inicioTramiteFecha;
      // Cierre Contable / Paz y Salvo viene SOLO de retiros.cierrecontableTraspasoComision
      // (NO de servitram/gestramites.pazYSalvoContabilidad — es una fecha diferente).
      v.cierreContableFecha =
        r.cierrecontableTraspasoComision || v.cierreContableFecha;
      v.envioDocFirmaFecha = r.enviodoFirmarGmFinancial || v.envioDocFirmaFecha;
      v.docsConTramitadorFecha =
        r.documentosConTramitador || v.docsConTramitadorFecha;
      v.fechaAprobacionTramite =
        r.fechaAprobacionTramite || v.fechaAprobacionTramite;
      v.fechaEntregaVehiculo = r.fechaEntregaVehiculo || v.fechaEntregaVehiculo;
      v.estadoRetiro = r.estadoRetiro || v.estadoRetiro;
      v.comentarios = r.comentarios || v.comentarios;
      v.mayor_oferta = r.mayoroferta || v.mayor_oferta;
      v.comprador = r.comprador || v.comprador;
      v.documento = r.documento || v.documento;
      v.email = r.email || v.email;
      v.movil = r.movil || v.movil;
      v.ciudadComprador = r.ciudadComprador || v.ciudadComprador;
      v.departamentoComprador =
        r.departamentoComprador || v.departamentoComprador;
    });

  const allTramitadores = [...result.servitram, ...result.gestramites]
    .filter(
      (r) =>
        r.placa &&
        matchesDocumento(r.documento) &&
        matchesPlaca(r.placa) &&
        matchesAllowedRelacion(r.placa, r.documento),
    )
    .sort((a, b) => getTramitadorSortTime(a) - getTramitadorSortTime(b));

  allTramitadores.forEach((r) => {
    const placa = normalizePlaca(r.placa);
    if (!placa) return;
    const v = getVehicle(placa);
    v.descripcion = r.descripcion || v.descripcion;
    v.subasta = r.subasta || v.subasta;
    v.lote = r.lote || v.lote;
    v.tramitador = r.tramitador || v.tramitador;
    v.transito = r.transito || v.transito;
    // Cierre Contable / Paz y Salvo viene SOLO de retiros.cierrecontableTraspasoComision.
    // NO sobreescribir con pazYSalvoContabilidad de servitram/gestramites.
    v.fechaRecibidoImprontas =
      r.fechaRecibidoImprontas || v.fechaRecibidoImprontas;
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

// Consolida data de un vehículo desde las 4 tablas para un comprador específico.
export function consolidateVehiculos(
  result: SearchResult,
  documento?: string,
  skipAllowedFilter?: boolean,
): VehiculoConsolidado[] {
  return consolidateVehiculosBase(result, {
    documento,
    allowedPlacas: skipAllowedFilter ? null : undefined,
  });
}
