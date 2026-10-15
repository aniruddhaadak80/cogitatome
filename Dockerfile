# cogitatome on Docker.
#
# Multi-stage: install with Bun, build the Next.js app, then run it.
# NOTE: unbuilt locally (no Docker daemon on this machine) — CI builds and
# pushes to GHCR on every push to main. See .github/workflows/docker.yml.
FROM oven/bun:1.3.14 AS deps
WORKDIR /app
COPY package.json bun.lock ./
COPY apps/web/package.json ./apps/web/package.json
COPY packages/*/package.json ./packages/*/
RUN bun install --frozen-lockfile

FROM oven/bun:1.3.14 AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN bun run build

FROM oven/bun:1.3.14-slim AS runner
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
RUN adduser --disabled-password --gecos "" cogitatome || true
# The app runs with `next start`, so the whole built workspace (node_modules +
# .next) comes along. `output: 'standalone'` is deliberately not set — the
# monorepo's workspace symlinks don't survive the standalone trace.
COPY --from=builder --chown=cogitatome /app /app
USER cogitatome
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD bun -e "fetch('http://127.0.0.1:3000/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["bun", "--cwd", "apps/web", "run", "start", "--", "--port", "3000"]
