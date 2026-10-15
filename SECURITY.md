# Security Policy

## Supported versions

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |

Pre-1.0: supported means "we fix it on `main` promptly". There are no LTS
branches yet.

## Reporting a vulnerability

**Do not open a public issue for a security problem.** Instead:

1. Go to <https://github.com/aniruddhaadak80/cogitatome/security/advisories/new>
   (GitHub private vulnerability reporting), or
2. Open a draft security advisory against this repo.

Include: what you found, the affected route/package and version, exact
reproduction steps, and what you think the impact is.

## Response SLA

- Acknowledgement within **72 hours**.
- Initial assessment within **7 days**.
- Fix or mitigation plan communicated within **30 days** for confirmed issues.

## Scope notes

- This product runs with **no API keys, no auth, and no user data**: the demo
  is deterministic local simulation. The most likely vulnerability classes are
  dependency CVEs, Next.js misconfiguration, and the Python/Go services'
  request handling — all in scope.
- The Rust/Python/Go services each have their own CI jobs; a fix there ships
  with the same advisory process.
- Please also run `git grep -nE "(sk-[A-Za-z0-9]{20}|api[_-]?key)" -- .`
  before reporting a suspected secret leak — the repo is scanned for committed
  secrets in CI.
