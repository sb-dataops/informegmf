# Migración Lovable → GCP (mayo 2026)

Registro histórico de la migración del aplicativo Informe GMF de la plataforma Lovable + Supabase compartido a infraestructura propia (Firebase Hosting + Cloud Run + Supabase Pro propio en GCP).

Toda la migración se ejecutó en una sola sesión de pair programming, distribuida en 13 PRs incrementales.

## Antes vs después

| Capa | Antes | Después |
|---|---|---|
| Frontend hosting | `*.lovable.app` (SaaS Lovable) | Firebase Hosting (`informegmf.web.app` + custom `gmf.superbidcolombia.com`) |
| Auth + Postgres | Supabase compartido (cuenta Lovable) | Supabase Pro propio (`zbpvpduecodvnkjdrdoc`) |
| Backend / API | 5 Edge Functions Supabase (Deno) | Cloud Run en `sbc-lovable`, Node 22 + Hono |
| Auth GCP | JSON key del service account en env vars | ADC (sin JSON keys) — SA atado al servicio |
| Secretos | Variables de entorno Lovable | Google Secret Manager + `--set-secrets` en Cloud Run |
| Emails (Resend) | Vía gateway Lovable (`connector-gateway.lovable.dev`) + LOVABLE_API_KEY | SDK directo de Resend |
| Cron jobs | `pg_cron` en Supabase compartido | Cloud Scheduler con OIDC |
| Deploys | Manuales desde el panel Lovable | GitHub Actions con Workload Identity Federation |
| Validación de auth en backend | Project anon key como Bearer | User JWT de Supabase via JWKS (ES256) + OIDC para `/jobs/*` |

## Cronología de PRs

| # | Título | Resumen |
|---|---|---|
| 1 | Higiene `.env` | Saca `.env` del repo, agrega `.env.example`, actualiza `.gitignore` |
| 2 | Limpieza Lovable | Quita `@lovable.dev/cloud-auth-js`, `lovable-tagger`, `lovable-agent-playwright-config`. Auth.tsx pasa a `supabase.auth.signInWithOAuth(...)` directo. Index.html sin meta de Lovable. README rewrite |
| 3 | Cliente apiFetch | `src/lib/api-client.ts` centraliza fetch al backend. Servicios usan path relativo + `VITE_API_BASE_URL`. Frontend agnóstico de dónde corre el backend |
| 4 | Scaffold backend Hono | `backend/` con Node 20, Hono, Dockerfile multi-stage, `/health` y `/api/whoami`. Auth middleware base con HS256 |
| 5 | Port `fetch-bigquery` | 1620 líneas Deno → Node + Hono. SDKs `@google-cloud/bigquery` con scopes Drive |
| 6 | Port `gcs-documents` | Edge function de upload/list/view/delete → Cloud Run. SDK `@google-cloud/storage` con ADC |
| 7 | Port cron emails | `notify-auction-complete`, `send-deadline-alerts`, `test-notifications` → `POST /jobs/*` con SDK Resend directo. **Backend ya no tiene NINGUNA referencia a Lovable.** |
| 8 | OIDC middleware + browser auth | `oidcMiddleware` para `/jobs/*`. Cloud Run pasa a `--allow-unauthenticated` (el browser no puede emitir Google identity tokens) |
| 9 | Pipeline de deploy + CI/CD WIF | `cloudbuild.yaml`, `deploy.sh`, `env.production.yaml`, `.gcloudignore`. GitHub Actions `deploy-backend.yml` con Workload Identity Federation. Setup IAM en GCP |
| 10 | authMiddleware JWKS + OIDC email check | Switch validación de JWT a JWKS (Supabase emite ES256, no HS256). OIDC valida también email del SA |
| 11 | (Staging cleanup) | Sincronización |
| 12 | Frontend Firebase + role_seeds + cleanup | `firebase.json`, `.firebaserc`, GHA `deploy-frontend.yml`, decommission de edge functions, `role_seeds` para auto-asignar roles a usuarios viejos |
| 13 | Fix deploy-frontend | `GOOGLE_CLOUD_QUOTA_PROJECT=informegmf` para que Firebase APIs se cobren contra el proyecto correcto, IAM extra en `informegmf` para el deployer SA |

## Decisiones técnicas tomadas

### Stack

- **Backend**: Node 22 + Hono. Más liviano que Express, ergonomía similar a las edge functions Deno originales, ideal para Cloud Run con cold starts mínimos.
- **Frontend**: Vite + React 18 + TypeScript + shadcn/ui (sin cambios — solo limpiamos lo de Lovable).
- **Auth**: mantener email/password + Google OAuth (opción A confirmada). OKTA SSO viene en fase posterior.
- **Lockfile**: npm + `package-lock.json` consolidado. Borrados `bun.lock` y `bun.lockb` que conviven.

### Auth

- Frontend manda **user JWT de sesión** (no anon) al backend. `apiFetch` resuelve la sesión con `supabase.auth.getSession()` y pone `Authorization: Bearer <session.access_token>`.
- Backend valida el JWT contra el **JWKS de Supabase** (no el shared secret) porque Supabase emite ES256 con kid rotativo. Antes intentamos HS256 con el JWT secret y fallaba con `Invalid or expired token`.
- `/jobs/*` aceptan **OIDC tokens firmados por Google**. Cloud Run con `--allow-unauthenticated` deja que cualquiera intente, pero `oidcMiddleware` valida audience + email del SA (Cloud Scheduler emite tokens con email del SA `gmf-scheduler@...`).

### Datos

