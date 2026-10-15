# Runbook: incident response

For "the site is down or wrong" — the 15-minute path.

1. **Probe.** `curl -s https://<live-url>/healthz` — dependency-free, answers
   before the engine warms. Then `/api/v1/metrics?model=induction` and check
   `inductionHeads: 1`.
2. **Bisect.** Vercel deployment history → redeploy the previous green build.
   `main` is always deployable, so rollback is one click.
3. **Local repro.** `bun install && bun run typecheck && bun run test &&
   bun run check:induction`. If induction is not 19/19 locally, it is an
   engine regression, not infra.
4. **Services.** Python: `/healthz` on :8000. Go: `/healthz` + `/readyz` on
   :8090. The web app degrades without both — confirm the page, not just the
   service.
5. **Record.** Open an issue with the timeline, the rollback SHA, and the
   failing gate output. No silent fixes.
