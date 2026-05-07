# Comunicación a GM Financial — OKTA SSO (SAML 2.0)

## Contexto interno

GM Financial pidió integración de autenticación con su OKTA corporativo. Actualmente el aplicativo usa Google OAuth vía Supabase Auth y restringe a dominios `@superbid.com.co` y `@gmfinancial.com`. Tras la integración SAML, los usuarios `@gmfinancial.com` entrarán por SSO contra el OKTA de GM en lugar de Google.

### Implementación técnica que haremos del lado Superbid

Cuando lleguen el metadata + atributos:

1. En el dashboard de Supabase Pro (`zbpvpduecodvnkjdrdoc`) → Authentication → SSO → Add SAML provider:
   - Pegar metadata XML de GM (Issuer, SSO URL, X.509 cert)
   - Configurar dominio: `gmfinancial.com`
   - Atributos: mapear `email` → `email`, `name` o `givenName+familyName` → `display_name`
2. (Alternativa CLI) `npx supabase sso add saml --metadata-url <URL> --domains gmfinancial.com`
3. Verificar con cuenta de prueba — el flujo:
   - Frontend redirige a `https://zbpvpduecodvnkjdrdoc.supabase.co/auth/v1/sso?domain=gmfinancial.com`
   - Supabase redirige al SSO de OKTA
   - Usuario se autentica
   - OKTA POSTea SAML response a `https://zbpvpduecodvnkjdrdoc.supabase.co/auth/v1/sso/saml/acs`
   - Supabase crea sesión y redirige al frontend
   - El trigger `handle_new_user` crea profile y aplica `role_seeds` si hay match por email
4. Frontend `Auth.tsx` agrega botón "Continuar con OKTA" además de "Continuar con Google" (Google se mantiene para usuarios `@superbid.com.co`).
5. Documentar el flujo de provisión de usuarios nuevos: GM agrega al usuario en OKTA → entra al aplicativo → se le asigna automáticamente el rol del `role_seeds` o admin lo asigna en `/admin`.

Tiempo estimado: 1-2h configurar + 30 min de pruebas.

Documento de referencia Supabase: https://supabase.com/docs/guides/auth/sso/auth-sso-saml

## Correo a enviar

**Para**: [contacto IT/Seguridad GM Financial]
**Asunto**: Informe GMF Superbid — Integración SSO con OKTA: configuración SAML

---

```
Hola [contacto GM IT/Seguridad],

Para cumplir el requerimiento de autenticación con OKTA del
aplicativo Informe GMF, vamos a integrar OKTA de GM Financial como
Identity Provider (IdP) vía SAML 2.0. Nuestro Service Provider es
Supabase Auth.

═══ Lo que necesitamos de ustedes ═══

1. Metadata SAML del IdP. Una de estas dos opciones:
   a) URL pública del metadata XML (preferido), o
   b) El archivo XML adjunto exportado de OKTA

   El metadata contiene:
     • Issuer / Entity ID del IdP
     • Single Sign-On URL (HTTP-POST binding)
     • Certificado X.509 de firma

2. Atributos / claims que OKTA mandará en el SAML response.
   Mínimo requerido:
     • email                  (NameID o atributo)
     • givenName + familyName (o full_name como atributo único)
   Opcional pero útil:
     • groups o roles         (para mapear permisos en la app)

3. Dominio de email a scopear:
     gmfinancial.com  (¿correcto?)

   Esto restringe el SSO solo a usuarios de ese dominio en su OKTA.

4. Lista inicial de usuarios o grupos OKTA que deben tener acceso,
   con el rol que les corresponde en la app:
     • admin                    (ve y administra todo)
     • editor                   (carga soportes, edita pagos)
     • lector                   (solo consulta)
     • lector_con_notificacion  (consulta + recibe emails diarios)

5. Una cuenta de prueba en OKTA con la que validemos el flujo
   antes de habilitarlo en producción.

═══ Lo que les damos a ustedes para configurar en OKTA ═══

(Estos datos son del Service Provider, los ponen en la app SAML
de OKTA cuando creen la integración):

  • SP Entity ID:
      https://zbpvpduecodvnkjdrdoc.supabase.co/auth/v1/sso/saml/metadata

  • ACS URL (Assertion Consumer Service):
      https://zbpvpduecodvnkjdrdoc.supabase.co/auth/v1/sso/saml/acs

  • NameID Format:
      urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress

  • Single Logout (SLO):
      No requerido inicialmente.

  • Firma de assertion:
      Recomendado, pero no obligatorio.

═══ Tiempos ═══

Una vez recibida la info de los 5 puntos, la integración toma
1-2h configurar + 30 min de pruebas con la cuenta test antes de
habilitarla en producción para todos los usuarios.

Quedo atento.

Saludos,
[Tu nombre]
Superbid LATAM — Data OPS
```

---

## Checklist antes de enviar

- [ ] Confirmar contacto IT/Seguridad de GM (puede ser distinto al de IP whitelist)
- [ ] Reemplazar `[contacto GM IT/Seguridad]` con nombre real
- [ ] Reemplazar `[Tu nombre]` con tu nombre
- [ ] Confirmar internamente con líder de proyecto Superbid: ¿queremos que SOLO `@gmfinancial.com` use OKTA y los `@superbid.com.co` mantengan Google? ¿O queremos OKTA para todos?
