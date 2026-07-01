# Primeros pasos con FinKoll

🌐 [English](GETTING-STARTED.md) · [Svenska](GETTING-STARTED.sv.md) · **Español**

¡Bienvenido/a! Esta guía te lleva desde una copia nueva de FinKoll hasta iniciar
sesión por primera vez. No se asumen conocimientos previos. Funciona en
**Linux, macOS y Windows**.

Vas a:

1. Instalar el único requisito
2. Descargar FinKoll
3. Crear tu configuración — incluida **tu propia contraseña de acceso**
4. Iniciar la aplicación
5. Iniciar sesión

Tiempo total: unos 10 minutos.

> **La versión corta:** FinKoll no tiene pantalla de registro. Creas tu nombre de
> usuario y contraseña *una sola vez*, de antemano, colocándolos en un archivo de
> configuración antes del primer inicio. Los pasos 3a–3d te guían.

---

## Paso 1 — Instala el requisito

Elige **una** de estas opciones. Docker es la más sencilla y la recomendada.

- **Opción A — Docker (recomendada):** instala
  [Docker Desktop](https://www.docker.com/products/docker-desktop/) (Windows/macOS)
  o Docker Engine + Compose v2 (Linux). En Windows, Docker Desktop configura WSL2
  por ti.
- **Opción B — Node.js (sin Docker):** instala
  [Node.js 20 o posterior](https://nodejs.org) (incluye `npm`).

Necesitas Node.js para el paso de la contraseña de abajo **aunque hayas elegido
Docker** — pero tranquilo/a, también hay una alternativa solo con Docker para eso
(paso 3c).

---

## Paso 2 — Descarga FinKoll

```bash
git clone https://github.com/<tu-usuario>/FinKoll.git
cd FinKoll
```

(O descarga el ZIP desde GitHub, descomprímelo y entra en la carpeta con `cd`.)

---

## Paso 3 — Crea tu configuración (aquí defines tu contraseña)

FinKoll lee cuatro valores de un archivo de entorno. Vas a generar dos secretos
aleatorios, elegir un nombre de usuario y crear una contraseña.

### 3a. Copia el archivo de ejemplo

La ubicación del archivo depende de cómo vayas a ejecutar la aplicación:

| Cómo la vas a ejecutar | Crea el archivo en |
| ---------------------- | ------------------ |
| Docker (paso 4A)       | `.env` en la raíz del proyecto |
| Node.js (paso 4B)      | `backend/.env` |

- **Linux / macOS:**
  ```bash
  cp .env.example .env          # Docker
  # o
  cp .env.example backend/.env  # Node.js
  ```
- **Windows (PowerShell):**
  ```powershell
  Copy-Item .env.example .env           # Docker
  # o
  Copy-Item .env.example backend\.env   # Node.js
  ```

### 3b. Genera los dos secretos

**`DB_ENCRYPTION_KEY`** — debe tener **exactamente 32 caracteres** (cifra tu base
de datos):

- **Linux / macOS:** `openssl rand -hex 16`
- **Windows (PowerShell):**
  ```powershell
  -join ((48..57)+(97..102) | Get-Random -Count 32 | ForEach-Object {[char]$_})
  ```

**`JWT_SECRET`** — cualquier cadena aleatoria larga (se usa para firmar las
sesiones de acceso):

- **Cualquier plataforma con Node.js:**
  ```bash
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```

Copia cada resultado — los pegarás en el paso 3d.

### 3c. Crea tu contraseña de acceso 🔑

FinKoll nunca almacena tu contraseña directamente — almacena un **hash bcrypt**
de ella. Generas ese hash una vez y lo pegas en la configuración. Sustituye
`ElijeUnaContrasenaFuerte` por la contraseña con la que realmente quieras entrar.

- **Si tienes Node.js instalado** (ejecuta desde la carpeta `backend`):
  ```bash
  cd backend
  npm install        # solo la primera vez
  node -e "require('bcryptjs').hash('ElijeUnaContrasenaFuerte', 12).then(console.log)"
  cd ..
  ```

- **Solo con Docker (sin Node.js instalado):**
  ```bash
  docker run --rm node:20-alpine sh -lc "npm i -s bcryptjs && node -e \"require('bcryptjs').hash('ElijeUnaContrasenaFuerte',12).then(console.log)\""
  ```

La salida se parece a `$2a$12$Xa1b2c3...` — ese es tu hash de contraseña. Cópialo.

> **Recuerda la contraseña en sí** — el hash es unidireccional y no se puede
> revertir. Si la olvidas, simplemente generas un hash nuevo y actualizas la
> configuración (tus datos no se ven afectados). Consulta
> [Cambiar tu contraseña más adelante](#cambiar-tu-contraseña-más-adelante).

### 3d. Rellena el archivo

Abre el archivo que creaste en 3a y define los cuatro valores:

```dotenv
# Cadena aleatoria larga del paso 3b (JWT_SECRET)
JWT_SECRET=pega-aqui-el-secreto-jwt

# EXACTAMENTE 32 caracteres del paso 3b (DB_ENCRYPTION_KEY)
DB_ENCRYPTION_KEY=pega-aqui-la-clave-de-32-caracteres

# El nombre de usuario que escribirás en la pantalla de acceso
ADMIN_USERNAME=admin

# El hash bcrypt del paso 3c — NO tu contraseña en texto plano
ADMIN_PASSWORD_HASH=pega-aqui-el-hash
```

> ⚠️ **Usuarios de Docker — escapa los signos `$`.** Un hash bcrypt contiene
> caracteres `$`, que Docker Compose trata de forma especial. En el archivo
> **`.env` de la raíz**, duplica cada `$`: escribe `$2a$12$abc...` como
> `$$2a$$12$$abc...`. (Los usuarios de Node.js que editan `backend/.env` **no**
> necesitan hacer esto.)

---

## Paso 4 — Inicia la aplicación

### Opción 4A — Docker (recomendada)

```bash
docker compose up -d --build
```

Luego abre **http://localhost** en tu navegador.

- Ver registros: `docker compose logs -f`
- Detener: `docker compose down`

> Si el puerto 80 está ocupado, edita `docker-compose.yml` y cambia el puerto del
> frontend (p. ej. `"8080:80"`), luego abre http://localhost:8080.

### Opción 4B — Node.js (modo desarrollo)

```bash
npm install --prefix backend
npm install --prefix frontend
```

Luego inicia ambos servidores:

- **Linux / macOS:** `bash scripts/start.sh`
- **Windows (PowerShell)** — dos terminales:
  ```powershell
  npm run dev --prefix backend
  ```
  ```powershell
  npm run dev --prefix frontend
  ```

Luego abre **http://localhost:5173**.

---

## Paso 5 — Inicia sesión

Usa el **`ADMIN_USERNAME`** que definiste y la **contraseña en texto plano** que
elegiste en el paso 3c (no el hash). ¡Ya estás dentro! 🎉

La interfaz aparece automáticamente en **inglés, sueco o español** según el idioma
de tu navegador — puedes cambiarlo en cualquier momento desde la barra lateral (o
el menú en móvil).

---

## Qué ocurre en el primer inicio

- Se crea una **base de datos SQLite cifrada** en `data/` con un conjunto inicial
  de categorías y una casa — renombra o amplía lo que quieras en
  **Configuración**.
- Se escriben copias de seguridad automáticas en `data/backups/` en cada inicio y
  antes de cada actualización.

**Mantén tu `DB_ENCRYPTION_KEY` segura y sin cambios.** La base de datos no se
puede abrir sin ella, y no hay recuperación posible si se pierde.

---

## Cambiar tu contraseña más adelante

1. Genera un hash nuevo (repite el paso 3c con tu nueva contraseña).
2. Pégalo en `ADMIN_PASSWORD_HASH` en tu `.env` (recuerda el escape `$$` para
   Docker).
3. Reinicia: `docker compose up -d` (Docker) o reinicia los servidores de
   desarrollo.

Tus datos quedan intactos. También puedes cambiar la contraseña desde la propia
aplicación en **Configuración** una vez que hayas iniciado sesión.

---

## Solución de problemas

| Síntoma | Solución |
| ------- | -------- |
| La app no arranca, error sobre la clave de cifrado | `DB_ENCRYPTION_KEY` debe tener **exactamente 32 caracteres**. |
| El inicio de sesión siempre falla | Asegúrate de que `ADMIN_PASSWORD_HASH` sea el **hash**, no la contraseña en texto plano — y para Docker que cada `$` esté duplicado a `$$`. |
| "Port already in use" (Docker) | Cambia la asignación de puerto del frontend en `docker-compose.yml`. |
| No puedo acceder a la app desde otro dispositivo | Define `FRONTEND_URL` en `.env` con la IP de la máquina (p. ej. `http://192.168.1.50:5173`). |

¿Necesitas más detalles? Consulta el [README](README.md) completo.
