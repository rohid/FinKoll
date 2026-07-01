# Kom igång med FinKoll

🌐 [English](GETTING-STARTED.md) · **Svenska** · [Español](GETTING-STARTED.es.md)

Välkommen! Den här guiden tar dig från en ny kopia av FinKoll till din första
inloggning. Inga förkunskaper krävs. Fungerar på **Linux, macOS och Windows**.

Du kommer att:

1. Installera den enda förutsättningen
2. Ladda ner FinKoll
3. Skapa din konfiguration – inklusive **ditt eget inloggningslösenord**
4. Starta appen
5. Logga in

Total tid: ungefär 10 minuter.

> **Kortversionen:** FinKoll har ingen registreringssida. Du skapar ditt
> användarnamn och lösenord *en gång*, i förväg, genom att lägga in dem i en
> konfigurationsfil före första starten. Stegen 3a–3d nedan visar hur.

---

## Steg 1 – Installera förutsättningen

Välj **ett** av dessa. Docker är enklast och rekommenderas.

- **Alternativ A – Docker (rekommenderas):** installera
  [Docker Desktop](https://www.docker.com/products/docker-desktop/) (Windows/macOS)
  eller Docker Engine + Compose v2 (Linux). På Windows sätter Docker Desktop upp
  WSL2 åt dig.
- **Alternativ B – Node.js (utan Docker):** installera
  [Node.js 20 eller senare](https://nodejs.org) (innehåller `npm`).

Du behöver Node.js för lösenordssteget nedan **även om du valde Docker** – men
oroa dig inte, det finns ett Docker-endast-alternativ även för det (steg 3c).

---

## Steg 2 – Ladda ner FinKoll

```bash
git clone https://github.com/<ditt-användarnamn>/FinKoll.git
cd FinKoll
```

(Eller ladda ner ZIP-filen från GitHub, packa upp den och gå in i mappen med `cd`.)

---

## Steg 3 – Skapa din konfiguration (här sätter du ditt lösenord)

FinKoll läser fyra värden från en miljöfil. Du genererar två slumpmässiga
hemligheter, väljer ett användarnamn och skapar ett lösenord.

### 3a. Kopiera exempelfilen

Var filen ska ligga beror på hur du kör appen:

| Så här kör du den | Skapa filen som |
| ----------------- | --------------- |
| Docker (steg 4A)  | `.env` i projektroten |
| Node.js (steg 4B) | `backend/.env` |

- **Linux / macOS:**
  ```bash
  cp .env.example .env          # Docker
  # eller
  cp .env.example backend/.env  # Node.js
  ```
- **Windows (PowerShell):**
  ```powershell
  Copy-Item .env.example .env           # Docker
  # eller
  Copy-Item .env.example backend\.env   # Node.js
  ```

### 3b. Generera de två hemligheterna

**`DB_ENCRYPTION_KEY`** – måste vara **exakt 32 tecken** (den krypterar din
databas):

- **Linux / macOS:** `openssl rand -hex 16`
- **Windows (PowerShell):**
  ```powershell
  -join ((48..57)+(97..102) | Get-Random -Count 32 | ForEach-Object {[char]$_})
  ```

**`JWT_SECRET`** – valfri lång slumpmässig sträng (används för att signera
inloggningssessioner):

- **Alla plattformar med Node.js:**
  ```bash
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```

Kopiera varje resultat – du klistrar in dem i steg 3d.

### 3c. Skapa ditt inloggningslösenord 🔑

FinKoll lagrar aldrig ditt lösenord direkt – det lagrar en **bcrypt-hash** av
det. Du genererar hashen en gång och klistrar in den i konfigurationen. Byt ut
`ValjEttStarktLosenord` mot lösenordet du faktiskt vill logga in med.

- **Om du har Node.js installerat** (kör från mappen `backend`):
  ```bash
  cd backend
  npm install        # bara första gången
  node -e "require('bcryptjs').hash('ValjEttStarktLosenord', 12).then(console.log)"
  cd ..
  ```

- **Endast Docker (utan Node.js installerat):**
  ```bash
  docker run --rm node:20-alpine sh -lc "npm i -s bcryptjs && node -e \"require('bcryptjs').hash('ValjEttStarktLosenord',12).then(console.log)\""
  ```

Utskriften ser ut som `$2a$12$Xa1b2c3...` – det är din lösenords-hash. Kopiera den.

> **Kom ihåg själva lösenordet** – hashen är enkelriktad och kan inte återställas.
> Om du glömmer det genererar du bara en ny hash och uppdaterar konfigurationen
> (dina data påverkas inte). Se [Byta lösenord senare](#byta-lösenord-senare).

### 3d. Fyll i filen

Öppna filen du skapade i 3a och sätt alla fyra värdena:

```dotenv
# Lång slumpmässig sträng från steg 3b (JWT_SECRET)
JWT_SECRET=klistra-in-jwt-hemligheten-har

# EXAKT 32 tecken från steg 3b (DB_ENCRYPTION_KEY)
DB_ENCRYPTION_KEY=klistra-in-32-teckens-nyckeln-har

# Användarnamnet du skriver på inloggningsskärmen
ADMIN_USERNAME=admin

# bcrypt-hashen från steg 3c – INTE ditt lösenord i klartext
ADMIN_PASSWORD_HASH=klistra-in-hashen-har
```

> ⚠️ **Docker-användare – escapa dollartecknen.** En bcrypt-hash innehåller
> `$`-tecken, som Docker Compose behandlar särskilt. I **rotens `.env`**-fil,
> dubblera varje `$`: skriv `$2a$12$abc...` som `$$2a$$12$$abc...`.
> (Node.js-användare som redigerar `backend/.env` behöver **inte** göra detta.)

---

## Steg 4 – Starta appen

### Alternativ 4A – Docker (rekommenderas)

```bash
docker compose up -d --build
```

Öppna sedan **http://localhost** i din webbläsare.

- Visa loggar: `docker compose logs -f`
- Stoppa: `docker compose down`

> Om port 80 är upptagen, ändra frontend-porten i `docker-compose.yml`
> (t.ex. `"8080:80"`) och öppna http://localhost:8080.

### Alternativ 4B – Node.js (utvecklingsläge)

```bash
npm install --prefix backend
npm install --prefix frontend
```

Starta sedan båda servrarna:

- **Linux / macOS:** `bash scripts/start.sh`
- **Windows (PowerShell)** – två terminaler:
  ```powershell
  npm run dev --prefix backend
  ```
  ```powershell
  npm run dev --prefix frontend
  ```

Öppna sedan **http://localhost:5173**.

---

## Steg 5 – Logga in

Använd **`ADMIN_USERNAME`** som du satte och det **lösenord i klartext** du valde
i steg 3c (inte hashen). Du är inne! 🎉

Gränssnittet visas automatiskt på **engelska, svenska eller spanska** utifrån din
webbläsares språk – du kan byta när som helst från sidofältet (eller menyn på
mobilen).

---

## Vad som händer vid första starten

- En **krypterad SQLite-databas** skapas under `data/` och fylls med en
  uppsättning startkategorier och ett hus – döp om eller utöka allt under
  **Inställningar**.
- Automatiska säkerhetskopior skrivs till `data/backups/` vid varje start och
  före varje uppdatering.

**Håll din `DB_ENCRYPTION_KEY` säker och oförändrad.** Databasen kan inte öppnas
utan den, och det finns ingen återställning om den förloras.

---

## Byta lösenord senare

1. Generera en ny hash (upprepa steg 3c med ditt nya lösenord).
2. Klistra in den i `ADMIN_PASSWORD_HASH` i din `.env` (kom ihåg `$$`-escapingen
   för Docker).
3. Starta om: `docker compose up -d` (Docker) eller starta om utvecklingsservrarna.

Dina data är orörda. Du kan också byta lösenord inifrån appen under
**Inställningar** när du är inloggad.

---

## Felsökning

| Symptom | Lösning |
| ------- | ------- |
| Appen startar inte, fel om krypteringsnyckeln | `DB_ENCRYPTION_KEY` måste vara **exakt 32 tecken**. |
| Inloggningen misslyckas alltid | Se till att `ADMIN_PASSWORD_HASH` är **hashen**, inte lösenordet i klartext – och för Docker att varje `$` är dubblerat till `$$`. |
| "Port already in use" (Docker) | Ändra frontend-portmappningen i `docker-compose.yml`. |
| Kommer inte åt appen från en annan enhet | Sätt `FRONTEND_URL` i `.env` till maskinens IP (t.ex. `http://192.168.1.50:5173`). |

Behöver du mer detaljer? Se hela [README](README.md).
