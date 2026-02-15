# -----------------------------
# 1️⃣ Base Image
# -----------------------------
FROM node:22.13.1-alpine3.21 AS base

WORKDIR /app

RUN apk add --no-cache libc6-compat openssl
RUN npm install -g pnpm


# -----------------------------
# 2️⃣ Dependencies Stage
# -----------------------------
FROM base AS deps

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps ./apps
COPY packages ./packages

RUN pnpm install --frozen-lockfile


# -----------------------------
# 3️⃣ Build Stage
# -----------------------------
FROM base AS builder

# Copy deps + source
COPY --from=deps /app /app
COPY . .

# Generate Prisma client only (no migration at build time)
RUN pnpm run db:migrate

# Build Next.js app
RUN pnpm --filter web build

# Debug: confirm server.js location
RUN find /app/apps/web/.next/standalone -name "server.js"


# -----------------------------
# 4️⃣ Production Runner
# -----------------------------
FROM node:22.13.1-alpine3.21 AS runner

WORKDIR /app

RUN apk add --no-cache libc6-compat openssl

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Security: never run as root
RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

# Copy standalone output (includes its own minimal node_modules)
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./

# Static + public MUST sit next to server.js
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/public ./apps/web/public

USER nextjs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/health || exit 1

# No pnpm needed - standalone is self-contained
CMD ["node", "apps/web/server.js"]