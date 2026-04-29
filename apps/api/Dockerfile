# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package manifests first for better layer caching
COPY package.json package-lock.json ./
COPY packages/types/package.json ./packages/types/
COPY packages/db/package.json      ./packages/db/
COPY apps/api/package.json         ./apps/api/

# Install all dependencies (dev deps needed for tsc and prisma generate)
RUN npm ci

# Copy TypeScript configs and source
COPY tsconfig.base.json ./
COPY packages/types/tsconfig.json  ./packages/types/
COPY packages/types/src            ./packages/types/src
COPY packages/db/tsconfig.json     ./packages/db/
COPY packages/db/src               ./packages/db/src
COPY packages/db/prisma            ./packages/db/prisma
COPY apps/api/tsconfig.json        ./apps/api/
COPY apps/api/src                  ./apps/api/src

# Generate the Prisma client
RUN npx prisma generate --schema=packages/db/prisma/schema.prisma

# Compile workspace packages and API in dependency order
RUN npm run build --workspace=packages/types && \
    npm run build --workspace=packages/db && \
    npm run build --workspace=apps/api

# ── Stage 2: Production runtime ───────────────────────────────────────────────
FROM node:20-alpine

WORKDIR /app
ENV NODE_ENV=production

# Copy package manifests so npm ci can recreate workspace symlinks
COPY package.json package-lock.json ./
COPY packages/types/package.json ./packages/types/
COPY packages/db/package.json      ./packages/db/
COPY apps/api/package.json         ./apps/api/

# Install production dependencies only
RUN npm ci --omit=dev

# Patch workspace package.json main fields to point at compiled dist outputs.
# These files are local to the image — the repo source is unchanged.
RUN node -e "\
  const fs = require('fs'); \
  const patch = (p, main) => { const pkg = JSON.parse(fs.readFileSync(p, 'utf8')); pkg.main = main; fs.writeFileSync(p, JSON.stringify(pkg, null, 2)); }; \
  patch('packages/types/package.json', 'dist/index.js'); \
  patch('packages/db/package.json',    'dist/client.js'); \
"

# Copy compiled artifacts from builder
COPY --from=builder /app/packages/types/dist ./packages/types/dist
COPY --from=builder /app/packages/db/dist    ./packages/db/dist
COPY --from=builder /app/apps/api/dist       ./apps/api/dist

# Copy generated Prisma client and schema (needed for the query engine)
COPY --from=builder /app/node_modules/.prisma          ./node_modules/.prisma
COPY packages/db/prisma                               ./packages/db/prisma

# Copy Prisma CLI and schema engine so migrations can be run from this image
COPY --from=builder /app/node_modules/prisma          ./node_modules/prisma
COPY --from=builder /app/node_modules/@prisma/engines  ./node_modules/@prisma/engines

# Create an unprivileged user and a writable log directory
RUN addgroup -S appgroup && adduser -S appuser -G appgroup && \
    mkdir -p /app/logs && chown -R appuser:appgroup /app/logs

USER appuser

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["node", "apps/api/dist/index.js"]
