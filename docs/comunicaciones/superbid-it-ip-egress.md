# Mensaje a Superbid IT — IP de salida VPN Forticlient (Cloud Armor whitelist)

## Contexto

GM Financial entregó el 8 may 2026 las 13 IPs corporativas USA desde las que sus usuarios accederán al aplicativo Informe GMF. Antes de aplicar el `deny default` en Cloud Armor, necesitamos la IP **pública de salida del VPN Forticlient corporativo de Superbid** para que admins/editores/lectores nuestros (`@superbid.com.co`) sigan pudiendo entrar al aplicativo.

**Confirmado** (verificado con captura del cliente VPN, 2026-05-10):
- Cliente: **FortiClient VPN** (Zero Trust Fabric Agent).
- Perfil: **`VPN SUPERBID`**.
- Uso: **obligatorio para todos los empleados** — no hay alternativa de acceso a recursos internos sin VPN. Esto simplifica enormemente el whitelist: todos los empleados de Superbid salen a internet por la IP pública del FortiGate, no por su IP residencial.

Resultado: el whitelist se reduce a **1-N IPs del FortiGate corporativo**, en vez de pedir múltiples CIDRs (oficinas, VPNs separadas, residenciales, etc).

## Mensaje (copiar/pegar en Slack o email interno a IT)

> **Asunto**: Informe GMF — IP pública de salida del VPN Forticlient (Cloud Armor whitelist)
>
> Hola equipo IT,
>
> Estamos por activar IP whitelist en Google Cloud Armor delante del backend del aplicativo Informe GMF (`https://gmf-api.superbidcolombia.com`) como requisito de GM Financial. GMF ya nos entregó sus 13 IPs (todas USA, salida 100% por su NAT corporativo).
>
> Como en Superbid el uso de **FortiClient VPN (perfil `VPN SUPERBID`) es obligatorio** para todos los empleados, la salida a internet de cualquier empleado va por la IP pública del FortiGate corporativo. Eso nos resuelve el whitelist sin tener que pedir IPs por persona/oficina/casa. Necesito que me confirmen:
>
> 1. **IP pública de salida del FortiGate** (la IP por donde sale a internet un empleado mientras está conectado al perfil `VPN SUPERBID`). En formato `x.x.x.x/32` o el CIDR si es un bloque (`x.x.x.0/29`, etc).
>
> 2. **¿Hay alta disponibilidad / múltiples IPs?** ¿1 solo FortiGate o varios (failover activo-activo, multi-sitio LATAM)? Si son varios, listarlas todas — las agregamos todas al whitelist.
>
> 3. **Contacto técnico** para validar el whitelist en modo `preview` antes de aplicar `deny default` (alguien que pueda confirmar que sigue entrando al aplicativo después del cambio de DNS).
>
> Como sanity check, conectado al `VPN SUPERBID` ahora mismo veo mi IP pública con `curl https://api.ipify.org` y me da `<IP>`. ¿Es esa la IP de salida del FortiGate, o es otra?
>
> Mientras llega la respuesta voy a configurar Cloud Armor en **modo `preview`** (loguea pero no bloquea) para mapear el tráfico real durante 24-48h y confirmar que las IPs que vemos son las esperadas antes de activar el `deny default`.
>
> Tiempo estimado: 1h con la IP confirmada + 30 min de pruebas en preview + 24-48h de logging antes del enforce.
>
> Quedo pendiente,
> [Tu nombre]
> Data Ops — Superbid

## Para quién

- Lead IT / SysAdmin de Superbid Colombia (probablemente el que administra el FortiGate).
- Si hay equipo de NetOps / Seguridad separado, copiarlos.

## Información que conviene tener antes de mandarlo

- [ ] Nombre del lead IT
- [ ] Tu IP pública actual estando conectado al `VPN SUPERBID`. Sacala con:
      ```
      curl https://api.ipify.org
      ```
      Pegala en el mensaje en el bloque "Como sanity check..." reemplazando `<IP>`. Le ahorra a IT una vuelta de email — solo tienen que confirmar sí/no.
- [ ] Si Superbid LATAM (no solo Colombia) usa el aplicativo o solo Colombia (alcance del whitelist; si LATAM, puede haber FortiGates por país)

## Lo que sigue una vez tengamos respuesta

1. Sumar la(s) IP(s) del FortiGate Superbid a la security policy de Cloud Armor (rule prioridad 2000).
2. Activar la policy en modo `preview` por 24-48h.
3. Revisar los logs (`logging.googleapis.com/security/cloud_armor`) — confirmar que GMF (13 IPs) + Superbid (FortiGate) son los únicos orígenes con tráfico legítimo.
4. Cambiar a `deny default` (modo enforce).
5. Smoke test: usuario conectado al `VPN SUPERBID` entra OK; usuario desconectado del VPN recibe 403; un usuario GMF entra OK desde una de las 13 IPs.

## Atajo: detectar tu IP de salida actual

Estando conectado al perfil `VPN SUPERBID` en FortiClient:

```bash
curl -s https://api.ipify.org
# o
curl -s https://ifconfig.me
```

La IP que devuelve es la que IT debe confirmar como salida del FortiGate. Si reconectás el VPN y la IP cambia → hay rotación / múltiples FortiGates y necesitamos todas las IPs del pool.
