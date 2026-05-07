import type { Context } from "hono";
import { runQuery } from "../../../services/bigquery.js";
import { TABLES } from "../../../lib/sql-constants.js";
import { renderQuery } from "../render-query.js";

export async function handleDebugColumns(c: Context) {
  const sql = renderQuery("debug-columns.sql", {
    TABLES_consolidadoChan: TABLES.consolidadoChan,
  });
  const rows = await runQuery(sql);
  return c.json(rows);
}
