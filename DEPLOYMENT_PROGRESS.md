# Production deployment record

Status on 2026-08-10: **production deployment succeeded on Vercel**. CI passed, Vercel successfully
deployed the working architecture, the production branch is `trunk`, the Vercel Root Directory is
the repository root, and root `app.js` is the sole detected Express entry point.

## Resolved entry-detection incident

The migration required four distinct corrections:

1. Vercel first rejected `backend/app.js` with “Invalid export found” because its recognized
   filename collided with Express auto-detection while the module intentionally exposed only the
   reusable `createApp()` factory. It was renamed to `backend/createApp.js`, and all imports and
   checks were updated.
2. Vercel then reported “No entrypoint found which imports express. Found possible entrypoint:
   server.js”. The backend workspace still advertised `server.js` as its package `main`, while the
   root package did not advertise `app.js` or directly own the Express dependency imported there.
   Root `main: app.js` and the direct root Express dependency were added; backend `main` was removed.
3. Those repository fixes were correct, but the Vercel project still had **Root Directory set to
   `backend`**. That excluded the root entry and package metadata and kept `backend/server.js` as the
   only visible candidate.
4. Root Directory was changed to `./` / repository root. Vercel then selected root `app.js`, the
   production deployment completed successfully, and `backend/server.js` remained local-only.

No fake default export was added to the factory, no listener was added to `app.js`, and no custom
routing was needed.

## Current production architecture

```text
app.js                  Vercel entry; direct Express import and default application export
backend/createApp.js    reusable Express factory
backend/runtime.js      MongoDB and sessions_v2 initialization
backend/server.js       local/traditional listener only
public/                 same-origin static frontend
vercel.json             security headers only
```

The repository root is one npm workspace with one authoritative root lockfile. CI and Vercel install
from that lockfile. Both packages accept Node `24.x`; `.nvmrc` pins 24.18.0 for reproducible local and
CI validation. The removed npm project settings no longer produce “Unknown project config” warnings;
reviewed lifecycle-script metadata remains in root `package.json`.

## Final hardening baseline

- MongoDB connectivity accepts only `MONGODB_URI`; the legacy credential fallback and hard-coded
  Atlas hostname are gone.
- Production sessions remain MongoDB-backed in `sessions_v2` with the existing seven-day TTL and
  cookie behavior.
- Login and signup use the same bcrypt-compatible 72 UTF-8-byte password ceiling.
- Auth routes have a tested application-level `429` safeguard; the globally consistent Vercel Hobby
  WAF rule is documented as live-project configuration.
- Static and Express responses share a restrictive CSP and security headers through a headers-only
  `vercel.json`.
- The browser can remove only Music Journal's local keys after confirming; authenticated clearing
  logs out first and never deletes MongoDB data.
- Both npm packages are private and unlicensed. No LICENSE file is implied.
- Default tests remain database-free. The opt-in Atlas test refuses the production database and
  verifies real `sessions_v2` persistence, TTL indexing, logout deletion, and cleanup.

## Operational status

The successful production deployment is the baseline. Any later repository change still requires
the root release checks and post-deployment verification in `DEPLOYMENT.md`. Live production data is
never used by the automated integration suite, and no production secrets are downloaded into the
workspace.

## Completed verification

- The established deployment passed CI and Vercel production deployment after the Root Directory
  correction.
- The final repository pass completed a clean root `npm ci` without engine, npm-configuration,
  deprecation, audit, or install-script warnings.
- Root `npm test` passed 18 tests with zero failures; the one credential-gated MongoDB integration
  test was correctly skipped.
- `npm ls` and `npm ls express` reported a valid workspace tree with Express 5.2.1 deduplicated.
- Explicit entry-point syntax checks, JSON parsing, GitHub Actions YAML parsing, security-header/CSP
  alignment, single-lockfile inspection, stale-reference/secret scans, and `git diff --check` passed.
- The traditional local server started successfully with an ephemeral port and the development
  MemoryStore. The HTTP suite covered `/`, `/api/health`, invalid API behavior, and Origin rejection.

## Ongoing operational checks

After each future release, repeat the HTTPS, cookie, account-isolation, cold-start, Atlas TTL-index,
rate-limit, browser CSP, and secret-exposure checks in `DEPLOYMENT.md`. Review Vercel and Atlas usage
alerts periodically, and rotate credentials immediately after any suspected exposure.
