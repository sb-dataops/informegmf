import { TABLES, COMITENTE_FILTER, ESTADO_ALLOWED_FILTER } from "../../../../lib/sql-constants.js";
import { renderQuery } from "../../render-query.js";

export function getTotalSql(): string {
  return renderQuery("filter/total.sql", {
    TABLES_relatorio: TABLES.relatorio,
    ESTADO_ALLOWED_FILTER,
    COMITENTE_FILTER,
  });
}
