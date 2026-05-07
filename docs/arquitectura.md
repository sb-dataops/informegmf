# Arquitectura — Informe GMF

Estado actual del sistema, post-migración a infraestructura propia (mayo 2026).

## Diagrama lógico

```
┌──────────────────────────────────────────────────────────────────────┐
│                          Usuario (browser)                           │
└────────────────────┬─────────────────────────────────────────────────┘
                     │ HTTPS
                     ▼
        ┌────────────────────────────┐         Custom domain
        │  Firebase Hosting          │         gmf.superbidcolombia.com
        │  informegmf.web.app        │◄────────  (cert pendiente al
        │  (SPA Vite/React/TS)       │           cierre de migración)
        └────┬───────────────┬───────┘
             │               │
             │ Supabase JS   │ apiFetch (user JWT en Authorization)
             │ (auth + DB)   │
             ▼               ▼
   ┌──────────────────┐  ┌──────────────────────────────────────┐
   │  Supabase Pro    │  │  Cloud Run (us-central1)             │
   │  (propio)        │  │  gmf-superbid-api                    │
   │  zbpvpduecodvn-  │  │  https://gmf-api.superbidcolombia.com│
   │  kjdrdoc         │  │  (Hono + Node 22)                    │
   │                  │  │                                      │
   │  • Auth          │  │  Endpoints:                          │
   │    (Google OAuth)│  │  • GET  /health                      │
   │  • Postgres + RLS│  │  • GET  /api/whoami                  │
   │    + role_seeds  │  │  • GET  /fetch-bigquery?action=...   │
   │  • pg_net,       │  │  • *    /gcs-documents?action=...    │
   │    pg_cron       │  │  • POST /jobs/* (OIDC only)          │
   └──────────────────┘  └──────┬─────────────┬─────────────────┘
                                │             │
                          ADC   │             │ Resend SDK
                  (sin JSON key)│             │
                                ▼             ▼
                  ┌──────────────────┐  ┌────────────────┐
                  │ BigQuery         │  │ Resend         │
                  │ sbc-data-int     │  │ (emails)       │
                  │                  │  └────────────────┘
                  │ + GCS bucket     │
                  │   sb-relatorio-  │
                  │   vendedor-gmf   │
                  └──────────────────┘
                          ▲
                          │ OIDC token
                          │ (Cloud Scheduler firma)
                  ┌───────┴──────────────┐
                  │ Cloud Scheduler      │
                  │ • deadline-alerts    │
                  │   9 AM Bogotá daily  │
                  │ • auction-complete   │
                  │   9 AM Bogotá daily  │
                  └──────────────────────┘
```

## Identificadores clave

### GCP projects

| Proyecto | Project ID | Project number | Rol |
|---|---|---|---|
| Backend Cloud Run + WIF + secretos | `sbc-lovable` | `604184934021` | Runtime principal |
| Frontend Firebase Hosting | `informegmf` | `104591804578` | Solo Hosting |
| Datos analíticos (BQ + bucket) | `sbc-data-int` | `858128435830` | BQ datasets, bucket GCS |

### Service Accounts

| SA | Proyecto home | Uso | Roles principales |
|---|---|---|---|
| `gmf-superbid-api@sbc-lovable.iam.gserviceaccount.com` | sbc-lovable | Runtime de Cloud Run | `bigquery.dataViewer`+`jobUser` en sbc-data-int, `storage.objectAdmin` en bucket, `secretmanager.secretAccessor` en informegmf-* |
| `gmf-scheduler@sbc-lovable.iam.gserviceaccount.com` | sbc-lovable | Firma OIDC tokens de Cloud Scheduler | `run.invoker` sobre el servicio |
| `github-deployer@sbc-lovable.iam.gserviceaccount.com` | sbc-lovable | Deploys vía GitHub Actions (WIF) | `cloudbuild.builds.editor`, `storage.admin`, `iam.serviceAccountUser` (sobre Compute SA), `run.admin` en sbc-lovable; `firebase.admin`, `firebasehosting.admin`, `serviceusage.serviceUsageConsumer` en informegmf |
| `lovable-bd-query@sbc-data-int.iam.gserviceaccount.com` | sbc-data-int | Legacy (no usar para nuevos servicios) | Tiene acceso a Drive Sheets externas que respaldan tablas BQ; el SA nuevo (`gmf-superbid-api`) también está en la ACL |

### Secretos en Secret Manager

Todos en `sbc-lovable`:

| Secreto | Contenido | Consumido por |
|---|---|---|
| `informegmf-supabase-url` | URL del proyecto Supabase Pro | Cloud Run env var |
| `informegmf-supabase-jwt` | JWT signing secret (legacy HS256) | No se usa post-migración (validamos via JWKS), pero se mantiene |
| `informegmf-supabase-secret` | Service role key | Cloud Run admin client |
| `informegmf-supabase-publishable` | Publishable anon key (formato `sb_*` nuevo) | No usado en runtime; el frontend usa la legacy JWT |
| `informegmf-supabase-password` | DB password | `supabase db push` para migraciones |
| `informegmf-resend` | Resend API key | Cloud Run jobs handlers |
| `informegmf-gcp-service` | (legacy) JSON key SA con `secretAccessor` | No se usa, runtime usa ADC |

