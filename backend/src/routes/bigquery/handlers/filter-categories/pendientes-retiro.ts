import { TABLES, COMITENTE_FILTER, ESTADO_ALLOWED_FILTER } from "../../../../lib/sql-constants.js";
import { renderQuery } from "../../render-query.js";
import { EXCLUDED_ESTADOS_RETIROS } from "./common.js";

export function getPendientesRetiroSql(): string {
  return renderQuery("filter/pendientes-retiro.sql", {
    TABLES_relatorio: TABLES.relatorio,
    TABLES_retiros: TABLES.retiros,
    TABLES_servitram: TABLES.servitram,
    TABLES_gestramites: TABLES.gestramites,
    ESTADO_ALLOWED_FILTER,
    COMITENTE_FILTER,
    EXCLUDED_ESTADOS_RETIROS,
  });
}
