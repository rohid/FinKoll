# ── Build stage ───────────────────────────────────────────────────────────────
# Needs python3 + make + g++ to compile better-sqlite3-multiple-ciphers (native addon)
FROM node:20-alpine AS builder

RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# Compile TypeScript, copy SQL migration files into dist/, then strip dev deps
RUN npm run build && \
    mkdir -p dist/db && \
    cp -r src/db/migrations dist/db/migrations && \
    npm prune --omit=dev

# ── Production stage ──────────────────────────────────────────────────────────
# Clean image — no build tools needed; native addon is already compiled above
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist        ./dist

EXPOSE 3001
CMD ["node", "dist/index.js"]
