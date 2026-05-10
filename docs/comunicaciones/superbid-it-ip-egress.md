# Mensaje a Superbid IT — IPs de salida para whitelist Cloud Armor

## Contexto

GM Financial entregó el 8 may 2026 las 13 IPs corporativas USA desde las que sus usuarios accederán al aplicativo Informe GMF. Antes de aplicar el `deny default` en Cloud Armor, necesitamos las IPs **desde las que sale Superbid a internet** para que admins/editores/lectores nuestros (`@superbid.com.co`) sigan pudiendo entrar al aplicativo.

## Mensaje (copiar/pegar en Slack o email interno a IT)

> **Asunto**: Informe GMF — IPs públicas de salida corporativas (Cloud Armor whitelist)
>
> Hola equipo IT,
>
> Estamos por activar IP whitelist en Google Cloud Armor delante del backend del aplicativo Informe GMF (`https://gmf-api.superbidcolombia.com`) como requisito de GM Financial. GMF ya nos entregó sus 13 IPs (todas USA, salida 100% por su NAT corporativo).
>
> Para que **los empleados de Superbid sigamos pudiendo entrar al aplicativo** después del cutover, necesito de ustedes la lista de IPs públicas / rangos CIDR desde los que salimos a internet:
>
> 1. **Oficina Carrera 16 #93-78 (Bogotá)** — ¿tenemos IP estática? ¿cuál es el CIDR?
> 2. **Otras oficinas** (si aplica) — Medellín, etc.
> 3. **VPN corporativa** — si los empleados que trabajan remoto entran por VPN, ¿cuál es la IP de salida fija de la VPN?
> 4. **Empleados sin VPN trabajando desde casa** — ¿hay alguno? Si sí, ¿cómo manejan IPs residenciales hoy?
>
> Formato esperado por cada rango (idéntico al que pedimos a GMF):
>
> ```
> CIDR              Descripción                Owner / contacto
> 200.74.10.0/24    Oficina Bogotá             juan.it@superbid.com.co
> 181.49.50.123/32  IP fija salida VPN         juan.it@superbid.com.co
> ```
>
> **Si no hay IP estática ni VPN con IP fija**, recomiendo agendar 30 min para definir contingencia — opciones típicas: setup de VPN corporativa con IP de salida fija (Tailscale, OpenVPN, NordLayer, Twingate), o uso de IAP de Google delante del LB para auth-by-identity en lugar de IP.
>
> Mientras llega la respuesta voy a configurar Cloud Armor en **modo `preview`** (loguea pero no bloquea) para mapear el tráfico real de los usuarios actuales y evitar dejar a alguien fuera al activar el `deny default`.
>
> Quedo pendiente,
> [Tu nombre]
> Data Ops — Superbid

## Para quién

- Lead IT / SysAdmin de Superbid Colombia
- Si hay equipo de NetOps o Seguridad separado, copiarlos.

## Información que conviene tener antes de mandarlo

- [ ] Nombre del lead IT (para personalizar el saludo)
- [ ] Si la oficina de Bogotá tiene IP estática conocida (te ahorras una pregunta si ya lo sabés)
- [ ] Si Superbid LATAM (no solo Colombia) usa el aplicativo o solo Colombia (alcance del whitelist)

## Lo que sigue una vez tengamos respuesta

1. Sumar los CIDRs de Superbid a la security policy de Cloud Armor (rule prioridad 2000).
2. Activar la policy en modo `preview` por 24-48h y revisar los logs (`logging.googleapis.com/security/cloud_armor`).
3. Si los logs confirman que GMF + Superbid son los únicos orígenes legítimos → cambiar a `deny default` (modo enforce).
4. Smoke test: un usuario GMF debe poder entrar; un usuario fuera de la lista debe recibir 403.
