# Alojamiento en la nube

🌐 [English](cloud-hosting.md) · [Svenska](cloud-hosting.sv.md) · **Español**

FinKoll es una pila Docker Compose autónoma (SQLite cifrado, sin base de datos
externa), así que se ejecuta en cualquier sitio donde puedas correr contenedores.
Esta guía cubre tres caminos comunes — **Cloudflare**, **AWS** y **Azure** — con
la seguridad como primera consideración en cada paso.

> **Lee esto primero — la base de seguridad** se aplica a *todas* las opciones de
> abajo.

## Base de seguridad (todos los proveedores)

FinKoll ya cifra su base de datos en reposo (AES-256), guarda las sesiones en
cookies `httpOnly`, limita los intentos y bloquea inicios de sesión fallidos
repetidos, y establece HSTS/CSP. Tus decisiones de alojamiento deben preservar
esto, no socavarlo:

- **Nunca incrustes secretos en la imagen ni los subas al repositorio.**
  Proporciona `JWT_SECRET`, `DB_ENCRYPTION_KEY` y `ADMIN_PASSWORD_HASH` a través
  del gestor de secretos del proveedor (abajo), no un `.env` en un disco público.
- **Expón solo el 443.** Bloquea el 80 entrante salvo para ACME, y nunca expongas
  el backend (3001) ni SSH al mundo — usa el bastión/agente del proveedor.
