# Rollout 2026-05-10 — Cloud Armor + LB para Informe GMF API

Despliegue de Google Cloud Armor + HTTPS Load Balancer delante de Cloud Run `gmf-superbid-api` para cumplir el requerimiento de IP whitelist de GM Financial.

## Decisiones

| Tema | Decisión | Razón |
|---|---|---|
| Cert TLS | Certificate Manager con DNS validation | Cero TLS downtime en cutover (el cert se valida sin tocar A record) |
| Cloud Scheduler `/jobs/*` | Mover a URL canónica de Cloud Run (`*.run.app`) con OIDC + IAM `run.invoker` | No depende de IP ranges GCP cambiantes; mantiene auth fuerte |
| Modo inicial Cloud Armor | `preview` 24-48h | Permite ver tráfico real en logs antes de bloquear |
| DNS provider | Hostinger (editado por dataops@superbid.com.co) | — |
| Cutover | 2026-05-10 mismo día | — |

## IPs whitelist

### GMF (13 IPs USA, /32)
```
139.180.25.100  139.180.27.100  139.180.25.120  139.180.27.120
185.221.71.34
206.109.200.120 206.109.201.120
208.65.145.34   208.81.69.34    208.81.70.34
63.96.91.120    63.96.138.120
64.117.235.120
```

### Superbid (2 IPs Fortinet, /32, balanceo + failover)
```
190.60.239.250  (IFX,   AS18747, Medellín)
181.48.199.59   (Claro, AS14080, Bogotá-Suba)
```

## Recursos creados en `sbc-lovable` (todos ✅ 2026-05-12)

| Tipo | Nombre | Detalle |
|---|---|---|
| Global static IP | `gmf-superbid-api-ip` | **`34.36.21.184`** |
| Cert Manager DNS auth | `gmf-api-superbidcolombia-dns-auth` | CNAME `_acme-challenge.gmf-api → ae36fdc4-…authorize.certificatemanager.goog` (pegado en Hostinger) |
| Cert Manager cert | `gmf-api-superbidcolombia-cert` | ACTIVE — validado con DNS auth |
| Cert Manager map | `gmf-api-cert-map` | hostname binding |
| Cert map entry | `gmf-api-cert-map-entry` | hostname=gmf-api.superbidcolombia.com → cert |
| Serverless NEG | `gmf-superbid-api-neg` (us-central1) | → Cloud Run `gmf-superbid-api` |
| Backend Service | `gmf-superbid-api-backend` | global, EXTERNAL_MANAGED, con Cloud Armor attached |
| Cloud Armor policy | `gmf-superbid-api-policy` | 4 custom rules + default allow |
| URL Map | `gmf-superbid-api-url-map` | default → backend service |
| Target HTTPS Proxy | `gmf-superbid-api-https-proxy` | URL map + cert map |
| Forwarding Rule | `gmf-superbid-api-fr` | global, port 443, IP estática |

### Cloud Armor rules (todas en `--preview` al cierre del 2026-05-12)

| Priority | Action | IPs | Descripción |
|---:|---|---|---|
| 1000 | allow | 10 GMF /32 (parte 1) | `139.180.25.100, .27.100, .25.120, .27.120, 185.221.71.34, 206.109.200.120, .201.120, 208.65.145.34, .81.69.34, .81.70.34` |
| 1001 | allow | 3 GMF /32 (parte 2) | `63.96.91.120, .138.120, 64.117.235.120` |
| 2000 | allow | 2 Superbid /32 | `190.60.239.250` (IFX), `181.48.199.59` (Claro) |
| 2147483646 | deny-403 | `*` | Simulated default deny (preview) — switch a enforce después de 24-48h logging |
| 2147483647 | allow | (default) | Default rule (no se puede preview, queda como fallback seguro) |

## Cloud Scheduler — cambio de target ✅ 2026-05-12

Jobs afectados (en `sbc-lovable`, region `us-central1`):
- `send-deadline-alerts` → `https://gmf-superbid-api-fzzeqxigma-uc.a.run.app/jobs/deadline-alerts`
- `notify-auction-complete` → `https://gmf-superbid-api-fzzeqxigma-uc.a.run.app/jobs/auction-complete`

OIDC audience del token se mantuvo en `https://gmf-api.superbidcolombia.com` (el `oidcMiddleware` del backend valida la audience contra `JOBS_OIDC_AUDIENCE` que está hardcoded a ese valor — la audience del OIDC token es independiente de la URL real del request, por eso esto funciona sin tocar código ni env vars).

