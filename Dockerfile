# ═══════════════════════════════════════════════════════════
# Dockerfile برای Railway - Node.js 20 (v2.2 - Final Fix)
# ★ سازگار با Prisma output در src/generated/client
# ═══════════════════════════════════════════════════════════

# ─── مرحله ۱: Dependencies ─────────────────────────────────
FROM node:20-slim AS deps
RUN apt-get update && apt-get install -y \
    openssl \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json* ./

# نصب با --ignore-scripts (prisma generate در builder اجرا می‌شود)
RUN npm install --legacy-peer-deps --no-audit --no-fund --ignore-scripts

# ─── مرحله ۲: Build ────────────────────────────────────────
FROM node:20-slim AS builder
RUN apt-get update && apt-get install -y \
    openssl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generate Prisma Client در src/generated/client
RUN npx prisma generate

# Build Next.js
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
RUN npm run build

# ─── مرحله ۳: Production ───────────────────────────────────
FROM node:20-slim AS runner
RUN apt-get update && apt-get install -y \
    openssl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# ایجاد user غیر root
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# ★ کپی فایل‌های لازم
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# ★ Prisma files
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/src/generated ./src/generated

# ★ Prisma Client از node_modules (چون در standalone کپی نمی‌شود)
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma || true

# ❌ خط قبلی که خطا می‌داد حذف شد:
# COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma

USER nextjs

EXPOSE 3000

CMD ["node", "server.js"]