- **Schema** (16 migraciones existentes en `supabase/migrations/`) aplicado al Supabase Pro nuevo con `supabase db push`.
- **Datos transaccionales** (`pagos`, `documentos`, `notifications`, etc.) NO migrados. Decisión consciente — la app empieza limpia en producción y los soportes históricos quedan en el Supabase viejo (que se decomisiona después).
- **Usuarios**: no se migran passwords. Tabla `role_seeds` precarga el mapping email→rol de los 6 usuarios del Supabase viejo. El trigger `handle_new_user` aplica el rol cuando el usuario hace login con Google por primera vez.

### Despliegue

- **CI/CD**: GitHub Actions con Workload Identity Federation. Sin JSON keys en ningún lado.
- **Pipeline backend**: Cloud Build (`backend/cloudbuild.yaml`) hace build, push a Artifact Registry, y `gcloud run deploy` en una sola corrida.
- **Pipeline frontend**: build con `npm ci && npm run build` (env vars desde GH repo variables `vars.VITE_*`), deploy con `firebase-tools`.
- **Deploy manual de respaldo**: `./backend/deploy.sh` (wrapper sobre Cloud Build).

## Issues encontrados y resoluciones

| Issue | Síntoma | Causa | Fix |
|---|---|---|---|
| `Unsupported provider: missing OAuth secret` | Login con Google falla en el Supabase nuevo | Google OAuth provider no configurado en Supabase | Configurar Client ID/Secret de Google Cloud OAuth en Authentication → Providers → Google |
| Drive permission denied al hacer query a tablas EXTERNAL | 403 en `r_retiros_gmf_2025` y otras | El SA `lovable-bd-query` (y luego `gmf-superbid-api`) no estaba como Viewer en los Sheets que respaldan las tablas | Compartir los 3 Sheets con el SA |
| Browser falla en login Google al cambiar dominio | `redirect_uri_mismatch` | Origins/redirect URLs en Google OAuth Client y en Supabase Auth no incluían el nuevo dominio | Agregar `https://gmf.superbidcolombia.com` a Google Cloud Console (Authorized JavaScript origins) y a Supabase (Site URL + Redirect URLs) |
| Publishable key nuevo (`sb_publishable_*`) rompe Edge Functions | 401 `INVALID_JWT_FORMAT` | La nueva publishable key NO es JWT (es opaca); las Edge Functions del Supabase exigen JWT en Authorization | Usar el legacy anon JWT (`eyJ...`) en `VITE_SUPABASE_PUBLISHABLE_KEY` |
| 500 en `/fetch-bigquery` después del cutover | Backend explota antes de llegar al `runQuery` | `@supabase/supabase-js` instancia un Realtime client al hacer `createClient()`, que requiere WebSocket nativo (Node 22+) | Subir Dockerfile a `node:22-slim` |
| 401 `INVALID_JWT_FORMAT` post Node 22 | User JWT del frontend no valida contra HS256 con JWT secret | Supabase emite user JWTs con ES256 (asymmetric), no HS256. El JWT secret no aplica | `authMiddleware` cambia a `createRemoteJWKSet(URL_JWKS)` y verifica con la clave pública del JWKS |
| `Failed to get Firebase project informegmf` en GHA | El deploy del frontend falla en GHA pero funciona local | Dos problemas: (a) SA del deployer no tiene permiso para usar `informegmf` como quota project, (b) Firebase APIs no están habilitadas en `sbc-lovable` (home del SA) | Grant `serviceusage.serviceUsageConsumer` en `informegmf` + setear `GOOGLE_CLOUD_QUOTA_PROJECT=informegmf` en el step del workflow |
| 1421 líneas en `bigquery.ts`, SQL embebido | Falla `arch-check`, mal mantenible | Edge function original era monolítica | Refactor a 25 archivos modulares + 33 `.sql` separados con `render-query.ts` que sustituye `${PLACEHOLDER}` |

## Lo que quedó pendiente

- **IP whitelist con Cloud Armor** (plan §14) — bloqueado en CIDRs de GM. Ver [comunicaciones/gm-ip-whitelist.md](./comunicaciones/gm-ip-whitelist.md).
- **OKTA SSO** (plan §4) — bloqueado en metadata SAML de GM. Ver [comunicaciones/gm-okta-sso.md](./comunicaciones/gm-okta-sso.md).
- **Cert custom domain frontend** — `gmf.superbidcolombia.com` provisionando al cierre.
- **Decommission edge functions del Supabase viejo** (`xcybuhvuwlahjpxvlkun`) — manual vía dashboard. Sin urgencia, los crons ya están desactivados.
- **Refactor archivos > 200 líneas en frontend** (sidebar, FilteredLots, Index, etc.) — el skill `arch-check` los reporta. Sin urgencia.

## Skill de arquitectura

`.claude/skills/arch-check/` audita 3 reglas duras:

1. Máx 200 líneas por archivo en `src/**` y `backend/src/**`.
2. Sin SQL hardcodeado en TS/JS (debe vivir en `.sql`).
3. Sin URLs ni emails de service accounts hardcodeados.

Correr antes de PRs grandes:

```sh
python .claude/skills/arch-check/scripts/check.py
```

Sale con exit 0 si OK, 1 si hay violaciones. Reporta tabla por regla con archivos afectados.

## Equipo y créditos

Migración planeada y ejecutada por **dataops@superbid.com.co** (lead técnico + PM) con asistencia de Claude Sonnet 4.5 (1M context).

El plan original de migración (20 secciones) vivía en `~/Downloads/plan-migracion-gmf-superbid.md` antes de empezar. Esta documentación reemplaza ese plan como fuente de verdad.
