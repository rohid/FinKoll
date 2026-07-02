# Molndrift

🌐 [English](cloud-hosting.md) · **Svenska** · [Español](cloud-hosting.es.md)

FinKoll är en självständig Docker Compose-stack (krypterad SQLite, ingen extern
databas), så den kan köras var som helst där du kan köra containrar. Den här
guiden täcker tre vanliga vägar — **Cloudflare**, **AWS** och **Azure** — med
säkerheten som första övervägande i varje steg.

> **Läs detta först — säkerhetsgrunden** gäller för *varje* alternativ nedan.

## Säkerhetsgrund (alla leverantörer)

FinKoll krypterar redan sin databas i vila (AES-256), lagrar sessioner i
`httpOnly`-cookies, hastighetsbegränsar och spärrar upprepade misslyckade
inloggningar, och sätter HSTS/CSP. Dina driftsval ska bevara detta, inte
undergräva det:

- **Baka aldrig in hemligheter i imagen eller committa dem.** Ange
  `JWT_SECRET`, `DB_ENCRYPTION_KEY` och `ADMIN_PASSWORD_HASH` via leverantörens
  hemlighetshanterare (nedan), inte en `.env` som ligger på en publik disk.
- **Exponera endast 443.** Blockera inkommande 80 utom för ACME, och exponera
  aldrig backend (3001) eller SSH mot omvärlden — använd leverantörens
  bastion/agent i stället.
