# Informe GMF

Aplicativo de consulta de subastas, retiros, pagos y soportes para el cliente GMF Financial.

## Stack

- Vite + React 18 + TypeScript
- shadcn/ui + Tailwind CSS
- Supabase (auth + Postgres)
- BigQuery (`sbc-data-int`) para datos analíticos
- GCS para almacenamiento de soportes
- Resend para emails transaccionales

## Requisitos

- Node.js 20 LTS
- npm

## Setup local

```sh
git clone https://github.com/sb-dataops/informegmf.git
cd informegmf
npm install
cp .env.example .env.local
# Edita .env.local con los valores reales (pídelos a un mantenedor)
npm run dev
```

La app queda en `http://localhost:8080`.

## Scripts

| Comando | Descripción |
|---------|-------------|
| `npm run dev` | Servidor de desarrollo con HMR |
| `npm run build` | Build de producción a `dist/` |
| `npm run build:dev` | Build en modo development |
| `npm run preview` | Sirve el build localmente |
| `npm run lint` | ESLint |
| `npm run test` | Vitest una sola corrida |
| `npm run test:watch` | Vitest en modo watch |

## Estructura

```
src/
├── pages/          # Rutas de la SPA
├── services/       # Clientes para BigQuery, autocompletado, documentos, pagos
├── components/     # UI (shadcn + propios)
├── integrations/   # Cliente Supabase
└── lib/            # Helpers compartidos

supabase/
├── functions/      # Edge functions (en migración a Cloud Run)
└── migrations/     # Schema versionado
```

## Flujo de trabajo

- Trabajo se hace en la rama `staging`.
- Cambios a `main` se promueven solo vía Pull Request (1 review requerida).
- `main` está protegida: no se permiten force-push ni borrado.

## Migración en curso

Estamos migrando la app de Lovable + Supabase compartido a Firebase Hosting + Cloud Run + Supabase Pro propio. Hasta que termine la migración, esta sección se irá actualizando con los hitos completados.
