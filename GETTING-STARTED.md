# Getting Started with FinKoll

🌐 **English** · [Svenska](GETTING-STARTED.sv.md) · [Español](GETTING-STARTED.es.md)

Up and running in **three steps, about 5 minutes**. A setup script does the hard
parts for you — you only pick a username and password.

---

## 1. Install one prerequisite

Choose one (Docker is easiest):

- **[Docker Desktop](https://www.docker.com/products/docker-desktop/)** — recommended
- or **[Node.js 20+](https://nodejs.org)**

## 2. Download FinKoll

```bash
git clone https://github.com/<your-username>/FinKoll.git
cd FinKoll
```

(Or download the ZIP from GitHub, unzip it, and open the folder in a terminal.)

## 3. Run the setup script

- **macOS / Linux:**
  ```bash
  bash scripts/setup.sh
  ```
- **Windows (PowerShell):**
  ```powershell
  powershell -ExecutionPolicy Bypass -File scripts\setup.ps1
  ```

It will ask you to:

1. Pick how to run it → choose **Docker**
2. Choose a **username** (or press Enter for `admin`)
3. Choose a **password** (typed twice)

Everything else — the encryption key, the security secret, and hashing your
password — is generated automatically and saved to your config file. When it
asks **“Start it now?”**, say **yes**.

## 4. Open and log in

Open the address the script printed — **http://localhost** for Docker — and log
in with the username and password you just chose. That’s it! 🎉

The interface appears in **English, Swedish, or Spanish** based on your browser’s
language, and you can switch any time from the menu.

---

## Good to know

- **Your data** lives in an encrypted database under `data/`, created on first
  start, with automatic backups in `data/backups/`.
- **Keep the encryption key safe.** The script saves it in your config file
  (`.env`); the database cannot be opened without it, and there is no recovery if
  it’s lost. Don’t change it later.
- **Change your password** any time from **Settings** inside the app, or re-run
  the setup script.

## Starting it later (without the script)

- **Docker:** `docker compose up -d --build` → http://localhost
  (stop with `docker compose down`)
- **Node.js:** `bash scripts/start.sh` → http://localhost:5173

## Troubleshooting

| Problem | Fix |
| ------- | --- |
| Login always fails | Re-run `scripts/setup.sh` and set the password again. |
| “Port already in use” (Docker) | Edit `docker-compose.yml` and change the frontend port (e.g. `"8080:80"`). |
| Reaching it from another device | Re-run setup and enter that machine’s address (e.g. `http://192.168.1.50`) when asked for the URL. |

Want the details behind each step? See the full [README](README.md).
