# Diagramas de arquitectura — Informe GMF

Fuente de verdad: archivos `*.mmd` (sintaxis Mermaid). Los PNGs se generan a partir de ellos para adjuntar a comunicaciones con GM Financial.

## Archivos

| Archivo | Tipo | Descripción |
|---|---|---|
| `01-overview.mmd` / `.png` | flowchart TB | Vista general de componentes (frontend, backend, DBs, externos). Marcado dashed para ítems "planeados" (Cloud Armor, LB, OKTA). |
| `02-network-cloud-armor.mmd` / `.png` | flowchart LR | Lógica de IP whitelist en Cloud Armor: 13 IPs GMF + CIDRs Superbid + GCP scheduler + deny default. |
| `03-auth-okta-saml.mmd` / `.png` | sequenceDiagram | Flujo SSO con OKTA SAML 2.0 (1-14 pasos). |
| `04-jobs-cloud-scheduler.mmd` / `.png` | sequenceDiagram | Flujo de Cloud Scheduler invocando `/jobs/*` con OIDC. |

## Regenerar PNGs

mermaid-cli (`mmdc`) requiere puppeteer + chrome local; en Windows con npm cache restringido suele fallar. Usamos el servicio público `mermaid.ink` que renderiza vía HTTP GET con el `.mmd` codificado en base64-url-safe.

Desde `docs/diagrams/`:

```bash
for f in *.mmd; do
  b64=$(base64 -w0 "$f" | tr '+/' '-_' | tr -d '=')
  curl -sS -o "${f%.mmd}.png" --max-time 60 \
    "https://mermaid.ink/img/$b64?type=png&bgColor=ffffff&width=2400"
  echo "$f -> $(stat -c%s "${f%.mmd}.png") bytes"
done
```

Parámetros usados:
- `type=png` → formato PNG (también soporta `svg`, `jpeg`, `webp`).
- `bgColor=ffffff` → fondo blanco (default es transparente, malo para email).
- `width=2400` → resolución horizontal de 2400px (legible al imprimir o ver fullscreen).

## Adjuntar a GM Financial

Para el correo de respuesta a Edwin Rivera, los archivos a anexar son los `*.png`:

- `01-overview.png` — el principal (vista de componentes).
- `02-network-cloud-armor.png` — soporta la sección de IP whitelist.
- `03-auth-okta-saml.png` — soporta la sección de OKTA SSO.
- `04-jobs-cloud-scheduler.png` — opcional, solo si pregunta sobre los crons.

Los `*.mmd` quedan en el repo como source of truth y para reproducibilidad.

## Editar un diagrama

1. Modificá el `.mmd` correspondiente.
2. Regenerá el PNG con el comando de arriba.
3. Verificá visualmente abriendo el PNG.
4. Commit `*.mmd` + `*.png` juntos para mantenerlos sincronizados.
5. Si el cambio afecta el contenido de `docs/arquitectura.md` (que embebe los Mermaid inline), sincronizar también allí.
