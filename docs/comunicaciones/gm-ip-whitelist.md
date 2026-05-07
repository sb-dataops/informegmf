# Comunicación a GM Financial — IP whitelist (Cloud Armor)

## Contexto interno

Como parte del cumplimiento del requerimiento de GM Financial de restringir acceso al aplicativo solo a IPs autorizadas, vamos a configurar **Google Cloud Armor** delante del backend Cloud Run.

### Implementación técnica que haremos del lado Superbid

Cuando lleguen los CIDRs:

1. Reservar IP estática global: `gcloud compute addresses create gmf-superbid-api-ip --global --project=sbc-lovable`
2. Crear Serverless NEG apuntando al servicio Cloud Run `gmf-superbid-api`
3. Crear backend service en el LB asociado al NEG
4. URL map → target HTTPS proxy → SSL cert managed para `gmf-api.superbidcolombia.com`
5. Forwarding rule global con la IP estática
6. Mover el A record del DNS de `gmf-api.superbidcolombia.com` (hoy CNAME a Cloud Run) → A record a la IP del LB
7. Crear Cloud Armor security policy con:
   - Rule prioridad 1000: `allow if origin.ip in [<CIDRs GMF>]`
   - Rule prioridad 2147483647 (default): `deny(403)`
8. Attach la policy al backend service
9. Verificar con un IP de la lista (debe pasar) y una fuera (debe dar 403) antes de llamar al go-live

Tiempo estimado: ~1h con la lista en mano + 30 min de validación.

## Correo a enviar

**Para**: [contacto técnico GM Financial]
**Asunto**: Informe GMF Superbid — IP whitelist (Cloud Armor): rangos CIDR requeridos

---

```
Hola [contacto GM],

Como parte del cumplimiento de los requerimientos del aplicativo
Informe GMF, vamos a habilitar restricción de acceso por IP usando
Google Cloud Armor delante del backend. Solo las IPs autorizadas
podrán llegar al servicio.

Necesitamos de ustedes la lista de rangos CIDR que deben tener
acceso. Típicamente son:

  • IPs de salida de las oficinas de GM Financial Colombia
  • Rangos del/los NAT gateway corporativo si aplican
  • VPN corporativa (si los usuarios entran desde casa vía VPN)
  • Cualquier proveedor externo que necesite acceso al aplicativo
    (Servitram, Gestrámites, etc.)

Formato esperado por cada rango:
  IP/máscara, p. ej. 200.74.10.0/24
  o IP única     181.49.50.123/32

Si nos pueden compartir un Excel/CSV con:
  • CIDR
  • Descripción (oficina Bogotá, oficina Medellín, VPN, etc.)
  • Owner / contacto técnico

Una vez recibidos, configuramos la política en ~1h y validamos
con ustedes antes de "deny default" para evitar bloquear usuarios
legítimos.

Quedo atento.

Saludos,
[Tu nombre]
Superbid LATAM — Data OPS
```

---

## Checklist antes de enviar

- [ ] Confirmar contacto técnico de GM (no usar contacto comercial)
- [ ] Reemplazar `[contacto GM]` con nombre real
- [ ] Reemplazar `[Tu nombre]` con tu nombre
- [ ] Decidir si pides el archivo en Excel, CSV, o JSON
