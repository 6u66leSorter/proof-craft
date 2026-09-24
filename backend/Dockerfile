# Образ backend: один для контейнеров api (NestJS HTTP) и bot (bot-main.js).
# Контекст сборки — корень репозитория (общий с frontend/Dockerfile).

FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY backend/package.json backend/package-lock.json backend/prisma7.config.ts ./
COPY backend/tsconfig.json backend/tsconfig.build.json ./
COPY backend/prisma ./prisma
# postinstall генерирует Prisma client из prisma/schema.prisma.
RUN npm ci
COPY backend/src ./src
RUN npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production \
    NEST_API_HOST=0.0.0.0 \
    NEST_API_PORT=8788 \
    DATABASE_URL=file:/app/data/barber.db
WORKDIR /app
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY backend/prisma/schema.sql ./prisma/schema.sql
COPY backend/docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN mkdir -p data/uploads && chown -R node:node data && chmod +x /usr/local/bin/entrypoint.sh
USER node
VOLUME ["/app/data"]
EXPOSE 8788
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.NEST_API_PORT||8788)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["node", "dist/main.js"]
