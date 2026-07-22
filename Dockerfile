# ═══════════════════════════════════════════════════════════════════════════
#  CRM Seguros de Flotas — imagen única (backend + frontend)
#
#  Un solo contenedor expone el puerto 3000:
#    · Next.js sirve el panel y hace de proxy de /api hacia el backend interno.
#    · NestJS escucha en 127.0.0.1:3001, sin exponerse al exterior.
#
#  Al arrancar aplica las migraciones de Prisma automáticamente.
# ═══════════════════════════════════════════════════════════════════════════

# ── Etapa 1 — Dependencias ───────────────────────────────────────────────
# Se instalan las de AMBOS workspaces de una vez, para que `npm ci` cuadre
# exactamente con package-lock.json (si falta un workspace, npm ci falla).
FROM node:20-alpine AS deps
# Prisma necesita openssl y libc6-compat en Alpine (musl). Sin esto el motor
# de consultas no carga y el backend muere al arrancar, en bucle.
RUN apk add --no-cache openssl libc6-compat
WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/backend/package.json apps/backend/
COPY apps/frontend/package.json apps/frontend/
RUN npm ci --no-audit --no-fund


# ── Etapa 2 — Compilación ────────────────────────────────────────────────
FROM deps AS build
WORKDIR /app

# Vacío por defecto: el navegador llama a /api en el mismo dominio y Next
# lo redirige al backend interno. Sólo se define si el backend vive aparte.
ARG NEXT_PUBLIC_API_URL=""
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

COPY tsconfig.base.json ./
COPY prisma ./prisma
COPY apps ./apps

RUN npx prisma generate --schema prisma/schema.prisma
RUN npm run build --workspace @crm/backend
RUN npm run build --workspace @crm/frontend


# ── Etapa 3 — Runtime ────────────────────────────────────────────────────
FROM node:20-alpine AS run
RUN apk add --no-cache openssl libc6-compat
WORKDIR /app

ENV NODE_ENV=production
ENV BACKEND_PORT=3001
ENV PORT=3000

# Backend compilado + cliente de Prisma generado + CLI para las migraciones
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/backend/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/package.json ./package.json

# Frontend standalone en su propia carpeta, para que su node_modules
# no colisione con el del backend.
COPY --from=build /app/apps/frontend/.next/standalone ./web/
COPY --from=build /app/apps/frontend/.next/static ./web/apps/frontend/.next/static
COPY --from=build /app/apps/frontend/public ./web/apps/frontend/public

COPY docker-entrypoint.sh ./
RUN chmod +x ./docker-entrypoint.sh

EXPOSE 3000

# Comprueba el backend a través del proxy del frontend: si cualquiera
# de los dos procesos cae, el health check falla.
HEALTHCHECK --interval=30s --timeout=5s --start-period=90s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["./docker-entrypoint.sh"]
