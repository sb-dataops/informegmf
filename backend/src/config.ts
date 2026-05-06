// Lazy-loaded config: each getter throws only when actually used. Keeps /health
// reachable even when secrets aren't wired up (useful for early Cloud Run probes).

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

function optional(name: string, fallback: string): string {
  return process.env[name]?.trim() || fallback;
}

export const config = {
  port: Number(process.env.PORT ?? 8080),
  nodeEnv: optional("NODE_ENV", "development"),

  get supabaseUrl() { return required("SUPABASE_URL"); },
  get supabaseJwtSecret() { return required("SUPABASE_JWT_SECRET"); },
  get supabaseServiceRoleKey() { return required("SUPABASE_SERVICE_ROLE_KEY"); },

  get bigqueryProjectId() { return optional("BIGQUERY_PROJECT_ID", "sbc-data-int"); },
  get gcsBucketName() { return required("GCS_BUCKET_NAME"); },

  get resendApiKey() { return required("RESEND_API_KEY"); },
  get resendFromEmail() {
    return optional("RESEND_FROM_EMAIL", "Superbid Exchange <informes@superbidcolombia.com>");
  },

  get allowedOrigins(): string[] {
    return optional("ALLOWED_ORIGINS", "http://localhost:8080,http://localhost:5173")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  },
};
