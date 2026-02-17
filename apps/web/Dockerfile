# -----------------------------
# Base Image
# -----------------------------
  FROM node:22.13.1-alpine3.21 AS base
  WORKDIR /app
  RUN apk add --no-cache libc6-compat openssl bash curl
  RUN npm i -g pnpm
  
  # -----------------------------
  # Dependencies Stage
  # -----------------------------
  FROM base AS deps
  WORKDIR /app
  
  COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc turbo.json ./
  COPY apps ./apps
  COPY packages ./packages
  
  RUN pnpm install --frozen-lockfile
  
  # -----------------------------
  # Builder Stage
  # -----------------------------
  FROM base AS builder
  WORKDIR /app
  
  COPY --from=deps /app /app
  COPY . .
  
  ENV DATABASE_URL="postgresql://fake:fake@localhost:5432/fake"
  
  RUN pnpm db:generate
  RUN pnpm --filter @repo/db build
  RUN pnpm --filter @repo/auth build
  RUN pnpm --filter web build
  
  # -----------------------------
  # Production Runner
  # -----------------------------
  FROM node:22.13.1-alpine3.21 AS runner
  WORKDIR /app
  
  # Only openssl needed at runtime for Prisma
  RUN apk add --no-cache openssl
  # Pin to exact version matching project
  RUN npm i -g prisma@7.4.0
  
  ENV NODE_ENV=production
  ENV PORT=3000
  ENV HOSTNAME=0.0.0.0
  
  RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 nextjs
  
  # Only copy what's needed at runtime — no turbo.json, no .npmrc, no pnpm-lock
  COPY --from=builder --chown=nextjs:nodejs /app/packages/db/prisma          ./packages/db/prisma
  COPY --from=builder --chown=nextjs:nodejs /app/packages/db/prisma.config.ts ./packages/db/prisma.config.ts
  COPY --from=builder --chown=nextjs:nodejs /app/packages/db/dist            ./packages/db/dist
  COPY --from=builder --chown=nextjs:nodejs /app/packages/auth/dist          ./packages/auth/dist
  
  # node_modules needed for prisma/config resolution and @prisma/client
  COPY --from=builder --chown=nextjs:nodejs /app/node_modules                ./node_modules
  COPY --from=builder --chown=nextjs:nodejs /app/packages/db/node_modules    ./packages/db/node_modules
  
  # Next.js standalone (includes its own node_modules)
  COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone   ./
  
  # Static + public sit next to server.js
  COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static       ./apps/web/.next/static
  COPY --from=builder --chown=nextjs:nodejs /app/apps/web/public             ./apps/web/public
  
  USER nextjs
  
  EXPOSE 3000
  
  HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD wget -qO- http://localhost:3000/api/health || exit 1
  
  CMD sh -c "\
    set -e && \
    echo 'Running Prisma migrations...' && \
    cd /app/packages/db && \
    prisma migrate deploy && \
    echo 'Starting Next.js server...' && \
    node /app/apps/web/server.js \
  "