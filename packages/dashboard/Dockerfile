FROM node:20-alpine AS base
WORKDIR /app

# Install dependencies
FROM base AS deps
COPY package.json ./
COPY packages/dashboard/package.json ./packages/dashboard/
RUN npm install --workspace=packages/dashboard --ignore-scripts

# Build
FROM deps AS builder
COPY packages/dashboard ./packages/dashboard
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build --workspace=packages/dashboard

# Runtime
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

COPY --from=builder /app/packages/dashboard/.next/standalone ./
COPY --from=builder /app/packages/dashboard/.next/static ./packages/dashboard/.next/static
COPY --from=builder /app/packages/dashboard/public ./packages/dashboard/public

USER nextjs
EXPOSE 3001
ENV PORT=3001
ENV HOSTNAME=0.0.0.0

CMD ["node", "packages/dashboard/server.js"]
