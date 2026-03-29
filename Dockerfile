FROM oven/bun:1.2-alpine

RUN apk add --no-cache redis

WORKDIR /app

# Install dependencies
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile 2>/dev/null || bun install

# Generate Prisma client
COPY prisma ./prisma
RUN bunx prisma generate

# Copy source (ARG busts cache on code changes)
ARG CACHE_BUST=1
COPY . .

EXPOSE 4000

HEALTHCHECK --interval=5s --timeout=3s --start-period=30s --retries=30 \
  CMD wget -qO- http://localhost:4000/auth/nonce || exit 1

CMD ["bun", "run", "src/index.ts"]
