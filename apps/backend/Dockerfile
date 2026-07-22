# Backend NestJS + Prisma. Contexto de build = raíz del monorepo.
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
COPY apps/backend/package.json apps/backend/package.json
COPY prisma ./prisma
RUN npm install
COPY tsconfig.base.json ./
COPY apps/backend ./apps/backend
RUN npx prisma generate --schema prisma/schema.prisma
RUN npm run build --workspace @crm/backend

FROM node:20-alpine AS run
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/backend/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY package*.json ./
EXPOSE 3001
# Aplica migraciones y arranca.
CMD ["sh", "-c", "npx prisma migrate deploy --schema prisma/schema.prisma && node dist/main.js"]
