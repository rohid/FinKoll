# Kom igång med FinKoll

🌐 [English](GETTING-STARTED.md) · **Svenska** · [Español](GETTING-STARTED.es.md)

Igång på **tre steg, cirka 5 minuter**. Ett installationsskript sköter det svåra
åt dig – du väljer bara användarnamn och lösenord.

---

## 1. Installera det som krävs

Välj ett alternativ (Docker är enklast):

- **[Docker Desktop](https://www.docker.com/products/docker-desktop/)** – rekommenderas
- eller **[Node.js 20+](https://nodejs.org)**

## 2. Ladda ner FinKoll

```bash
git clone https://github.com/<ditt-användarnamn>/FinKoll.git
cd FinKoll
```

(Eller ladda ner ZIP-filen från GitHub, packa upp den och öppna mappen i en
terminal.)

## 3. Kör installationsskriptet

- **macOS / Linux:**
  ```bash
  bash scripts/setup.sh
  ```
- **Windows (PowerShell):**
  ```powershell
  powershell -ExecutionPolicy Bypass -File scripts\setup.ps1
  ```

Det ber dig att:

1. Välja hur du vill köra det → välj **Docker**
2. Välja ett **användarnamn** (eller tryck Enter för `admin`)
3. Välja ett **lösenord** (skrivs två gånger)

Allt annat – krypteringsnyckeln, säkerhetshemligheten och hashningen av ditt
lösenord – genereras automatiskt och sparas i din konfigurationsfil. När det
frågar **”Start it now?”**, svara **ja** (`y`).

## 4. Öppna och logga in

Öppna adressen som skriptet skrev ut – **http://localhost** för Docker – och logga
in med användarnamnet och lösenordet du just valde. Klart! 🎉

Gränssnittet visas på **engelska, svenska eller spanska** utifrån din webbläsares
språk, och du kan byta när som helst från menyn.

---

## Bra att veta

- **Dina data** ligger i en krypterad databas under `data/`, som skapas vid
  första starten, med automatiska säkerhetskopior i `data/backups/`.
- **Håll krypteringsnyckeln säker.** Skriptet sparar den i din konfigurationsfil
  (`.env`); databasen kan inte öppnas utan den, och det finns ingen återställning
  om den förloras. Ändra den inte senare.
- **Byt lösenord** när som helst under **Inställningar** i appen, eller kör
  installationsskriptet igen.

## Starta senare (utan skriptet)

- **Docker:** `docker compose up -d --build` → http://localhost
  (stoppa med `docker compose down`)
- **Node.js:** `bash scripts/start.sh` → http://localhost:5173

## Felsökning

| Problem | Lösning |
| ------- | ------- |
| Inloggningen misslyckas alltid | Kör `scripts/setup.sh` igen och sätt lösenordet på nytt. |
| ”Port already in use” (Docker) | Ändra frontend-porten i `docker-compose.yml` (t.ex. `"8080:80"`). |
| Nå appen från en annan enhet | Kör setup igen och ange den maskinens adress (t.ex. `http://192.168.1.50`) när den frågar efter URL:en. |

Vill du ha detaljerna bakom varje steg? Se hela [README](README.md).
