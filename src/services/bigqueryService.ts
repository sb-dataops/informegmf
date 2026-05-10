// Facade. La implementación vive en ./bigquery/.
// Este archivo se conserva (en lugar de mover los símbolos) para no romper
// los 17 imports existentes de `@/services/bigqueryService` en el frontend.

export {
  searchBigQuery,
  fetchDashboardStats,
  fetchStatsPagos,
  fetchStatsRetiros,
  fetchStatsFiltros,
  fetchFilteredLots,
} from "./bigquery/api";

export { consolidateVehiculos } from "./bigquery/consolidate";

export {
  extractCompradores,
  extractUniqueSubastas,
  extractVehiculosBySubasta,
  extractVehiculosBySubastaIncluyendoRechazados,
} from "./bigquery/subasta-queries";
export type { SubastaMatch } from "./bigquery/subasta-queries";

export { formatCurrency, formatDate } from "./bigquery/formatters";
