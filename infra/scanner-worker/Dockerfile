FROM node:24-bookworm-slim@sha256:ba849c60be29959425b8734d57b8b4b7d56f98edd9504c9af091d5281095a71e
WORKDIR /app
COPY infra/scanner-worker/package.json infra/scanner-worker/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY scripts/scanner-worker.mjs scripts/scanner-worker-core.mjs ./scripts/
USER node
ENV NODE_ENV=production TZ=UTC
CMD ["node","scripts/scanner-worker.mjs"]
