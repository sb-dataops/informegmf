# Documentación — Informe GMF

Documentos de referencia del aplicativo y de la migración a infraestructura propia.

## Índice

- **[Arquitectura](./arquitectura.md)** — estado actual del sistema, componentes, URLs, secretos, IAM, scheduler.
- **[Migración Lovable → GCP (mayo 2026)](./migracion-2026-05.md)** — registro histórico de la migración: qué se hizo, en qué orden, decisiones, issues resueltos.
- **[Comunicaciones GM Financial](./comunicaciones/)** — drafts de correos para coordinar requerimientos pendientes:
  - [IP whitelist (Cloud Armor)](./comunicaciones/gm-ip-whitelist.md)
  - [OKTA SSO (SAML 2.0)](./comunicaciones/gm-okta-sso.md)

## Convenciones

- Toda decisión de arquitectura no trivial debe quedar reflejada en `docs/arquitectura.md` o como ADR (cuando exista `docs/adr/`).
- Documentación en español. Comentarios técnicos cortos en inglés son aceptables si copian del SDK/runtime.
- El skill `.claude/skills/arch-check/` audita reglas duras del repo (máx 200 líneas/archivo, sin SQL hardcodeado en TS/JS, sin URLs hardcodeadas). Correr antes de PRs grandes.
