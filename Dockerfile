FROM oven/bun:1.2-alpine

RUN apk add --no-cache redis vips-dev

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

ARG COMMIT_SHA
ENV COMMIT_SHA=$COMMIT_SHA

EXPOSE 4000

CMD ["bun", "run", "src/api.ts"]
