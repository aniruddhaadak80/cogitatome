# Deploying

`main` is always live. Three paths, pick one.

## Vercel (primary)

Production deploys track `main` two ways:

1. **GitHub integration** (recommended): import the repo in Vercel, framework
   preset Next.js, build `bun run build`. Regions `iad1` + `bom1` are set in
   `vercel.json`.
2. **Explicit workflow** (`.github/workflows/deploy-vercel.yml`): needs repo
   secrets `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`.

```powershell
bunx vercel --prod
```

Verify:

```powershell
curl.exe -sI https://cogitatome.vercel.app | Select-String "HTTP/|content-type"
```

## Docker (one command)

```powershell
docker compose up
```

Runs web (3000) + Python worker (8000) + Go relay (8090) with healthchecks.
The image is unbuilt locally (no daemon here) — CI builds and pushes to
`ghcr.io/aniruddhaadak80/cogitatome` on every push to main
(`.github/workflows/docker.yml`).

## Fly / Render / Railway (second platform)

- **Fly:** `fly launch --no-deploy` then `fly deploy` (`fly.toml`, region
  `bom`, healthcheck `/healthz`).
- **Render:** connect the repo; `render.yaml` (Singapore, Docker runtime,
  healthcheck `/healthz`) is picked up automatically.
- **Railway:** connect the repo; `railway.json` builds the Dockerfile with a
  `/healthz` healthcheck and `ON_FAILURE` restarts.

## Environment

The demo needs nothing. Deployment needs only origins and URLs — see
`.env.example`. Secrets travel via `{env:...}` / `{file:...}` substitution,
never committed. CI asserts no committed secrets with a grep for key patterns.
