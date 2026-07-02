# TLS & Let's Encrypt

🌐 [English](tls-letsencrypt.md) · **Svenska** · [Español](tls-letsencrypt.es.md)

FinKolls frontend-container terminerar HTTPS med nginx och läser sitt certifikat
från `data/ssl/cert.pem` och `data/ssl/key.pem`. Som standard är de
**självsignerade** (se [`scripts/generate-cert.sh`](../../scripts/generate-cert.sh)),
vilket fungerar bra i ett hemmanätverk men ger en varning i webbläsaren.

Den här guiden går igenom hur du får ett **riktigt, betrott certifikat** från
[Let's Encrypt](https://letsencrypt.org/) (gratis, förnyas automatiskt) och — för
det självsignerade fallet — hur du importerar den lokala CA:n så att enheter
slutar varna.

- [När behöver du detta?](#när-behöver-du-detta)
- [Förutsättningar för Let's Encrypt](#förutsättningar-för-lets-encrypt)
- [Alternativ A — Caddy reverse proxy (rekommenderas)](#alternativ-a--caddy-reverse-proxy-rekommenderas)
- [Alternativ B — Certbot med befintlig nginx](#alternativ-b--certbot-med-befintlig-nginx)
- [Förnyelse-hook](#förnyelse-hook)
- [Självsignerat: importera rotcertifikatet](#självsignerat-importera-rotcertifikatet)

---

## När behöver du detta?

| Situation | Vad du använder |
| --------- | --------------- |
| Endast LAN (Pi på `192.168.x.x` / `finkoll.local`) | Självsignerat cert + [importera CA:n](#självsignerat-importera-rotcertifikatet) på dina enheter. Ingen publik exponering. |
| Publik domän (t.ex. `finkoll.example.com`) | Ett **Let's Encrypt**-cert — Alternativ A eller B nedan. |
| Bakom Cloudflare / molnets lastbalanserare | Låt kanten terminera TLS — se [Molndrift](cloud-hosting.sv.md). Inget cert på maskinen. |

> **Säkerhetsnotis:** att exponera FinKoll mot internet innebär att inloggningen
> är nåbar för vem som helst. Behåll de inbyggda skydden (kontospärr,
> hastighetsbegränsning, HSTS) och lägg den helst bakom en VPN, Cloudflare Tunnel
> eller Cloudflare Access om du inte absolut behöver öppen åtkomst.

---

## Förutsättningar för Let's Encrypt

1. Ett **domännamn** du kontrollerar (en subdomän räcker).
2. En **DNS `A`/`AAAA`-post** som pekar namnet mot serverns publika IP.
3. Inkommande **portar 80 och 443** nåbara från internet (port 80 används för
   HTTP-01-utmaningen; håll den öppen eller använd en DNS-01-utmaning i stället).
4. `FRONTEND_URL` i din `.env` satt till `https://din.domän`.

---

## Alternativ A — Caddy reverse proxy (rekommenderas)

[Caddy](https://caddyserver.com/) skaffar och **förnyar automatiskt**
Let's Encrypt-certifikat med i princip ingen konfiguration, och kräver inga
ändringar i FinKolls egen nginx. Du sätter Caddy framför och låter den terminera
den publika TLS-anslutningen.

**1. Sluta publicera frontendens portar** så att bara Caddy är exponerad. Skapa
`docker-compose.caddy.yml` bredvid `docker-compose.yml`:

```yaml
services:
  frontend:
    ports: []            # exponeras inte längre direkt; Caddy ligger framför

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

**2. Skapa `deploy/Caddyfile`:**

```
din.domän {
    encode gzip
    reverse_proxy https://frontend:443 {
        transport http {
            tls_insecure_skip_verify   # frontend använder sitt eget självsignerade cert internt
        }
        header_up Host {host}
        header_up X-Forwarded-Proto https
    }
}
```

**3. Starta:**

```bash
docker compose -f docker-compose.yml -f docker-compose.caddy.yml up -d --build
```

Caddy hämtar ett Let's Encrypt-cert vid första anropet, serverar betrott HTTPS på
443 och förnyar automatiskt. Det interna självsignerade certet mellan Caddy och
nginx lämnar aldrig Docker-nätverket, så `tls_insecure_skip_verify` är säkert här.

---

## Alternativ B — Certbot med befintlig nginx

Behåll nginx som TLS-terminator och mata in Let's Encrypt-certifikat. FinKolls
nginx läser redan `data/ssl/cert.pem` + `data/ssl/key.pem`, så vi hämtar cert med
**certbot** och kopierar dem på plats — ingen ombyggnad av nginx krävs, bara ett
tillägg i konfigurationen för att släppa igenom ACME-utmaningen.

**1. Släpp igenom ACME HTTP-01-utmaningen på port 80.** I
[`frontend/nginx.conf`](../../frontend/nginx.conf), lägg till detta i
`listen 80`-servern **ovanför** `location /`-omdirigeringen:

```nginx
    location ^~ /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }
```

**2. Lägg till en certbot-tjänst + delad webroot.** Skapa
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

**3. Utfärda det första certifikatet** (engångsåtgärd) och kopiera det dit nginx
förväntar sig det:

```bash
DOMAIN=din.domän
docker compose -f docker-compose.yml -f docker-compose.certbot.yml up -d --build frontend
docker compose -f docker-compose.yml -f docker-compose.certbot.yml run --rm \
  certbot certonly --webroot -w /var/www/certbot -d "$DOMAIN" \
  --agree-tos -m du@example.com --no-eff-email

# kopiera till sökvägen nginx läser, ladda sedan om
sudo cp data/letsencrypt/live/$DOMAIN/fullchain.pem data/ssl/cert.pem
sudo cp data/letsencrypt/live/$DOMAIN/privkey.pem  data/ssl/key.pem
docker compose exec frontend nginx -s reload
```

Öppna `https://din.domän` — ett betrott hänglås, ingen varning.

## Förnyelse-hook

Let's Encrypt-cert gäller i 90 dagar. `certbot`-tjänsten ovan kör redan
`certbot renew` två gånger om dagen; koppla kopiera-och-ladda-om-steget som en
**deploy-hook** så att det bara körs när ett cert faktiskt förnyas. Det enklaste
och mest tillförlitliga mönstret på en enskild värd är en **cron på värden** som
förnyar och laddar om:

```cron
# /etc/cron.d/finkoll-tls  — förnya 03:30, ladda om nginx om cert ändrats
30 3 * * * root cd /home/USER/finkoll && docker compose -f docker-compose.yml -f docker-compose.certbot.yml run --rm certbot renew --webroot -w /var/www/certbot && cp data/letsencrypt/live/din.domän/fullchain.pem data/ssl/cert.pem && cp data/letsencrypt/live/din.domän/privkey.pem data/ssl/key.pem && docker compose exec -T frontend nginx -s reload
```

> Med **Alternativ A (Caddy)** behöver du inget av detta — Caddy förnyar själv.

---

## Självsignerat: importera rotcertifikatet

Om du stannar i LAN:et med ett självsignerat certifikat och vill ta bort
webbläsarvarningen, importera certifikatet (`data/ssl/cert.pem`) som en betrodd
rot på varje enhet. **Importera bara certifikat du själv har skapat.**

- **macOS:** öppna Nyckelhanteraren → dra `cert.pem` till **System** →
  dubbelklicka → Förtroende → *Lita alltid på*.
- **Windows:** `certutil -addstore -f Root cert.pem` (som administratör), eller
  importera via *Hantera datorcertifikat → Betrodda rotcertifikatutfärdare*.
- **iOS:** maila/AirDrop:a `cert.pem` till enheten → installera profilen →
  *Inställningar → Allmänt → Om → Inställningar för certifikatförtroende* → slå på.
- **Android:** *Inställningar → Säkerhet → Kryptering & inloggningsuppgifter →
  Installera ett certifikat → CA-certifikat*.
- **Linux (Debian/Ubuntu):** `sudo cp cert.pem /usr/local/share/ca-certificates/finkoll.crt && sudo update-ca-certificates`.

> **Tips:** [`mkcert`](https://github.com/FiloSottile/mkcert) skapar en lokalt
> betrodd CA och cert per värd med ett kommando, och installerar CA:n i systemets
> och webbläsarens förtroendelager automatiskt — smidigare än att importera för
> hand i LAN-uppsättningar.

**Let's Encrypt-certifikat behöver inget av detta** — deras utfärdande CA (ISRG
Root X1) är redan betrodd av alla vanliga operativsystem och webbläsare.
