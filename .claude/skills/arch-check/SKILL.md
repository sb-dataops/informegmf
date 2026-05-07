---
name: arch-check
description: Audita la arquitectura del repo informegmf contra reglas duras de mantenibilidad — máx 200 líneas por archivo en src/ y backend/src/, cero SQL hardcodeado en TS/JS (debe vivir en .sql), cero URLs ni emails de service accounts hardcodeados en código (deben venir de config). Úsala proactivamente siempre que el usuario diga "arch check", "arch-check", "verifica arquitectura", "lint arquitectura", "audita código", "revisa líneas de archivos", "hardcoded", "modulariza", o cuando un PR grande mueva archivos en routes/, services/, lib/, middleware/. También úsala antes de mergear cualquier PR que pase de 500 líneas netas, o cuando notes que un archivo está creciendo más allá de 200 líneas.
---

# arch-check — Verificador de arquitectura

Linter para el repo informegmf que reporta violaciones de tres reglas duras. Es **read-only** — no auto-corrige, solo señala.

## Reglas

1. **Tamaño**: máx 200 líneas por archivo `.ts/.tsx/.js/.jsx` en `src/**` y `backend/src/**`.
2. **SQL en TS/JS**: cualquier query SQL detectada en archivos de código (template literals con `SELECT ... FROM`, `INSERT INTO`, `CREATE TABLE`, `WITH ... AS`, etc.) es violación. Las queries deben vivir en archivos `.sql` adyacentes y leerse en runtime con `fs.readFileSync` (en Node) o un import de bundler.
3. **Hardcoded en TS/JS**: URLs (`https?://...`), emails de service accounts (`*@*.iam.gserviceaccount.com`), y otros valores de configuración no deben aparecer literalmente en código. Tienen que venir de `config.ts` (lazy getter desde env var).

Excepciones intencionales en la regla 3 (URLs de Google APIs que los SDKs requieren explícitas):
- `https://accounts.google.com`
- `https://www.googleapis.com/oauth2/v3/certs`
- `https://oauth2.googleapis.com/token`
- `https://storage.googleapis.com`
- `https://bigquery.googleapis.com`

Archivos exentos siempre:
- `node_modules/**`, `dist/**`, `.next/**`
- Archivos auto-generados (`src/integrations/supabase/types.ts`, `client.ts`)
- Archivos `*.gen.ts` o con banner `// auto-generated`
- Configuración (`*.yaml`, `*.yml`, `*.json`, `*.sh`, `Dockerfile`) — son config por definición; las reglas 2 y 3 no aplican ahí

## Cómo correrla

Desde la raíz del repo:

```sh
python .claude/skills/arch-check/scripts/check.py
```

Sale con código `0` si no hay violaciones, `1` si las hay. Imprime un reporte markdown con tabla por regla. Lo pegás directo a tu respuesta.

## Cómo presentar resultados al usuario

Cuando ejecutes el script:

1. Mostrá el reporte completo si hay menos de 30 violaciones totales
2. Si hay más, mostrá las top 10 por archivo (por exceso de líneas) y las top 10 más recientes de SQL/hardcoded, y resumí el resto
3. Para cada violación, sugerí el refactor concreto:
   - Archivo > 200 líneas → "extraer X a `<file>.<aspect>.ts`" (proponé separación por concepto: handlers vs helpers, queries vs response shaping, etc.)
   - SQL en TS → "mover a `<feature>/queries/<name>.sql`, leer con `fs.readFileSync(new URL('./queries/<name>.sql', import.meta.url), 'utf8')`"
   - URL hardcodeada → "agregar a `config.ts` como `get foo(): string { return required("FOO_URL"); }`, configurar en `env.production.yaml` y `.env.example`"
4. Si hay 0 violaciones, simplemente confirmá: "✅ arch-check pasó. Todos los archivos cumplen las reglas."

## Cuándo NO sugerir refactor

- Si el archivo violador es generado (revisá el banner antes de proponer cambios)
- Si la URL es de un SDK de Google y está en la allowlist (no debería disparar pero si pasa, ignorá)
- Si el SQL "detectado" es en realidad un comentario o una constante de tipo (puede haber falsos positivos; revisá el snippet antes de actuar)
