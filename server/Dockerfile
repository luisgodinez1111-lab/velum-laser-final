FROM node:20-alpine AS base
WORKDIR /app
COPY package.json package-lock.json* ./
# --legacy-peer-deps: @typescript-eslint@7 requiere peer eslint>=8 pero npm@10
# reporta conflicto falso. Eliminar al actualizar a @typescript-eslint@8.
RUN npm install --legacy-peer-deps
COPY . .
RUN npm run prisma:generate
RUN npm run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=base /app/dist ./dist
COPY --from=base /app/package.json ./package.json
COPY --from=base /app/package-lock.json* ./
COPY --from=base /app/prisma ./prisma
COPY --from=base /app/scripts ./scripts
COPY --from=base /app/src ./src
# Copiamos node_modules completo desde base (incluye prisma CLI + tsx + cliente
# generado). Los devDeps son ~80 MB extra; el ahorro de mantener un Dockerfile
# que funcione consistentemente vale la diferencia. Migrar a `node dist/...` y
# devDeps strip cuando se separe el image build (Fase 1).
# Copiamos node_modules ya hidratado desde el base stage.
COPY --from=base /app/node_modules ./node_modules
# El usuario 'node' (uid 1000) viene incluido en node:alpine.
# IMPORTANTE: el directorio de uploads del host debe ser propiedad de uid 1000:
#   sudo chown -R 1000:1000 /var/velum/uploads
RUN chmod +x ./scripts/start.sh && chown -R node:node /app
USER node
CMD ["./scripts/start.sh"]
