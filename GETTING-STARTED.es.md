# Primeros pasos con FinKoll

🌐 [English](GETTING-STARTED.md) · [Svenska](GETTING-STARTED.sv.md) · **Español**

Funcionando en **tres pasos, unos 5 minutos**. Un script de instalación hace lo
difícil por ti — tú solo eliges un nombre de usuario y una contraseña.

---

## 1. Instala un requisito

Elige uno (Docker es lo más fácil):

- **[Docker Desktop](https://www.docker.com/products/docker-desktop/)** — recomendado
- o **[Node.js 20+](https://nodejs.org)**

## 2. Descarga FinKoll

```bash
git clone https://github.com/rohid/FinKoll.git
cd FinKoll
```

(O descarga el ZIP desde GitHub, descomprímelo y abre la carpeta en una terminal.)

## 3. Ejecuta el script de instalación

- **macOS / Linux:**
  ```bash
  bash scripts/setup.sh
  ```
- **Windows (PowerShell):**
  ```powershell
  powershell -ExecutionPolicy Bypass -File scripts\setup.ps1
  ```

Te pedirá:

1. Elegir cómo ejecutarlo → elige **Docker**
2. Elegir un **nombre de usuario** (o pulsa Enter para `admin`)
3. Elegir una **contraseña** (se escribe dos veces)

Todo lo demás — la clave de cifrado, el secreto de seguridad y el hash de tu
contraseña — se genera automáticamente y se guarda en tu archivo de
configuración. Cuando pregunte **“Start it now?”**, responde **sí** (`y`).

## 4. Abre e inicia sesión

Abre la dirección que imprimió el script — **http://localhost** con Docker — e
inicia sesión con el nombre de usuario y la contraseña que acabas de elegir.
¡Listo! 🎉

La interfaz aparece en **inglés, sueco o español** según el idioma de tu
navegador, y puedes cambiarlo cuando quieras desde el menú.

---

## Bueno saber

- **Tus datos** viven en una base de datos cifrada en `data/`, creada en el primer
  inicio, con copias de seguridad automáticas en `data/backups/`.
- **Guarda bien la clave de cifrado.** El script la guarda en tu archivo de
  configuración (`.env`); la base de datos no se puede abrir sin ella y no hay
  recuperación si se pierde. No la cambies después.
- **Cambia tu contraseña** cuando quieras desde **Configuración** dentro de la
  app, o vuelve a ejecutar el script de instalación.

## Iniciarlo más adelante (sin el script)

- **Docker:** `docker compose up -d --build` → http://localhost
  (detener con `docker compose down`)
- **Node.js:** `bash scripts/start.sh` → http://localhost:5173

## Solución de problemas

| Problema | Solución |
| -------- | -------- |
| El inicio de sesión siempre falla | Vuelve a ejecutar `scripts/setup.sh` y define la contraseña otra vez. |
| “Port already in use” (Docker) | Cambia el puerto del frontend en `docker-compose.yml` (p. ej. `"8080:80"`). |
| Acceder desde otro dispositivo | Vuelve a ejecutar el script e introduce la dirección de esa máquina (p. ej. `http://192.168.1.50`) cuando pregunte por la URL. |

¿Quieres los detalles de cada paso? Consulta el [README](README.md) completo.
