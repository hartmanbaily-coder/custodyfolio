FROM node:22-alpine AS deps
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm install -g npm@11.6.2
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app

ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_RECORDS_HOST
ARG NEXT_PUBLIC_RECORDS_STORAGE_MODE
ARG NEXT_PUBLIC_RECORDS_SIGNUPS_ENABLED
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY

ENV NEXT_TELEMETRY_DISABLED=1
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_RECORDS_HOST=$NEXT_PUBLIC_RECORDS_HOST
ENV NEXT_PUBLIC_RECORDS_STORAGE_MODE=$NEXT_PUBLIC_RECORDS_STORAGE_MODE
ENV NEXT_PUBLIC_RECORDS_SIGNUPS_ENABLED=$NEXT_PUBLIC_RECORDS_SIGNUPS_ENABLED
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY

COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM deps AS production-deps
RUN npm prune --omit=dev

FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=production-deps --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /app/scripts/report-growth-scorecard.mjs ./scripts/report-growth-scorecard.mjs
COPY --from=builder --chown=nextjs:nodejs /app/scripts/growth-scorecard-lib.mjs ./scripts/growth-scorecard-lib.mjs
COPY --from=builder --chown=nextjs:nodejs /app/scripts/verify-malware-scanner.mjs ./scripts/verify-malware-scanner.mjs
COPY --from=builder --chown=nextjs:nodejs /app/scripts/verify-supabase-auth-public-settings.mjs ./scripts/verify-supabase-auth-public-settings.mjs
COPY --from=builder --chown=nextjs:nodejs /app/scripts/verify-security-headers.mjs ./scripts/verify-security-headers.mjs
COPY --from=builder --chown=nextjs:nodejs /app/scripts/verify-security-event-sink.mjs ./scripts/verify-security-event-sink.mjs
COPY --from=builder --chown=nextjs:nodejs /app/scripts/verify-two-user-isolation.mjs ./scripts/verify-two-user-isolation.mjs
COPY --from=builder --chown=nextjs:nodejs /app/scripts/verify-apple-notifications-v2.mjs ./scripts/verify-apple-notifications-v2.mjs
COPY --from=builder --chown=nextjs:nodejs /app/scripts/storage-backup-lib.mjs ./scripts/storage-backup-lib.mjs
COPY --from=builder --chown=nextjs:nodejs /app/scripts/backup-supabase-storage.mjs ./scripts/backup-supabase-storage.mjs
COPY --from=builder --chown=nextjs:nodejs /app/scripts/verify-supabase-storage-backup.mjs ./scripts/verify-supabase-storage-backup.mjs

USER nextjs

EXPOSE 3000

CMD ["node", "server.js"]
