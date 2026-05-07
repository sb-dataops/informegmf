# Informe GMF

Aplicativo de consulta de subastas, retiros, pagos y soportes para el cliente GM Financial Colombia, operado por Superbid LATAM.

## Stack

- **Frontend**: Vite + React 18 + TypeScript + shadcn/ui + Tailwind CSS, desplegado en **Firebase Hosting**.
- **Backend**: Node 22 + Hono en **Cloud Run** (`us-central1`).
- **Auth + Postgres**: **Supabase Pro** (`zbpvpduecodvnkjdrdoc`) con Google OAuth.
- **Datos analíticos**: BigQuery en `sbc-data-int`. Algunas tablas son federated sobre Google Sheets.
- **Storage**: Google Cloud Storage (`sb-relatorio-vendedor-gmf`).
- **Emails**: Resend.
- **Cron**: Cloud Scheduler.
- **CI/CD**: GitHub Actions con Workload Identity Federation (sin JSON keys).

## URLs

| Entorno | Frontend | Backend |
|---|---|---|
| Producción | https://informegmf.web.app · custom domain `https://gmf.superbidcolombia.com` (en provisioning) | https://gmf-api.superbidcolombia.com |
| Local dev | http://localhost:8080 | http://localhost:8081 (con `cd backend && npm run dev`) |

## Documentación

Toda la documentación vive en [`docs/`](./docs/):

- **[Arquitectura](./docs/arquitectura.md)** — componentes, IAM, secretos, scheduler, modelo de auth.
- **[Migración Lovable → GCP](./docs/migracion-2026-05.md)** — registro histórico de la migración (mayo 2026).
- **[Comunicaciones GM Financial](./docs/comunicaciones/)** — drafts de correos para coordinar IP whitelist y OKTA SSO.

## Setup local

Requisitos: Node.js 22 LTS, npm, gcloud CLI.

```sh
git clone https://github.com/sb-dataops/informegmf.git
cd informegmf
npm install
cp .env.example .env.local
# Edita .env.local con los valores reales (pídelos al lead técnico).
# El supabase publishable debe ser la legacy anon JWT (eyJ...), no la nueva sb_publishable_*.
npm run dev
```

La app queda en `http://localhost:8080`. El backend NO se necesita correr local para el frontend de dev — `VITE_API_BASE_URL` apunta a Cloud Run.

Si quieres correr el backend local también:

```sh
cd backend
npm install
cp .env.example .env.local
# Llenar valores. Para credenciales GCP en local: GOOGLE_APPLICATION_CREDENTIALS=/path/to/sa.json
npm run dev
```

## Deploy

Tanto frontend como backend se deployan **automáticamente** vía GitHub Actions cuando se hace merge a `main` y los cambios afectan archivos relevantes.

| Workflow | Trigger | Acción |
|---|---|---|
| `.github/workflows/deploy-backend.yml` | Push a main que toque `backend/**` | Build via Cloud Build, deploy a Cloud Run |
| `.github/workflows/deploy-frontend.yml` | Push a main que toque `src/**`, `vite.config.ts`, `firebase.json`, etc. | `npm run build` + `firebase-tools deploy` |

Para deploy manual del backend:

```sh
./backend/deploy.sh
```

## Scripts del frontend

| Comando | Descripción |
|---------|-------------|
| `npm run dev` | Servidor de desarrollo Vite con HMR |
| `npm run build` | Build de producción a `dist/` |
| `npm run build:dev` | Build en modo development |
| `npm run preview` | Sirve el build local |
| `npm run lint` | ESLint |
| `npm run test` | Vitest una sola corrida |
| `npm run test:watch` | Vitest en modo watch |

## Estructura del repo

```
.
├── src/                   # frontend Vite/React
├── backend/               # Cloud Run service (Node + Hono)
│   ├── src/
│   │   ├── index.ts
│   │   ├── middleware/    # auth, oidc, cors
│   │   ├── routes/
│   │   │   ├── bigquery/  # 25 archivos modulares + 33 .sql
│   │   │   ├── documents.ts
│   │   │   └── jobs.ts
│   │   ├── services/      # bq, supabase, gcs, resend
│   │   └── lib/
│   ├── cloudbuild.yaml
│   ├── deploy.sh
│   └── env.production.yaml
├── supabase/
│   └── migrations/        # schema versionado
├── docs/                  # documentación (ver index arriba)
├── .github/workflows/     # CI/CD
├── .claude/skills/
│   └── arch-check/        # skill que audita reglas duras del repo
├── firebase.json          # Firebase Hosting config
└── .firebaserc
```

## Convenciones

- Trabajo se hace en la rama `staging`. PRs van `staging → main` con 1 review requerida (rama `main` protegida).
- Commits en español, sentence case.
- El skill `arch-check` enforza:
  - Máx 200 líneas por archivo en `src/` y `backend/src/`
  - Cero SQL hardcodeado en TS/JS (debe vivir en `.sql`)
  - Cero URLs / emails de service accounts hardcodeados (deben venir de config)

```sh
python .claude/skills/arch-check/scripts/check.py
```

## Roles de aplicación

Roles definidos en `public.user_roles`:

- `admin` — todo (incluido panel `/admin`)
- `editor` — carga soportes, edita pagos
- `lector` — solo consulta
- `lector_con_notificacion` — consulta + recibe emails diarios de deadline alerts

Para precargar el rol de un nuevo usuario antes de que entre, hay tabla `public.role_seeds`:

```sql
INSERT INTO public.role_seeds (email, role) VALUES
  ('persona@superbid.com.co', 'lector')
ON CONFLICT (email, role) DO NOTHING;
```

El trigger `handle_new_user` lo aplica al primer login. Para cambios después de que entró: panel `/admin` del frontend.

## Pendientes para cumplimiento GM Financial

- **IP whitelist con Cloud Armor**: pendiente CIDRs de GM. Ver [docs/comunicaciones/gm-ip-whitelist.md](./docs/comunicaciones/gm-ip-whitelist.md).
- **OKTA SSO**: pendiente metadata SAML de GM. Ver [docs/comunicaciones/gm-okta-sso.md](./docs/comunicaciones/gm-okta-sso.md).
- **Cert custom domain frontend**: `gmf.superbidcolombia.com` en provisioning.
