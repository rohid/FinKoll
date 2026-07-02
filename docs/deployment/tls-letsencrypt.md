# TLS & Let's Encrypt

🌐 **English** · [Svenska](tls-letsencrypt.sv.md) · [Español](tls-letsencrypt.es.md)

FinKoll's frontend container terminates HTTPS with nginx, reading its certificate
from `data/ssl/cert.pem` and `data/ssl/key.pem`. Out of the box those are
**self-signed** (see [`scripts/generate-cert.sh`](../../scripts/generate-cert.sh)),
which is fine on a home LAN but shows a browser warning.

This guide covers getting a **real, browser-trusted certificate** from
[Let's Encrypt](https://letsencrypt.org/) (free, auto-renewing), and — for the
self-signed case — how to import the local CA so devices stop warning.

- [When do you need this?](#when-do-you-need-this)
- [Prerequisites for Let's Encrypt](#prerequisites-for-lets-encrypt)
- [Option A — Caddy reverse proxy (recommended)](#option-a--caddy-reverse-proxy-recommended)
- [Option B — Certbot with the existing nginx](#option-b--certbot-with-the-existing-nginx)
- [Renewal hook](#renewal-hook)
- [Self-signed: importing the root cert](#self-signed-importing-the-root-cert)

---

## When do you need this?

| Situation | What to use |
| --------- | ----------- |
| LAN only (Pi at `192.168.x.x` / `finkoll.local`) | Self-signed cert + [import the CA](#self-signed-importing-the-root-cert) on your devices. No public exposure. |
| Public domain (e.g. `finkoll.example.com`) | A **Let's Encrypt** cert — Option A or B below. |
| Behind Cloudflare / a cloud load balancer | Let the edge terminate TLS — see [Cloud hosting](cloud-hosting.md). No cert on the box. |

> **Security note:** exposing FinKoll to the public internet means the login page
> is reachable by anyone. Keep the built-in protections on (account lockout, rate
> limiting, HSTS) and prefer putting it behind a VPN, Cloudflare Tunnel, or
> Cloudflare Access if you don't strictly need open access.

---

## Prerequisites for Let's Encrypt

1. A **domain name** you control (a subdomain is fine).
2. A **DNS `A`/`AAAA` record** pointing that name at your server's public IP.
3. Inbound **ports 80 and 443** reachable from the internet (port 80 is used for
   the HTTP-01 challenge; keep it open or use a DNS-01 challenge instead).
4. `FRONTEND_URL` in your `.env` set to `https://your.domain`.

---

## Option A — Caddy reverse proxy (recommended)

[Caddy](https://caddyserver.com/) obtains and **auto-renews** Let's Encrypt
certificates with essentially no configuration, and needs no changes to FinKoll's
own nginx. You put Caddy in front and let it terminate public TLS.

**1. Stop publishing the frontend's ports** so only Caddy is exposed. Create
`docker-compose.caddy.yml` next to `docker-compose.yml`:

```yaml
services:
  frontend:
    ports: []            # no longer exposed directly; Caddy fronts it

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

**2. Create `deploy/Caddyfile`:**

```
your.domain {
    encode gzip
    reverse_proxy https://frontend:443 {
        transport http {
            tls_insecure_skip_verify   # frontend uses its own self-signed cert internally
        }
        header_up Host {host}
        header_up X-Forwarded-Proto https
    }
}
```

**3. Bring it up:**

```bash
docker compose -f docker-compose.yml -f docker-compose.caddy.yml up -d --build
```

Caddy fetches a Let's Encrypt cert on first request, serves trusted HTTPS on 443,
and renews automatically. The internal self-signed cert between Caddy and nginx
never leaves the Docker network, so `tls_insecure_skip_verify` is safe here.

---

## Option B — Certbot with the existing nginx

Keep nginx as the TLS terminator and feed it Let's Encrypt certificates. FinKoll's
nginx already reads `data/ssl/cert.pem` + `data/ssl/key.pem`, so we obtain certs
with **certbot** and copy them into place — no nginx rebuild needed, only one
config addition to let the ACME challenge through.

**1. Allow the ACME HTTP-01 challenge on port 80.** In
[`frontend/nginx.conf`](../../frontend/nginx.conf), add this to the `listen 80`
server **above** the `location /` redirect:

```nginx
    location ^~ /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }
```

**2. Add a certbot service + shared webroot.** Create
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

**3. Issue the first certificate** (one-off), then copy it where nginx expects it:

```bash
DOMAIN=your.domain
docker compose -f docker-compose.yml -f docker-compose.certbot.yml up -d --build frontend
docker compose -f docker-compose.yml -f docker-compose.certbot.yml run --rm \
  certbot certonly --webroot -w /var/www/certbot -d "$DOMAIN" \
  --agree-tos -m you@example.com --no-eff-email

# copy into the path nginx reads, then reload
sudo cp data/letsencrypt/live/$DOMAIN/fullchain.pem data/ssl/cert.pem
sudo cp data/letsencrypt/live/$DOMAIN/privkey.pem  data/ssl/key.pem
docker compose exec frontend nginx -s reload
```

Open `https://your.domain` — a trusted padlock, no warning.

## Renewal hook

Let's Encrypt certs last 90 days. The `certbot` service above already loops
`certbot renew` twice a day; wire the copy-and-reload step as a **deploy hook** so
it only runs when a cert actually renews. Create `data/letsencrypt/deploy-hook.sh`
(it runs inside the certbot container as `/deploy-hook.sh` — mount it):

```bash
#!/bin/sh
# Runs only when a certificate was renewed.
cp "$RENEWED_LINEAGE/fullchain.pem" /etc/nginx-ssl/cert.pem
cp "$RENEWED_LINEAGE/privkey.pem"  /etc/nginx-ssl/key.pem
```

Add the mounts so the hook script and the target `data/ssl` are visible to the
certbot container, and reload nginx from the host after renewal. The simplest,
most reliable pattern on a single host is a **host cron** that renews and reloads:

```cron
# /etc/cron.d/finkoll-tls  — renew at 03:30, reload nginx if certs changed
30 3 * * * root cd /home/USER/finkoll && docker compose -f docker-compose.yml -f docker-compose.certbot.yml run --rm certbot renew --webroot -w /var/www/certbot && cp data/letsencrypt/live/your.domain/fullchain.pem data/ssl/cert.pem && cp data/letsencrypt/live/your.domain/privkey.pem data/ssl/key.pem && docker compose exec -T frontend nginx -s reload
```

> With **Option A (Caddy)** you don't need any of this — Caddy renews on its own.

---

## Self-signed: importing the root cert

If you're staying on the LAN with a self-signed certificate and want to remove the
browser warning, import the certificate (`data/ssl/cert.pem`) as a trusted root on
each device. **Only import certificates you generated yourself.**

- **macOS:** open Keychain Access → drag `cert.pem` into **System** → double-click
  it → Trust → *When using this certificate: Always Trust*.
- **Windows:** `certutil -addstore -f Root cert.pem` (as Administrator), or import
  via *Manage computer certificates → Trusted Root Certification Authorities*.
- **iOS:** email/AirDrop `cert.pem` to the device → install the profile →
  *Settings → General → About → Certificate Trust Settings* → enable full trust.
- **Android:** *Settings → Security → Encryption & credentials → Install a
  certificate → CA certificate*.
- **Linux (Debian/Ubuntu):** `sudo cp cert.pem /usr/local/share/ca-certificates/finkoll.crt && sudo update-ca-certificates`.

> **Tip:** [`mkcert`](https://github.com/FiloSottile/mkcert) creates a locally
> trusted CA and per-host certs in one command, and installs the CA into your
> system + browser trust stores automatically — nicer than importing by hand for
> LAN setups.

**Let's Encrypt certificates need none of this** — their issuing CA (ISRG Root
X1) is already trusted by every mainstream OS and browser.
