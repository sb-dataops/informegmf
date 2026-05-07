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

Servicio: `gmf-superbid-api` en proyecto `sbc-lovable`, región `us-central1`. Dominio custom: `https://gmf-api.superbidcolombia.com`. Backend Service Account: `gmf-superbid-api@sbc-lovable.iam.gserviceaccount.com` (ADC, sin JSON key).

### Manual (desde local)

```sh
cd backend
./deploy.sh                # tag automático <git-sha>-<timestamp>
./deploy.sh v1.2.3         # tag custom
PROJECT=otro ./deploy.sh   # override del proyecto
```

`deploy.sh` corre `gcloud builds submit --config=cloudbuild.yaml`, que hace:
1. Build de la imagen con cache de `:latest`
2. Push a `us-central1-docker.pkg.dev/sbc-lovable/informegmf/backend:<tag>`
3. Deploy a Cloud Run con SA atada, env vars desde `env.production.yaml` y secretos desde Secret Manager

### Configuración

| Archivo | Qué tiene |
|---------|-----------|
| `cloudbuild.yaml` | Pipeline build + push + deploy |
| `env.production.yaml` | Env vars NO sensibles (proyecto BQ, bucket GCS, CORS, etc.) |
| `Dockerfile` | Multi-stage Node 20-slim |

Los secretos se inyectan vía `--set-secrets` desde Google Secret Manager:
- `SUPABASE_URL` ← `informegmf-supabase-url`
- `SUPABASE_JWT_SECRET` ← `informegmf-supabase-jwt`
- `SUPABASE_SERVICE_ROLE_KEY` ← `informegmf-supabase-secret`
- `RESEND_API_KEY` ← `informegmf-resend`

### IAM requerida

El SA `gmf-superbid-api@sbc-lovable.iam.gserviceaccount.com` (runtime) necesita:
- `roles/bigquery.dataViewer` + `roles/bigquery.jobUser` en `sbc-data-int`
- `roles/storage.objectAdmin` en bucket `sb-relatorio-vendedor-gmf`
- `roles/secretmanager.secretAccessor` en cada secreto listado arriba
- Acceso (Viewer) a los 3 Sheets que respaldan tablas externas BQ:
  `r_retiros_gmf_2025`, `r_tramitadores_servitram_gmf`, `r_tramitadores_gestramites`

El Cloud Build SA (Compute SA del proyecto) necesita:
- `roles/artifactregistry.writer` (push de imagen)
- `roles/run.admin` (deploy)
- `roles/iam.serviceAccountUser` sobre el runtime SA

## Convenciones

- Sin secretos en código, en archivos `.env` versionados, ni en variables de entorno planas en Cloud Run. Todo lo sensible vive en Google Secret Manager y se inyecta vía `--set-secrets`.
- En Cloud Run los SDKs de GCP usan ADC; no se debe pasar `GOOGLE_APPLICATION_CREDENTIALS`.
- Config se lee perezosamente (`src/config.ts`): el endpoint `/health` no requiere ninguna env var, lo que permite que el primer deploy responda probes incluso antes de que los secretos estén bien atados.
