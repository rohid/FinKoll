# Getting Started with FinKoll

🌐 **English** · [Svenska](GETTING-STARTED.sv.md) · [Español](GETTING-STARTED.es.md)

Welcome! This guide takes you from a fresh copy of FinKoll to logging in for the
first time. No prior setup knowledge is assumed. It works on **Linux, macOS, and
Windows**.

You will:

1. Install the one prerequisite
2. Download FinKoll
3. Create your configuration — including **your own login password**
4. Start the app
5. Log in

Total time: about 10 minutes.

> **The short version:** FinKoll has no sign-up screen. You create your username
> and password *once*, up front, by putting them into a configuration file
> before the first start. Steps 3a–3d below walk you through it.

---

## Step 1 — Install the prerequisite

Pick **one** of these. Docker is the simplest and is recommended.

- **Option A — Docker (recommended):** install
  [Docker Desktop](https://www.docker.com/products/docker-desktop/) (Windows/macOS)
  or Docker Engine + Compose v2 (Linux). On Windows, Docker Desktop sets up WSL2
  for you.
- **Option B — Node.js (no Docker):** install
  [Node.js 20 or newer](https://nodejs.org) (includes `npm`).

You need Node.js available for the password step below **even if you chose
Docker** — but don't worry, there's a Docker-only fallback for that too (Step 3c).

---

## Step 2 — Download FinKoll

```bash
git clone https://github.com/<your-username>/FinKoll.git
cd FinKoll
```

(Or download the ZIP from GitHub and unzip it, then `cd` into the folder.)

---

## Step 3 — Create your configuration (this is where you set your password)

FinKoll reads four values from an environment file. You'll generate two random
secrets, choose a username, and create a password.

### 3a. Copy the example file

The file location depends on how you'll run the app:

| How you'll run it | Create the file at |
| ----------------- | ------------------ |
| Docker (Step 4A)  | `.env` in the project root |
| Node.js (Step 4B) | `backend/.env` |

- **Linux / macOS:**
  ```bash
  cp .env.example .env          # Docker
  # or
  cp .env.example backend/.env  # Node.js
  ```
- **Windows (PowerShell):**
  ```powershell
  Copy-Item .env.example .env           # Docker
  # or
  Copy-Item .env.example backend\.env   # Node.js
  ```

### 3b. Generate the two secrets

**`DB_ENCRYPTION_KEY`** — must be **exactly 32 characters** (it encrypts your
database):

- **Linux / macOS:** `openssl rand -hex 16`
- **Windows (PowerShell):**
  ```powershell
  -join ((48..57)+(97..102) | Get-Random -Count 32 | ForEach-Object {[char]$_})
  ```

**`JWT_SECRET`** — any long random string (used to sign login sessions):

- **Any platform with Node.js:**
  ```bash
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```

Copy each result — you'll paste them in Step 3d.

### 3c. Create your login password 🔑

FinKoll never stores your password directly — it stores a **bcrypt hash** of it.
You generate that hash once and paste it into the config. Replace
`ChooseAStrongPassword` with the password you actually want to log in with.

- **If you have Node.js installed** (run from inside the `backend` folder):
  ```bash
  cd backend
  npm install        # first time only
  node -e "require('bcryptjs').hash('ChooseAStrongPassword', 12).then(console.log)"
  cd ..
  ```

- **Docker only (no Node.js installed):**
  ```bash
  docker run --rm node:20-alpine sh -lc "npm i -s bcryptjs && node -e \"require('bcryptjs').hash('ChooseAStrongPassword',12).then(console.log)\""
  ```

The output looks like `$2a$12$Xa1b2c3...` — that's your password hash. Copy it.

> **Remember your password itself** — the hash is one-way and cannot be reversed.
> If you forget it, you simply generate a new hash and update the config (your
> data is unaffected). See [Changing your password later](#changing-your-password-later).

### 3d. Fill in the file

Open the file you created in 3a and set all four values:

```dotenv
# Long random string from Step 3b (JWT_SECRET)
JWT_SECRET=paste-the-jwt-secret-here

# EXACTLY 32 characters from Step 3b (DB_ENCRYPTION_KEY)
DB_ENCRYPTION_KEY=paste-the-32-char-key-here

# The username you'll type at the login screen
ADMIN_USERNAME=admin

# The bcrypt hash from Step 3c — NOT your plain password
ADMIN_PASSWORD_HASH=paste-the-hash-here
```

> ⚠️ **Docker users — escape the `$` signs.** A bcrypt hash contains `$`
> characters, which Docker Compose treats specially. In the **root `.env`** file,
> double every `$`: write `$2a$12$abc...` as `$$2a$$12$$abc...`.
> (Node.js users editing `backend/.env` do **not** need to do this.)

---

## Step 4 — Start the app

### Option 4A — Docker (recommended)

```bash
docker compose up -d --build
```

Then open **http://localhost** in your browser.

- View logs: `docker compose logs -f`
- Stop: `docker compose down`

> If port 80 is busy, edit `docker-compose.yml` and change the frontend port
> (e.g. `"8080:80"`), then open http://localhost:8080.

### Option 4B — Node.js (development mode)

```bash
npm install --prefix backend
npm install --prefix frontend
```

Then start both servers:

- **Linux / macOS:** `bash scripts/start.sh`
- **Windows (PowerShell)** — two terminals:
  ```powershell
  npm run dev --prefix backend
  ```
  ```powershell
  npm run dev --prefix frontend
  ```

Then open **http://localhost:5173**.

---

## Step 5 — Log in

Use the **`ADMIN_USERNAME`** you set and the **plain password** you chose in
Step 3c (not the hash). You're in! 🎉

The interface appears automatically in **English, Swedish, or Spanish** based on
your browser's language — you can switch it any time from the sidebar (or the
menu on mobile).

---

## What happens on first start

- An **encrypted SQLite database** is created under `data/` and seeded with a
  starter set of categories and one house — rename or extend anything in
  **Settings**.
- Automatic backups are written to `data/backups/` on every start and before any
  update.

**Keep your `DB_ENCRYPTION_KEY` safe and unchanged.** The database cannot be
opened without it, and there is no recovery if it is lost.

---

## Changing your password later

1. Generate a new hash (repeat Step 3c with your new password).
2. Paste it into `ADMIN_PASSWORD_HASH` in your `.env` (remember the `$$` escaping
   for Docker).
3. Restart: `docker compose up -d` (Docker) or restart the dev servers.

Your data is untouched. You can also change the password from within the app
under **Settings** once logged in.

---

## Troubleshooting

| Symptom | Fix |
| ------- | --- |
| App won't start, error about the encryption key | `DB_ENCRYPTION_KEY` must be **exactly 32 characters**. |
| Login always fails | Make sure `ADMIN_PASSWORD_HASH` is the **hash**, not the plain password — and for Docker that every `$` is doubled to `$$`. |
| "Port already in use" (Docker) | Change the frontend port mapping in `docker-compose.yml`. |
| Can't reach the app on another device | Set `FRONTEND_URL` in `.env` to the machine's IP (e.g. `http://192.168.1.50:5173`). |

Need more detail? See the full [README](README.md).
