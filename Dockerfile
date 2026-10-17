# Single-container build for SLTS — the current combined
# app (API + static frontend, one Node process, one port), not split into
# separate frontend/backend containers.
FROM node:22-slim

WORKDIR /app

# Install dependencies first so this layer is cached across code-only rebuilds.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src
COPY public ./public

# data/ is a volume (see docker-compose.yml) — don't bake it into the image.
RUN mkdir -p data

ENV NODE_ENV=production
EXPOSE 5000

# Lets Docker (and any orchestrator honoring container health) detect a
# dead DB connection pool and restart the container for a fresh one — the
# pool doesn't self-heal from a fully lost connection on its own. No curl
# in this slim image, so the check is a plain Node http request.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:5000/health', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["node", "src/server.js"]
