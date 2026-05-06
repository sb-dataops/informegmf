# informegmf backend

API en Cloud Run que reemplaza las edge functions de Supabase. Parte de la migración descrita en `plan-migracion-gmf-superbid.md`.

## Stack

- Node 20 LTS
- Hono (router HTTP)
- jose (verificación de JWT de Supabase)
- `@google-cloud/bigquery`, `@google-cloud/storage` (autenticación vía ADC en Cloud Run, sin JSON keys)
- `@supabase/supabase-js` (admin client con service role para bypass de RLS cuando hace falta)
- resend (emails transaccionales)

## Desarrollo local

```sh
cd backend
npm install
cp .env.example .env.local
# llena los valores; para credenciales GCP en local usa GOOGLE_APPLICATION_CREDENTIALS=/path/to/sa.json
npm run dev
```

El servidor queda en `http://localhost:8080`.

```sh
curl http://localhost:8080/health
# {"ok":true,"revision":"local","nodeEnv":"development"}
```

## Endpoints

| Método | Ruta | Auth | Descripción |
|--------|------|------|-------------|
| GET | `/health` | — | Probe de Cloud Run |
| GET | `/api/whoami` | user JWT | Devuelve info del usuario autenticado |
| GET/POST | `/api/bigquery/*` | user JWT | TODO — port de `fetch-bigquery` |
| GET/POST | `/api/documents/*` | user JWT | TODO — port de `gcs-documents` |
| POST | `/jobs/*` | OIDC (Cloud Scheduler) | TODO — port de cron emails |

## Deploy a Cloud Run

(Pendiente — siguiente fase de la migración)

```sh
gcloud run deploy gmf-superbid-api \
  --image=us-central1-docker.pkg.dev/gmf-superbid-prod/informegmf/backend:$SHA \
  --region=us-central1 \
  --service-account=gmf-superbid-api@gmf-superbid-prod.iam.gserviceaccount.com \
  --no-allow-unauthenticated \
  --set-env-vars=ALLOWED_ORIGINS=...,BIGQUERY_PROJECT_ID=sbc-data-int,GCS_BUCKET_NAME=... \
  --set-secrets=SUPABASE_JWT_SECRET=informegmf-supabase-jwt:latest,SUPABASE_SERVICE_ROLE_KEY=informegmf-supabase-secret:latest,RESEND_API_KEY=informegmf-resend:latest \
  --project=gmf-superbid-prod
```

## Convenciones

- Sin secretos en código, en archivos `.env` versionados, ni en variables de entorno planas en Cloud Run. Todo lo sensible vive en Google Secret Manager y se inyecta vía `--set-secrets`.
- En Cloud Run los SDKs de GCP usan ADC; no se debe pasar `GOOGLE_APPLICATION_CREDENTIALS`.
- Config se lee perezosamente (`src/config.ts`): el endpoint `/health` no requiere ninguna env var, lo que permite que el primer deploy responda probes incluso antes de que los secretos estén bien atados.