SA `gmf-scheduler@sbc-lovable.iam.gserviceaccount.com` sigue con `roles/run.invoker` sobre el servicio (Cloud Run además tiene `allUsers` con `run.invoker` desde antes, así que el ingress unauthenticated también funciona — la auth real la hace el `oidcMiddleware`).

Próximo run de los jobs: daily 9 AM America/Bogota — usan la URL canónica, **NO pasan por el LB ni por Cloud Armor**.

## Plan de ejecución por fases

- [x] **Fase 0** — Habilitar Compute + Cert Manager + Network Security APIs (2026-05-12).
- [x] **Fase 1** — Crear todos los recursos GCP sin tocar DNS (2026-05-12).
- [x] **Fase 2** — Smoke test con `curl --resolve` → 200 OK desde `34.36.21.184` (2026-05-12).
- [x] **Fase 3** — Mover Cloud Scheduler a URL canónica (2026-05-12).
- [x] **Fase 4** — Cutover DNS: A record `gmf-api → 34.36.21.184` en Hostinger. Propagación tardó ~12-15h por delay interno de Hostinger (SOA serial sigue siendo `2026050701`, pero los NS sirven la respuesta nueva). Smoke test post-cutover via DNS público → HTTP 200, cert TLS válido, `remote_ip=34.36.21.184` (2026-05-13).
- [x] **Fase 4b** — Cleanup: domain mapping de Cloud Run `gmf-api.superbidcolombia.com` borrado (2026-05-13). Smoke test post-cleanup → HTTP 200 OK.
- [x] **Fase 4c** — Logging habilitado en backend service (`--enable-logging --logging-sample-rate=1.0`) para que Cloud Armor capture todo el tráfico en los logs (2026-05-13).
- [ ] **Fase 5** — 24-48h en preview + revisar logs Cloud Armor + switch a enforce.

## Estado post-Fase 4 (2026-05-13)

- Custom domain `https://gmf-api.superbidcolombia.com` resuelve a IP del LB (`34.36.21.184`).
- Tráfico HTTPS pasa por: cliente → LB → Cloud Armor (preview) → Backend Service → NEG → Cloud Run.
- Cloud Armor preview: las 4 rules custom (3 allow + 1 simulated deny) **loguean** match pero **no enforce**. Cualquier IP entra; los logs muestran qué hubiera pasado en enforce.
- Cloud Scheduler invoca `/jobs/*` por URL canónica (`*.run.app`), independiente del LB y de Cloud Armor.
- Frontend `https://gmf.superbidcolombia.com` sin cambios (sigue por Firebase Hosting).

## Fase 5 — checklist antes de switch a enforce

A correr 24-48h después del cutover (2026-05-14 o 2026-05-15):

1. Revisar Cloud Armor logs en Cloud Logging:
   ```
   resource.type="http_load_balancer"
   AND resource.labels.url_map_name="gmf-superbid-api-url-map"
   ```
   Filtros útiles:
   - `jsonPayload.previewSecurityPolicy.outcome="DENY"` → tráfico que sería bloqueado
   - `jsonPayload.previewSecurityPolicy.matchedPriority=2147483646` → matches contra la simulated default deny
2. Confirmar que los matches DENY vienen solo de IPs externas no autorizadas (no de GMF ni de Superbid FortiGate). Si hay matches legítimos faltantes, agregar la IP al whitelist antes del switch.
3. Switch a enforce: por cada rule, `gcloud compute security-policies rules update <prio> --security-policy=gmf-superbid-api-policy --no-preview --project=sbc-lovable`.
4. Smoke test post-enforce:
   - Desde mi IP (Telmex residencial, fuera de whitelist) → debe retornar 403.
   - Desde `VPN SUPERBID` conectado (debería salir por IFX o Claro) → debe retornar 200.
   - Pedirle a GMF que prueben desde una de sus 13 IPs → debe retornar 200.

## Rollback

Cada paso es reversible:
- Cualquier recurso del LB → `gcloud compute ... delete`
- DNS → revertir A record al CNAME original de Cloud Run
- Cloud Scheduler → revertir target a `gmf-api.superbidcolombia.com`
- Cloud Armor → mantener en `preview` (no bloquea) o detach del backend service
