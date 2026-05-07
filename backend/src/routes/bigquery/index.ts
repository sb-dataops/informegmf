import { Hono } from "hono";
import { handleDebugColumns } from "./handlers/debug-columns.js";
import { handleSearch } from "./handlers/search.js";
import { handleStats } from "./handlers/stats.js";
import { handleStatsPagos } from "./handlers/stats-pagos.js";
import { handleStatsRetiros } from "./handlers/stats-retiros.js";
import { handleStatsFiltros } from "./handlers/stats-filtros.js";
import { handleFilter } from "./handlers/filter.js";
import { handleAutocomplete } from "./handlers/autocomplete.js";
import { handleMultiSearch } from "./handlers/multi-search.js";
import { handleSample } from "./handlers/sample.js";

const router = new Hono();

router.get("/", async (c) => {
  try {
    const action = c.req.query("action") || "search";

    if (action === "debug_columns") return handleDebugColumns(c);
    if (action === "search") return handleSearch(c);
    if (action === "stats") return handleStats(c);
    if (action === "stats_pagos") return handleStatsPagos(c);
    if (action === "stats_retiros") return handleStatsRetiros(c);
    if (action === "stats_filtros") return handleStatsFiltros(c);
    if (action === "filter") return handleFilter(c);
    if (action === "autocomplete") return handleAutocomplete(c);
    if (action === "multi-search") return handleMultiSearch(c);
    if (action === "sample") return handleSample(c);

    return c.json({ error: "Use action=search&q=..., action=stats, or action=sample&table=..." }, 400);
  } catch (error: unknown) {
    console.error("BigQuery error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return c.json({ error: message }, 500);
  }
});

export const bigqueryRouter = router;
