FROM node:20-alpine AS base
WORKDIR /app

# Install dependencies
FROM base AS deps
COPY package.json ./
COPY packages/core/package.json ./packages/core/
RUN npm install --workspace=packages/core --ignore-scripts

# Build
FROM deps AS builder
COPY packages/core ./packages/core
RUN npm run build --workspace=packages/core

# Runtime
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 agentguard

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/core/node_modules ./packages/core/node_modules
COPY --from=builder /app/packages/core/dist ./packages/core/dist
COPY packages/core/package.json ./packages/core/

RUN mkdir -p /data && chown agentguard:nodejs /data
USER agentguard

EXPOSE 3000 8080

ENV DB_PATH=/data/agentguard.db
ENV API_PORT=3000
ENV PROXY_PORT=8080

CMD ["node", "packages/core/dist/index.js"]