- **Terminera TLS på en betrodd nivå** (kant, lastbalanserare eller Caddy) — se
  [TLS & Let's Encrypt](tls-letsencrypt.sv.md).
- **Kryptera volymen** som innehåller `data/` (databasen + säkerhetskopior) och
  **skicka säkerhetskopior utanför maskinen** till krypterad objektlagring.
- **Undvik helst att exponera appen publikt.** En VPN eller Cloudflare Tunnel +
  Access håller en enskild hushållsbudget-app helt borta från öppna internet —
  den mest effektiva kontrollen här.
- **Håll krypteringsnyckeln återställningsbar men privat.** Om du tappar
  `DB_ENCRYPTION_KEY` är databasen oåterkallelig; om den läcker är datan
  exponerad. Lagra den i en hemlighetshanterare med åtkomstloggning.

---

## Cloudflare

Den rekommenderade vägen med lägst exponering: en **Cloudflare Tunnel** ansluter
din server till Cloudflares kant med en enbart utgående anslutning — **inga
inkommande portar öppnas, ingen publik IP exponeras**. Cloudflare terminerar TLS;
du kan lägga **Cloudflare Access** (Zero Trust SSO) framför inloggningen.

1. Kör FinKoll som vanligt (den kan till och med stanna på vanlig HTTP internt —
   Cloudflare tillhandahåller den publika TLS:en).
2. Lägg till en `cloudflared`-container:

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

3. I Cloudflare Zero Trust-panelen: skapa en tunnel, kopiera dess token till
   `CLOUDFLARE_TUNNEL_TOKEN`, och dirigera ditt värdnamn → `https://frontend:443`
   (eller `http://frontend:80` om du slopar intern TLS).
4. **Lägg till en Access-policy** (Zero Trust → Access → Applications) som kräver
   din e-post / en identitetsleverantör. Nu kräver även att nå inloggningen att
   man först passerar Cloudflare Access — försvar på djupet.

**Säkerhetsvinster:** inga öppna inkommande portar, DDoS-skydd och WAF vid
kanten, valfri SSO framför, och din ursprungs-IP förblir dold. Om du i stället
använder Cloudflare som en vanlig proxy (orange moln) med en öppen origin, lås
origin-brandväggen till Cloudflares IP-intervall och använd ett
[Origin CA-cert](https://developers.cloudflare.com/ssl/origin-configuration/origin-ca/).

---

## AWS

Kör Compose-stacken på en liten **EC2**-instans (eller **Lightsail** för
enkelhet). Terminera TLS med en **Application Load Balancer + ACM**-cert, eller
med Caddy på instansen.

**Provisionering**
- EC2 `t4g.small` (ARM/Graviton — billigt; images byggs på ARM) med Amazon
  Linux 2023 eller Ubuntu; installera Docker + Compose-pluginet.
- Anslut en **krypterad EBS**-volym för `data/` (eller aktivera EBS-kryptering
  som standard).

**Säkerhet**
- **Säkerhetsgrupper:** tillåt endast 443, och endast från ALB:ens
  säkerhetsgrupp. Öppna **inte** 3001. Öppna **inte** 22 — använd **SSM Session
  Manager** för skalåtkomst i stället för SSH.
- **Hemligheter:** lagra `JWT_SECRET`, `DB_ENCRYPTION_KEY`,
  `ADMIN_PASSWORD_HASH` i **SSM Parameter Store (SecureString)** eller **Secrets
  Manager**; injicera dem vid containerstart via instansrollen — skriv aldrig en
  `.env` i klartext till disk.
- **TLS:** begär ett publikt cert i **ACM**, koppla till ALB:en (443-lyssnare)
  och vidarebefordra till instansen. ALB:en är det enda som är internetvänt.
- **Framtvinga IMDSv2**, inaktivera den publika IP:n om du använder NAT + ALB,
  och aktivera **CloudTrail** + VPC-flödesloggar.
- **Säkerhetskopior:** synka `data/backups/` till en **S3-bucket med SSE-KMS**
  och Block Public Access på; livscykel-radera gamla kopior.

> För minsta möjliga fotavtryck är **Lightsail** (en enda container/instans med
> inbyggd lastbalanserare + hanterat cert) det enklaste AWS-alternativet och
> täcker samma TLS-/hemlighetsbehov på en mindre yta.

---

## Azure

Kör på en **Azure VM** (Ubuntu) med Docker, eller använd **Azure Container
Instances**. Terminera TLS med **Azure Front Door** / **Application Gateway**
(hanterat cert) eller Caddy på VM:en.

**Provisionering**
- `Standard_B2s`/`B2ats_v2`-VM; installera Docker + Compose. Använd en **Premium
  SSD**-datadisk med **Azure Disk Encryption** (eller plattformshanterade
  nycklar) för `data/`.

**Säkerhet**
- **Network Security Group:** inkommande endast 443 (från Front Door/App
  Gateway-tjänsttaggen om du lägger den framför); neka 3001; **ingen publik SSH**
  — använd **Azure Bastion** eller `az ssh`.
- **Hemligheter:** lagra de tre hemligheterna i **Azure Key Vault**; ge VM:en en
  **hanterad identitet** och hämta dem vid start. Ingen `.env` i klartext på disk.
- **TLS:** **Front Door** eller **App Gateway** med ett hanterat certifikat;
  aktivera **WAF**-policyn framför. Front Door döljer även origin.
- **Övervakning:** aktivera **Microsoft Defender for Cloud**, NSG-flödesloggar
  och diagnostikloggar.
- **Säkerhetskopior:** kopiera `data/backups/` till ett **Storage Account** med
  kryptering + privat åtkomst; överväg Azure Backup på disken.

---

## Jämförelse

| | Publik exponering | TLS | Hemligheter | Bäst för |
| --- | --- | --- | --- | --- |
| **Cloudflare Tunnel + Access** | Ingen (enbart utgående) | Kant (auto) | Env / tunnel-token | De flesta — lägst risk |
| **AWS EC2 + ALB/ACM** | Endast ALB | ACM (hanterat) | SSM / Secrets Manager | AWS-orienterade |
| **Azure VM + Front Door** | Endast Front Door | Hanterat | Key Vault | Azure-orienterade |

För en enskild hushållsinstallation ger **Cloudflare Tunnel + Access** bäst
förhållande mellan säkerhet och ansträngning: inget exponeras, TLS och förnyelser
är automatiska, och du kan kräva SSO innan appen ens är nåbar.

Se även: [TLS & Let's Encrypt](tls-letsencrypt.sv.md) · [Uppdatering](../../UPDATING.md).
