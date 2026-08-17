# ═══════════════════════════════════════════════════════════
# Dockerfile نهایی برای Railway (v3.0 - FINAL)
# ★ Railway پورت را خودش می‌دهد
# ═══════════════════════════════════════════════════════════

# ─── مرحله ۱: Dependencies ─────────────────────────────────
FROM node:20-slim AS deps
RUN apt-get update && apt-get install -y openssl python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --legacy-peer-deps --no-audit --no-fund --ignore-scripts

# ─── مرحله ۲: Build ────────────────────────────────────────
FROM node:20-slim AS builder
RUN apt-get update && apt-get install -y openssl \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
RUN npm run build

# ─── مرحله ۳: Production Runner ────────────────────────────
FROM node:20-slim AS runner
RUN apt-get update && apt-get install -y openssl \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME="0.0.0.0"

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/src/generated ./src/generated
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/prisma ./node_modules/prisma

USER nextjs

# ★ Railway خودش PORT را می‌دهد
EXPOSE 3000

# ★ CMD مستقیم node server.js (نه npm start)
CMD ["node", "server.js"]