- **Termina el TLS en una capa de confianza** (borde, balanceador o Caddy) —
  consulta [TLS y Let's Encrypt](tls-letsencrypt.es.md).
- **Cifra el volumen** que contiene `data/` (la BD + copias de seguridad) y
  **envía las copias fuera de la máquina** a almacenamiento de objetos cifrado.
- **Preferiblemente no expongas la app públicamente.** Una VPN o Cloudflare
  Tunnel + Access mantiene una app de presupuesto de un solo hogar totalmente
  fuera de internet — el control más eficaz aquí.
- **Mantén la clave de cifrado recuperable pero privada.** Si pierdes
  `DB_ENCRYPTION_KEY`, la base de datos es irrecuperable; si se filtra, los datos
  quedan expuestos. Guárdala en un gestor de secretos con registro de acceso.

---

## Cloudflare

El camino recomendado y de menor exposición: un **Cloudflare Tunnel** conecta tu
servidor con el borde de Cloudflare mediante una conexión solo saliente — **sin
abrir puertos entrantes, sin exponer IP pública**. Cloudflare termina el TLS; y
puedes poner **Cloudflare Access** (SSO Zero Trust) delante del inicio de sesión.

1. Ejecuta FinKoll normalmente (incluso puede quedarse en HTTP plano
   internamente — Cloudflare proporciona el TLS público).
2. Añade un contenedor `cloudflared`:

   ```yaml
   services:
     cloudflared:
       image: cloudflare/cloudflared:latest
       restart: unless-stopped
       command: tunnel run
       environment:
         - TUNNEL_TOKEN=${CLOUDFLARE_TUNNEL_TOKEN}
       networks:
         - internal
   ```

3. En el panel de Cloudflare Zero Trust: crea un túnel, copia su token en
   `CLOUDFLARE_TUNNEL_TOKEN`, y enruta tu nombre de host → `https://frontend:443`
   (o `http://frontend:80` si prescindes del TLS interno).
4. **Añade una política de Access** (Zero Trust → Access → Applications) que
   exija tu correo / un proveedor de identidad. Ahora, hasta llegar al inicio de
   sesión requiere pasar antes por Cloudflare Access — defensa en profundidad.

**Ventajas de seguridad:** sin puertos entrantes abiertos, protección DDoS y WAF
en el borde, SSO opcional delante, y tu IP de origen permanece oculta. Si en su
lugar usas Cloudflare como proxy normal (nube naranja) con un origen abierto,
restringe el firewall de origen a los rangos de IP de Cloudflare y usa un
[certificado Origin CA](https://developers.cloudflare.com/ssl/origin-configuration/origin-ca/).

---

## AWS

Ejecuta la pila Compose en una instancia **EC2** pequeña (o **Lightsail** por
simplicidad). Termina el TLS con un **Application Load Balancer + certificado
ACM**, o con Caddy en la instancia.

**Aprovisionamiento**
- EC2 `t4g.small` (ARM/Graviton — barato; las imágenes se construyen en ARM) con
  Amazon Linux 2023 o Ubuntu; instala Docker + el plugin Compose.
- Adjunta un volumen **EBS cifrado** para `data/` (o activa el cifrado EBS por
  defecto).

**Seguridad**
- **Grupos de seguridad:** permite solo el 443, y solo desde el grupo de
  seguridad del ALB. **No** abras el 3001. **No** abras el 22 — usa **SSM Session
  Manager** para el acceso a shell en lugar de SSH.
- **Secretos:** guarda `JWT_SECRET`, `DB_ENCRYPTION_KEY`, `ADMIN_PASSWORD_HASH`
  en **SSM Parameter Store (SecureString)** o **Secrets Manager**; inyéctalos al
  arrancar el contenedor mediante el rol de la instancia — nunca escribas un
  `.env` en texto plano en el disco.
- **TLS:** solicita un certificado público en **ACM**, adjúntalo al ALB
  (listener 443) y reenvía a la instancia. El ALB es lo único de cara a internet.
- **Fuerza IMDSv2**, desactiva la IP pública si usas NAT + ALB, y activa
  **CloudTrail** + registros de flujo de VPC.
- **Copias de seguridad:** sincroniza `data/backups/` a un **bucket S3 con
  SSE-KMS** y Block Public Access activado; caduca las copias antiguas con
  reglas de ciclo de vida.

> Para la menor huella posible, **Lightsail** (una sola instancia/contenedor con
> balanceador integrado + certificado gestionado) es la opción de AWS con menos
> esfuerzo y cubre las mismas necesidades de TLS/secretos en una superficie menor.

---

## Azure

Ejecuta en una **VM de Azure** (Ubuntu) con Docker, o usa **Azure Container
Instances**. Termina el TLS con **Azure Front Door** / **Application Gateway**
(certificado gestionado) o Caddy en la VM.

**Aprovisionamiento**
- VM `Standard_B2s`/`B2ats_v2`; instala Docker + Compose. Usa un disco de datos
  **Premium SSD** con **Azure Disk Encryption** (o claves gestionadas por la
  plataforma) para `data/`.

**Seguridad**
- **Network Security Group:** entrada solo 443 (desde la etiqueta de servicio de
  Front Door/App Gateway si lo pones delante); deniega el 3001; **sin SSH
  público** — usa **Azure Bastion** o `az ssh`.
- **Secretos:** guarda los tres secretos en **Azure Key Vault**; dale a la VM una
  **identidad administrada** y recupéralos al arrancar. Sin `.env` en texto plano
  en el disco.
- **TLS:** **Front Door** o **App Gateway** con un certificado gestionado;
  activa la política **WAF** delante. Front Door también oculta el origen.
- **Monitorización:** activa **Microsoft Defender for Cloud**, registros de flujo
  de NSG y registros de diagnóstico.
- **Copias de seguridad:** copia `data/backups/` a una **cuenta de
  almacenamiento** con cifrado + acceso privado; considera Azure Backup en el disco.

---

## Comparación

| | Exposición pública | TLS | Secretos | Mejor para |
| --- | --- | --- | --- | --- |
| **Cloudflare Tunnel + Access** | Ninguna (solo saliente) | Borde (auto) | Env / token de túnel | La mayoría — menor riesgo |
| **AWS EC2 + ALB/ACM** | Solo el ALB | ACM (gestionado) | SSM / Secrets Manager | Entornos AWS |
| **Azure VM + Front Door** | Solo Front Door | Gestionado | Key Vault | Entornos Azure |

Para un despliegue de un solo hogar, **Cloudflare Tunnel + Access** ofrece la
mejor relación seguridad/esfuerzo: no se expone nada, el TLS y las renovaciones
son automáticas, y puedes exigir SSO antes de que la app sea siquiera accesible.

Ver también: [TLS y Let's Encrypt](tls-letsencrypt.es.md) · [Actualizar](../../UPDATING.md).
