import type { Context } from "hono";
import { runQuery } from "../../../services/bigquery.js";
import { TABLES } from "../../../lib/sql-constants.js";
import { renderQuery } from "../render-query.js";

// ── SAMPLE: get first rows from any table ──
export async function handleSample(c: Context) {
  const table = c.req.query("table") || "retiros";
  const tableName = TABLES[table as keyof typeof TABLES];
  if (!tableName) {
    return c.json({ error: "Table not found" }, 400);
  }
  const customSQL = c.req.query("sql");
  let rows;
  if (customSQL === "distinct_estados") {
    rows = await runQuery(renderQuery("sample/distinct-estados.sql", { tableName }));
  } else if (customSQL === "count") {
    rows = await runQuery(renderQuery("sample/count.sql", { tableName }));
  } else if (customSQL === "retiro_stats") {
    rows = await runQuery(renderQuery("sample/retiro-stats.sql", { tableName }));
  } else {
    rows = await runQuery(renderQuery("sample/default.sql", { tableName }));
  }
  return c.json({ table: tableName, rows, count: rows.length });
}