En `sbc-data-int`:

| Secreto | Contenido |
|---|---|
| `lovable-bd-consulting` | JSON key del SA `lovable-bd-query` (legacy edge functions) |

### Recursos de despliegue

| Recurso | Detalle |
|---|---|
| Artifact Registry | `us-central1-docker.pkg.dev/sbc-lovable/informegmf` (Docker) |
| Cloud Run service | `gmf-superbid-api` en `us-central1`, min-instances=1, max-instances=5, 512 MiB, 1 CPU |
| Cloud Run domain mapping | `gmf-api.superbidcolombia.com` → `gmf-superbid-api`, cert managed |
| Firebase Hosting site | `informegmf.web.app` (default) + `gmf.superbidcolombia.com` (custom, cert pendiente) |
| Workload Identity Pool | `projects/604184934021/locations/global/workloadIdentityPools/github` con provider `github` y `attribute_condition = assertion.repository == 'sb-dataops/informegmf'` |

### Cloud Scheduler jobs

| Job | Schedule | Endpoint | Auth |
|---|---|---|---|
| `send-deadline-alerts` | `0 9 * * *` America/Bogota | `POST https://gmf-api.superbidcolombia.com/jobs/deadline-alerts` | OIDC con `gmf-scheduler@sbc-lovable`, audience `https://gmf-api.superbidcolombia.com` |
| `notify-auction-complete` | `0 9 * * *` America/Bogota | `POST .../jobs/auction-complete` | Idem |

## Modelo de auth

| Path | Mecanismo | Validador |
|---|---|---|
| `GET /health` | público | — |
| `GET /api/*` | user JWT de Supabase (ES256) | `authMiddleware` valida vía Supabase JWKS (`https://<ref>.supabase.co/auth/v1/.well-known/jwks.json`); rechaza role=anon |
| `GET\|POST /fetch-bigquery` | idem | idem |
| `GET\|POST /gcs-documents` | idem | idem |
| `POST /jobs/*` | OIDC ID token de Google | `oidcMiddleware` valida vs Google JWKS, comprueba audience y email del SA (Cloud Scheduler emite los tokens con email = `gmf-scheduler@...`) |

CORS lista (configurada en `backend/env.production.yaml`):

```
http://localhost:8080
https://informegmf.web.app
https://informegmf.firebaseapp.com
https://gmf.superbidcolombia.com
```

## Roles de aplicación (`public.user_roles`)

Enum `public.app_role`: `admin`, `editor`, `lector`, `lector_con_notificacion`.

Auto-asignación al primer login: tabla `public.role_seeds (email, role, applied_at)` precarga los emails autorizados con su rol; el trigger `handle_new_user` aplica el seed cuando la persona hace login con Google por primera vez.

Para agregar un nuevo usuario antes de que entre:

```sql
INSERT INTO public.role_seeds (email, role) VALUES
  ('persona@superbid.com.co', 'lector')
ON CONFLICT (email, role) DO NOTHING;
```

Para reasignar después de que ya entró: panel `/admin` del frontend (solo visible para `admin`).

Trigger `enforce_allowed_email_domain` rechaza signups que no sean `@superbid.com.co` o `@gmfinancial.com`.

## Tablas BigQuery clave (en `sbc-data-int`)

| Lógico | Identificador BQ | Tipo |
|---|---|---|
| relatorio | `sbc-data-int.relatorio_bq.relatorio_actual` | TABLE nativa |
| retiros | `sbc-data-int.r_retiros.r_retiros_gmf_2025` | EXTERNAL — Google Sheet |
| servitram | `sbc-data-int.r_retiros_tramitadores.r_tramitadores_servitram_gmf` | EXTERNAL — Google Sheet |
| gestramites | `sbc-data-int.r_retiros_tramitadores.r_tramitadores_gestramites` | EXTERNAL — Google Sheet |
| consolidadoChan | `sbc-data-int.HubSpot_uploads.consolidadoChan` | TABLE nativa |

Las 3 tablas EXTERNAL respaldadas por Google Sheets exigen acceso Drive en el SA. Los 3 Sheets están compartidos como Viewer con `gmf-superbid-api@sbc-lovable.iam.gserviceaccount.com` (y aún con `lovable-bd-query@sbc-data-int.iam.gserviceaccount.com` heredado).

## Pendientes para cumplir requerimientos GM Financial

| Requerimiento | Estado | Bloqueante |
|---|---|---|
| **IP whitelist (Cloud Armor)** | ⏳ pendiente CIDRs de GM | Lista de rangos CIDR de oficinas GM, NAT corporativa, VPN |
| **OKTA SSO** | ⏳ pendiente metadata SAML | Metadata XML del IdP de GM, atributos disponibles, dominio email, lista de usuarios/grupos |
| **Diagrama de arquitectura final** | ✅ este documento sirve como base | — |
| **Plan de soporte/backups** | ⏳ por documentar runbook | Decisión de SLAs |

Drafts de correo a GM en [`comunicaciones/`](./comunicaciones/).
