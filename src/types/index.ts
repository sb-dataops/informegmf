// Types matching BigQuery schema

export interface Comprador {
  documento: string;
  nombre: string;
  email?: string;
  movil?: string;
  direccion?: string;
  ciudad?: string;
  departamento?: string;
}

// From relatorio_actual
export interface RelatorioRecord {
  codigo_k: string | null;
  codigo_: string | null;
  fecha: string | null;
  subasta: string | null;
  lote: string | null;
  comitente: string | null;
  categoria: string | null;
  estado: string | null;
  fecha_aprobacion_vendedor: string | null;
  placa: string | null;
  mayor_oferta: string | null;
  valor_inicial: string | null;
  comprador: string | null;
  email: string | null;
  documento: string | null;
  ciudad_comprador: string | null;
  departamento_comprador: string | null;
  gestor: string | null;
  movil: string | null;
  direccion: string | null;
  marca: string | null;
  linea: string | null;
  modelo: string | null;
  descripcion: string | null;
  codigoSubasta: string | null;
}

// From r_retiros_gmf_2025
export interface RetiroRecord {
  codigo: string | null;
  fecha: string | null;
  subasta: string | null;
  estado: string | null;
  lote: string | null;
  descripcion: string | null;
  placa: string | null;
  transito: string | null;
  tramitador: string | null;
  incioServitramFecha: string | null;
  cierrecontableTraspasoComision: string | null;
  procesoPazySalvoaTramitador: string | null;
  estadoDocuemntosComprador: string | null;
  enviodoFirmarGmFinancial: string | null;
  estadoGmFinancialFirmas: string | null;
  documentosConTramitador: string | null;
  fechaAprobacionTramite: string | null;
  fechaEntregaVehiculo: string | null;
  comentarios: string | null;
  mayoroferta: string | null;
  comprador: string | null;
  email: string | null;
  documento: string | null;
  movil: string | null;
  direccion: string | null;
  ciudadComprador: string | null;
  departamentoComprador: string | null;
  ubicacionVehiculo: string | null;
  ciudadUbicacionVehiculo: string | null;
  direccionUbicacionVehiculo: string | null;
  quienRetira: string | null;
  estadoRetiro: string | null;
  fechaEstadoRetiro: string | null;
}

// From r_tramitadores_servitram_gmf / r_tramitadores_gestramites
export interface TramitadorRecord {
  tramitador: string | null;
  codigo: string | null;
  fechaDeAsignacion: string | null;
  fechaDeSubasta: string | null;
  subasta: string | null;
  descripcion: string | null;
  placa: string | null;
  lote: string | null;
  comprador: string | null;
  documento: string | null;
  email: string | null;
  movil: string | null;
  direccion: string | null;
  ciudadYDepartamento: string | null;
  pazYSalvoContabilidad: string | null;
  fechaRecibidoImprontas: string | null;
  fechasFirmasComprador: string | null;
  fechaEnvioFirmasVendedor: string | null;
  fechaOkDocsTraspaso: string | null;
  transito: string | null;
  estadoTraspaso: string | null;
  fechaAprobadoRunt: string | null;
  fechaTp: string | null;
  fechaEnvioTpComprador: string | null;
  ans: string | null;
  observacion: string | null;
  fechaVencimientoRtm?: string | null; // only in gestramites
}

// Consolidated vehicle view for UI
export interface VehiculoConsolidado {
  placa: string;
  descripcion: string;
  fecha: string | null;
  subasta: string | null;
  lote: string | null;
  estado: string | null;
  marca: string | null;
  linea: string | null;
  modelo: string | null;
  mayor_oferta: string | null;
  // Retiros data
  transito: string | null;
  tramitador: string | null;
  inicioTramiteFecha: string | null;
  cierreContableFecha: string | null;
  envioDocFirmaFecha: string | null;
  docsConTramitadorFecha: string | null;
  fechaAprobacionTramite: string | null;
  fechaEntregaVehiculo: string | null;
  estadoRetiro: string | null;
  comentarios: string | null;
  // Tramitador data
  fechaRecibidoImprontas: string | null;
  estadoTraspaso: string | null;
  observacion: string | null;
  fechaAprobadoRunt: string | null;
  fechaTp: string | null;
  // Buyer info
  comprador: string | null;
  documento: string | null;
  email: string | null;
  movil: string | null;
  ciudadComprador: string | null;
  departamentoComprador: string | null;
  fechaAprobacionVendedor: string | null;
}

export interface SearchResult {
  relatorio: RelatorioRecord[];
  retiros: RetiroRecord[];
  servitram: TramitadorRecord[];
  gestramites: TramitadorRecord[];
}

export interface DashboardStatsData {
  total: string;
  aprobados: string;
  en_proceso: string;
  pendientes: string;
  pendientes_pago: string;
  pendientes_traspaso: string;
  pendientes_retiro: string;
  pagos_pendientes_revision: string;
  soportes_pendientes_revision: string;
}

export interface FilteredLotRow {
  subasta: string | null;
  placa: string | null;
  comprador: string | null;
  documento: string | null;
  descripcion: string | null;
  estado?: string | null;
  estadoTraspaso?: string | null;
  estadoRetiro?: string | null;
  tramitador?: string | null;
  transito?: string | null;
  lote?: string | null;
  cantidadSoportes?: number | null;
  ultimoSoporteAt?: string | null;
  hasPendingReview?: boolean;
  hasPendingPayment?: boolean;
  reviewPriority?: number | null;
}

export interface FilteredLotsResult {
  category: string;
  rows: FilteredLotRow[];
  count: number;
}

// Legacy types kept for backward compatibility
export interface ArchivoSoporte {
  id: string;
  nombre: string;
  tipo: string;
  tamano: number;
  url: string;
  fecha_subida: string;
  placa: string;
}
