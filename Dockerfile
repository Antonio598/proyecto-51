# ═══════════════════════════════════════════════════════════════════════════
#  CRM Seguros de Flotas — imagen única (backend + frontend)
#
#  Un solo contenedor expone el puerto 3000:
#    · Next.js sirve el panel y hace de proxy de /api hacia el backend interno.
#    · NestJS escucha en 127.0.0.1:3001, sin exponerse al exterior.
#
#  Al arrancar aplica las migraciones de Prisma automáticamente.
# ═══════════════════════════════════════════════════════════════════════════

# ── Etapa 1 — Backend (NestJS + Prisma) ──────────────────────────────────
FROM node:20-alpine AS backend-build
WORKDIR /app

COPY package*.json ./
COPY apps/backend/package.json apps/backend/package.json
COPY prisma ./prisma
RUN npm install --no-audit --no-fund

COPY tsconfig.base.json ./
COPY apps/backend ./apps/backend

RUN npx prisma generate --schema prisma/schema.prisma
RUN npm run build --workspace @crm/backend


# ── Etapa 2 — Frontend (Next.js standalone) ──────────────────────────────
FROM node:20-alpine AS frontend-build
WORKDIR /app

# Vacío por defecto: el navegador llama a /api en el mismo dominio y Next
# lo redirige al backend interno. Sólo se define si el backend vive aparte.
ARG NEXT_PUBLIC_API_URL=""
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

COPY package*.json ./
COPY apps/frontend/package.json apps/frontend/package.json
RUN npm install --no-audit --no-fund

COPY apps/frontend ./apps/frontend
RUN npm run build --workspace @crm/frontend


# ── Etapa 3 — Runtime ────────────────────────────────────────────────────
FROM node:20-alpine AS run
WORKDIR /app
ENV NODE_ENV=production
ENV BACKEND_PORT=3001
ENV PORT=3000

# Backend compilado + cliente de Prisma + CLI para las migraciones
COPY --from=backend-build /app/node_modules ./node_modules
COPY --from=backend-build /app/apps/backend/dist ./dist
COPY --from=backend-build /app/prisma ./prisma
COPY --from=backend-build /app/package.json ./package.json

# Frontend standalone en su propia carpeta, para que su node_modules
# no colisione con el del backend.
COPY --from=frontend-build /app/apps/frontend/.next/standalone ./web/
COPY --from=frontend-build /app/apps/frontend/.next/static ./web/apps/frontend/.next/static
COPY --from=frontend-build /app/apps/frontend/public ./web/apps/frontend/public

COPY docker-entrypoint.sh ./
RUN chmod +x ./docker-entrypoint.sh

EXPOSE 3000

# Comprueba el backend a través del proxy del frontend: si cualquiera
# de los dos procesos cae, el health check falla y el contenedor se reinicia.
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["./docker-entrypoint.sh"]
