import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { config } from "./config.js";
import { corsMiddleware } from "./middleware/cors.js";
import { authMiddleware, type AuthUser } from "./middleware/auth.js";
import { oidcMiddleware } from "./middleware/oidc.js";
import { bigqueryRouter } from "./routes/bigquery.js";
import { documentsRouter } from "./routes/documents.js";
import { jobsRouter } from "./routes/jobs.js";

const app = new Hono<{ Variables: { user: AuthUser } }>();

app.use("*", corsMiddleware);

// Cloud Run startup/liveness probe — must work without any secret wired up
app.get("/health", (c) =>
  c.json({
    ok: true,
    revision: process.env.K_REVISION ?? "local",
    nodeEnv: config.nodeEnv,
  }),
);

// All /api/* routes require an authenticated user JWT from Supabase
app.use("/api/*", authMiddleware);

app.get("/api/whoami", (c) => c.json({ user: c.get("user") }));

app.use("/fetch-bigquery", authMiddleware);
app.route("/fetch-bigquery", bigqueryRouter);

app.use("/gcs-documents", authMiddleware);
app.route("/gcs-documents", documentsRouter);

// /jobs/* requires an OIDC token issued by Google (Cloud Scheduler signs these).
// In local dev, JOBS_OIDC_AUDIENCE is unset and the middleware lets requests through.
app.use("/jobs/*", oidcMiddleware);
app.route("/jobs", jobsRouter);

serve(
  { fetch: app.fetch, port: config.port },
  (info) => console.log(`backend listening on :${info.port}`),
);
