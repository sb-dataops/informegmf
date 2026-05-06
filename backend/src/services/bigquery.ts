import { BigQuery, type Query } from "@google-cloud/bigquery";
import { config } from "../config.js";

let cached: BigQuery | null = null;

function getClient(): BigQuery {
  if (!cached) {
    cached = new BigQuery({
      projectId: config.bigqueryProjectId,
      scopes: [
        "https://www.googleapis.com/auth/bigquery.readonly",
        "https://www.googleapis.com/auth/drive.readonly",
      ],
    });
  }
  return cached;
}

export async function runQuery(sql: string): Promise<Record<string, string | null>[]> {
  const bq = getClient();
  const queryRequest: Query = {
    query: sql,
    useLegacySql: false,
    maxResults: 5000,
  };
  const [rows] = await bq.query(queryRequest, { timeoutMs: 60000 });
  return rows.map((row: Record<string, unknown>) => {
    const obj: Record<string, string | null> = {};
    for (const [k, v] of Object.entries(row)) {
      if (v === null || v === undefined) obj[k] = null;
      else if (typeof v === "object" && "value" in (v as object)) obj[k] = String((v as { value: unknown }).value);
      else obj[k] = String(v);
    }
    return obj;
  });
}

export const bigqueryProjectId = config.bigqueryProjectId;
