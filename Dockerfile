# cogitatome on Docker.
#
# Multi-stage: install with Bun, build the Next.js app, then run it.
# NOTE: unbuilt locally (no Docker daemon on this machine) — CI builds and
# pushes to GHCR on every push to main. See .github/workflows/docker.yml.
FROM oven/bun:1.3.14 AS deps
WORKDIR /app
COPY package.json bun.lock ./
COPY apps ./apps
COPY packages ./packages
RUN bun install --frozen-lockfile

FROM oven/bun:1.3.14 AS builder
WORKDIR /app
# Bun's default linker is "isolated": every workspace keeps its own
# node_modules (apps/web/node_modules/next, packages/core/node_modules/zod, ...)
# with the real packages in the root node_modules/.bun store. Copying only
# /app/node_modules therefore drops `next` and the build dies with
# "next: command not found" -- so the whole installed tree comes across.
COPY --from=deps /app ./
# The source is laid over the install tree; .dockerignore keeps the host's
# node_modules out of the context so it cannot clobber the container's.
COPY . .
RUN bun run build

FROM oven/bun:1.3.14-slim AS runner
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
RUN useradd -u 1001 -m appuser 2>/dev/null || adduser --disabled-password --gecos "" appuser 2>/dev/null || true
# The app runs with `next start`, so the whole built workspace (node_modules +
# .next) comes along. `output: 'standalone'` is deliberately not set — the
# monorepo's workspace symlinks don't survive the standalone trace.
COPY --from=builder --chown=1001:1001 /app /app
USER 1001
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD bun -e "fetch('http://127.0.0.1:3000/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["bun", "--cwd", "apps/web", "run", "start", "--", "--port", "3000"]
