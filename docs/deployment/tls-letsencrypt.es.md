# TLS y Let's Encrypt

🌐 [English](tls-letsencrypt.md) · [Svenska](tls-letsencrypt.sv.md) · **Español**

El contenedor frontend de FinKoll termina HTTPS con nginx, leyendo su certificado
de `data/ssl/cert.pem` y `data/ssl/key.pem`. De fábrica son **autofirmados**
(consulta [`scripts/generate-cert.sh`](../../scripts/generate-cert.sh)), lo cual
está bien en una red local pero muestra una advertencia en el navegador.

Esta guía explica cómo obtener un **certificado real y de confianza** de
[Let's Encrypt](https://letsencrypt.org/) (gratuito y con renovación automática)
y —para el caso autofirmado— cómo importar la CA local para que los dispositivos
dejen de advertir.

- [¿Cuándo lo necesitas?](#cuándo-lo-necesitas)
- [Requisitos para Let's Encrypt](#requisitos-para-lets-encrypt)
- [Opción A — Proxy inverso Caddy (recomendado)](#opción-a--proxy-inverso-caddy-recomendado)
- [Opción B — Certbot con el nginx existente](#opción-b--certbot-con-el-nginx-existente)
- [Hook de renovación](#hook-de-renovación)
- [Autofirmado: importar el certificado raíz](#autofirmado-importar-el-certificado-raíz)

---

## ¿Cuándo lo necesitas?

| Situación | Qué usar |
| --------- | -------- |
| Solo LAN (Pi en `192.168.x.x` / `finkoll.local`) | Certificado autofirmado + [importar la CA](#autofirmado-importar-el-certificado-raíz) en tus dispositivos. Sin exposición pública. |
| Dominio público (p. ej. `finkoll.example.com`) | Un certificado de **Let's Encrypt** — Opción A o B abajo. |
| Detrás de Cloudflare / un balanceador en la nube | Deja que el borde termine el TLS — consulta [Alojamiento en la nube](cloud-hosting.es.md). Sin certificado en la máquina. |

> **Nota de seguridad:** exponer FinKoll a internet significa que la página de
> inicio de sesión es accesible por cualquiera. Mantén las protecciones
> integradas (bloqueo de cuenta, límite de intentos, HSTS) y ponlo preferiblemente
> tras una VPN, Cloudflare Tunnel o Cloudflare Access si no necesitas acceso
> abierto.

---

## Requisitos para Let's Encrypt

1. Un **nombre de dominio** que controles (un subdominio sirve).
2. Un **registro DNS `A`/`AAAA`** que apunte ese nombre a la IP pública del servidor.
3. **Puertos 80 y 443** entrantes accesibles desde internet (el puerto 80 se usa
   para el desafío HTTP-01; mantenlo abierto o usa un desafío DNS-01 en su lugar).
4. `FRONTEND_URL` en tu `.env` con el valor `https://tu.dominio`.

---

## Opción A — Proxy inverso Caddy (recomendado)

[Caddy](https://caddyserver.com/) obtiene y **renueva automáticamente** los
certificados de Let's Encrypt prácticamente sin configuración, y no requiere
cambios en el nginx propio de FinKoll. Colocas Caddy delante y dejas que termine
el TLS público.

**1. Deja de publicar los puertos del frontend** para que solo Caddy quede
expuesto. Crea `docker-compose.caddy.yml` junto a `docker-compose.yml`:

```yaml
services:
  frontend:
    ports: []            # ya no se expone directamente; Caddy va delante

  caddy:
    image: caddy:2
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./deploy/Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
      - caddy_config:/config
    depends_on:
      - frontend
    networks:
      - internal

volumes:
  caddy_data:
  caddy_config:
```

**2. Crea `deploy/Caddyfile`:**

```
tu.dominio {
    encode gzip
    reverse_proxy https://frontend:443 {
        transport http {
            tls_insecure_skip_verify   # el frontend usa su propio cert autofirmado internamente
        }
        header_up Host {host}
        header_up X-Forwarded-Proto https
    }
}
```

**3. Levántalo:**

```bash
docker compose -f docker-compose.yml -f docker-compose.caddy.yml up -d --build
```

Caddy obtiene un certificado de Let's Encrypt en la primera petición, sirve HTTPS
de confianza en el 443 y renueva automáticamente. El certificado autofirmado
interno entre Caddy y nginx nunca sale de la red de Docker, así que
`tls_insecure_skip_verify` es seguro aquí.

---

## Opción B — Certbot con el nginx existente

Mantén nginx como terminador de TLS y aliméntalo con certificados de
Let's Encrypt. El nginx de FinKoll ya lee `data/ssl/cert.pem` +
`data/ssl/key.pem`, así que obtenemos los certificados con **certbot** y los
copiamos a su sitio — sin reconstruir nginx, solo una adición de configuración
para dejar pasar el desafío ACME.

**1. Permite el desafío ACME HTTP-01 en el puerto 80.** En
[`frontend/nginx.conf`](../../frontend/nginx.conf), añade esto al servidor
`listen 80` **por encima** de la redirección `location /`:

```nginx
    location ^~ /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }
```

**2. Añade un servicio certbot + webroot compartido.** Crea
`docker-compose.certbot.yml`:

```yaml
services:
  frontend:
    volumes:
      - ./data/ssl:/etc/nginx/ssl:ro
      - certbot_www:/var/www/certbot:ro

  certbot:
    image: certbot/certbot
    volumes:
      - certbot_www:/var/www/certbot
      - ./data/letsencrypt:/etc/letsencrypt
    entrypoint: "/bin/sh -c 'trap exit TERM; while :; do certbot renew --webroot -w /var/www/certbot --deploy-hook \"/deploy-hook.sh\"; sleep 12h & wait $${!}; done'"

volumes:
  certbot_www:
```

**3. Emite el primer certificado** (una sola vez) y cópialo donde nginx lo espera:

```bash
DOMAIN=tu.dominio
docker compose -f docker-compose.yml -f docker-compose.certbot.yml up -d --build frontend
docker compose -f docker-compose.yml -f docker-compose.certbot.yml run --rm \
  certbot certonly --webroot -w /var/www/certbot -d "$DOMAIN" \
  --agree-tos -m tu@example.com --no-eff-email

# copia a la ruta que lee nginx y recarga
sudo cp data/letsencrypt/live/$DOMAIN/fullchain.pem data/ssl/cert.pem
sudo cp data/letsencrypt/live/$DOMAIN/privkey.pem  data/ssl/key.pem
docker compose exec frontend nginx -s reload
```

Abre `https://tu.dominio` — un candado de confianza, sin advertencia.

## Hook de renovación

Los certificados de Let's Encrypt duran 90 días. El servicio `certbot` de arriba
ya ejecuta `certbot renew` dos veces al día; conecta el paso de copiar-y-recargar
como un **deploy hook** para que solo se ejecute cuando un certificado realmente
se renueva. El patrón más sencillo y fiable en un único host es un **cron en el
host** que renueva y recarga:

```cron
# /etc/cron.d/finkoll-tls  — renovar a las 03:30, recargar nginx si cambian los certs
30 3 * * * root cd /home/USER/finkoll && docker compose -f docker-compose.yml -f docker-compose.certbot.yml run --rm certbot renew --webroot -w /var/www/certbot && cp data/letsencrypt/live/tu.dominio/fullchain.pem data/ssl/cert.pem && cp data/letsencrypt/live/tu.dominio/privkey.pem data/ssl/key.pem && docker compose exec -T frontend nginx -s reload
```

> Con la **Opción A (Caddy)** no necesitas nada de esto — Caddy renueva por sí solo.

---

## Autofirmado: importar el certificado raíz

Si te quedas en la LAN con un certificado autofirmado y quieres quitar la
advertencia del navegador, importa el certificado (`data/ssl/cert.pem`) como raíz
de confianza en cada dispositivo. **Importa solo certificados que hayas generado tú.**

- **macOS:** abre Acceso a Llaveros → arrastra `cert.pem` a **Sistema** → doble
  clic → Confianza → *Confiar siempre*.
- **Windows:** `certutil -addstore -f Root cert.pem` (como administrador), o
  importa vía *Administrar certificados del equipo → Entidades de certificación
  raíz de confianza*.
- **iOS:** envía por correo/AirDrop `cert.pem` al dispositivo → instala el perfil
  → *Ajustes → General → Información → Ajustes de confianza de certificados* →
  actívalo.
- **Android:** *Ajustes → Seguridad → Cifrado y credenciales → Instalar un
  certificado → Certificado de CA*.
- **Linux (Debian/Ubuntu):** `sudo cp cert.pem /usr/local/share/ca-certificates/finkoll.crt && sudo update-ca-certificates`.

> **Consejo:** [`mkcert`](https://github.com/FiloSottile/mkcert) crea una CA de
> confianza local y certificados por host con un comando, e instala la CA en los
> almacenes de confianza del sistema y del navegador automáticamente — más cómodo
> que importar a mano en configuraciones LAN.

**Los certificados de Let's Encrypt no necesitan nada de esto** — su CA emisora
(ISRG Root X1) ya es de confianza en todos los sistemas y navegadores habituales.
