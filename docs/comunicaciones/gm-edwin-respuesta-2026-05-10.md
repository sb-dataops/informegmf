# Respuesta a Edwin Rivera (GMF) — confirmaciones + diagrama

## Contexto

Edwin Rivera (IT Senior Specialist GMF) respondió el 8 may 2026 al thread "RE: SOLICITUD NUEVO APLICATIVO SUPERBID" entregando:

- ✅ 13 IPs USA para whitelist (salida 100% por NAT corporativo USA)
- ✅ Aceptó nuestro mapeo de roles (admin/editor/lector/lector_con_notificacion → grupos `Okta_SuperBid_*`)
- ✅ Confirmó atributos (email, givenName+familyName, groups)
- ❓ Pidió confirmar: URL única del aplicativo, Callback URL, Redirect URL
- ❓ Pidió diagrama de arquitectura (3ra vez en el thread — entregable bloqueante)
- ❌ Aún no envía: metadata SAML del IdP, lista usuarios + roles iniciales, cuenta de prueba

## Mensaje a enviar

**Para**: `Edwin.Rivera@gmfinancial.com`
**Cc**: `Samuel.Pinzon@gmfinancial.com`, `Sandra.Rivera@gmfinancial.com`, `Walter.Urrego@gmfinancial.com`, `Jose.BlancoColmenares@gmfinancial.com`, equipo Superbid del thread (`maria.villa`, `sara.munoz`, `juliana.murillo`, `juan.lopez`, `retiros1`, `wuilson.chan`, `pagos`)
**Asunto**: `RE: SOLICITUD NUEVO APLICATIVO SUPERBID — confirmaciones + diagrama de arquitectura`
**Adjuntos**:
- `01-overview.png`
- `02-network-cloud-armor.png`
- `03-auth-okta-saml.png`
- `04-jobs-cloud-scheduler.png`

---

```
Hola Edwin,

Muchas gracias por la lista de IPs y por la coordinación con el equipo
OKTA. Confirmo todo lo que pediste y respondo punto por punto.

═══ Confirmaciones de las URLs (lado Service Provider) ═══

1. URL única de acceso al aplicativo:
   • Frontend (donde entran los usuarios):
       https://gmf.superbidcolombia.com
   • Backend / API (referencial, no requiere acceso directo del usuario):
       https://gmf-api.superbidcolombia.com

2. Callback URL (SP Entity ID / Metadata):
       https://zbpvpduecodvnkjdrdoc.supabase.co/auth/v1/sso/saml/metadata
   ✓ Confirmado.

3. Redirect URL (ACS — Assertion Consumer Service):
       https://zbpvpduecodvnkjdrdoc.supabase.co/auth/v1/sso/saml/acs
   ✓ Confirmado.

4. NameID Format:
       urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress

5. Single Logout (SLO): no requerido inicialmente.

6. Firma de assertion: recomendado, no obligatorio.

═══ Roles y atributos ═══

El mapeo que propusieron funciona perfectamente:

   admin                    → Okta_SuperBid_Admin
   editor                   → Okta_SuperBid_Editor
   lector                   → Okta_SuperBid_Lector
   lector_con_notificacion  → Okta_SuperBid_LectorNoti

Atributos requeridos confirmados:
   • email (NameID)
   • givenName + familyName  (o full_name como atributo único)
   • groups (mapeado a los Okta_SuperBid_* anteriores)

═══ Diagrama de arquitectura ═══

Adjunto 4 PNGs que cubren los flujos del sistema:

   • 01-overview.png            — vista general de componentes
                                   (frontend, backend, DBs, externos)
   • 02-network-cloud-armor.png — flujo de IP whitelist Cloud Armor
                                   (incluye sus 13 IPs)
   • 03-auth-okta-saml.png      — flujo de autenticación OKTA SAML
                                   (post-integración)
   • 04-jobs-cloud-scheduler.png — flujo de los crons internos
                                   (no impacta el usuario final)

Si necesitan más detalle técnico (tabla de service accounts, secretos
en GCP, configuración de Supabase, etc.) puedo compartir el documento
completo.

═══ Pendientes de su lado para arrancar la integración OKTA ═══

Para que podamos configurar la integración OKTA en Supabase Auth,
necesitamos de ustedes:

  1. Metadata SAML del IdP. Una de las dos opciones:
     a) URL pública del metadata XML, o
     b) El archivo XML adjunto exportado desde OKTA.
     Contiene Issuer / Entity ID, Single Sign-On URL (HTTP-POST
     binding) y certificado X.509 de firma.

  2. Lista inicial de usuarios o grupos OKTA con su rol asignado
     (lo que Samuel quedó de confirmar). Idealmente en formato:
       email                    → rol app
       persona@gmfinancial.com  → admin / editor / lector / lector_con_notificacion

  3. Una cuenta de prueba en OKTA con la que validemos el flujo
     end-to-end antes de habilitarlo para todos los usuarios.

═══ Estado de IP whitelist (Cloud Armor) ═══

Sus 13 IPs ya están listadas para configurarse. Estamos coordinando
internamente con IT de Superbid para confirmar nuestra IP de salida
(VPN corporativo Forticlient) y agregarla al whitelist también, para
que los administradores de nuestro lado puedan seguir cargando
soportes y gestionando pagos.

Antes de aplicar el "deny default" voy a configurar la política en
modo preview (loguea pero no bloquea) para confirmar que el tráfico
desde sus 13 IPs llega correctamente y evitar bloquear usuarios
legítimos.

═══ Tiempos ═══

  • IP whitelist (Cloud Armor):
      ~1h configurar + 24-48h en preview + 30 min validar antes de
      pasar a enforce. Lo arrancamos esta semana.

  • OKTA SSO:
      1-2h configurar + 30 min de pruebas con la cuenta test.
      Comenzamos en cuanto recibamos los 3 puntos del bloque
      anterior (metadata, lista de usuarios, cuenta de prueba).

Quedamos atentos a sus comentarios y a la información solicitada.

Saludos,
Juan Esteban Saavedra Mayorga
Analista Junior | Comercial
Superbid Colombia
```

---

## Checklist antes de enviar

- [ ] Confirmar quién firma — el remitente original fue Juan Saavedra; si firma otra persona ajustar nombre y cargo.
- [ ] Adjuntar los 4 PNGs de `docs/diagrams/*.png`.
- [ ] Verificar que la lista de Cc del thread original esté completa (Maria Paula Villa, Sara Cristina Usma, Juliana Murillo, Juan David Lopez, Retiros Superbid, Wuilson Chan, Pagos Superbid).
- [ ] Si querés mandar el documento de arquitectura completo (no solo los PNGs), exportar `docs/arquitectura.md` a PDF o adjuntarlo en MD.

## Qué desbloquea este correo

- **De su lado**: que Samuel confirme la lista de usuarios + roles iniciales (item 2 de pendientes), y que el equipo OKTA mande el metadata XML (item 1).
- **De nuestro lado**: nada, ya tenemos lo que necesitábamos (las 13 IPs y el aval del mapeo de roles).
- **Mantiene momentum**: GMF ve avance concreto (diagrama entregado, URLs confirmadas), no quedamos como bloqueantes.
