# Deployment migration progress

Status as of 2026-08-10: repository preparation for Vercel Hobby is complete; no Vercel project was
created, no deployment was started, and these changes remain uncommitted and unpushed.

## Provider decision

The previous Render configuration was removed. Vercel Hobby was selected for the requested
mainstream, personal/non-commercial workflow without an instance choice, payment-card setup, or paid
runtime configuration. The migration uses only Vercel's Git integration, static CDN, Express
Function, environment variables, HTTPS, and included Hobby capabilities. It adds no Docker image,
paid add-on, fixed networking, database, domain, or deployment token.

Hobby has fixed usage allowances. If the application outgrows them, service can be paused or
restricted until the allowance resets; this repository does not enable paid overages.

## Repository and architecture changes

- Deleted `render.yaml` and replaced provider-specific README and deployment instructions.
- Added a minimal root npm workspace and lockfile so Vercel installs the backend's production
  dependencies from the repository root using documented npm workspace behavior.
- Added root `app.js`, a current Vercel Express entry that imports Express, initializes the shared
  runtime, default-exports the app, and never opens a port or installs signal handlers.
- Extracted environment validation and MongoDB session-store creation into `backend/runtime.js` so
  the Vercel entry and traditional server use exactly the same application, session, and cookie
  configuration.
- Retained `backend/server.js` for local development and traditional Node hosting. It remains the
  only entry that calls `listen()`, handles `PORT`, responds to process signals, and closes MongoDB
  during process shutdown.
- Preserved `public/` unchanged. Vercel serves it from its CDN; local Express continues to serve it
  with the existing static middleware. Current Vercel Express support needs no custom rewrite or
  `vercel.json` for this structure.
- Preserved the module-scoped MongoDB client and connection promise. Each warm Function instance
  reuses its client; requests never close it. The pool now caps application connections at ten,
  keeps no idle minimum, and retires idle connections after 60 seconds.
- Preserved MongoDB-backed sessions in `sessions_v2`, the seven-day TTL and cookie lifetime, and
  production `HttpOnly`, `Secure`, `SameSite=Lax` cookies. Production still ignores
  `SESSION_STORE=memory`.
- Updated CI to install the root workspace lockfile with `npm ci`, then run the backend tests. CI
  remains triggered for pull requests and pushes to `trunk` and uses `.nvmrc` for Node 24.18.0.
- Added runtime contract tests for production session-secret validation, persistent-store
  enforcement, the `sessions_v2` name, and the seven-day TTL.
- Moved the root install-script approval policy to the root package while retaining a narrowed
  backend-only approval configuration for the supported `npm --prefix backend ci` workflow.

## Serverless and Atlas considerations

- Vercel turns the exported Express application into one Function and may reuse or replace its
  instance. Account, journal, and session correctness does not rely on process memory.
- The root entry waits for the shared MongoDB client before exporting the configured application.
  Model operations and `connect-mongo` then share that same client and its pool within a warm
  instance.
- Vercel Hobby has dynamic outbound addresses and no included fixed-egress feature. The documented
  practical Atlas rule is therefore `0.0.0.0/0`, combined with mandatory authentication, a strong
  rotated password, and a dedicated user with only `readWrite` on `music-journal`.
- Production secrets and database configuration are scoped to Vercel Production only. Preview APIs
  fail closed unless the owner later supplies an independent non-production database and user.

## Verification completed

All Node/npm checks used the repository's pinned Node.js 24.18.0 runtime.

| Check | Result |
| --- | --- |
| `npm --prefix backend ci` | Passed; clean isolated backend install |
| `npm --prefix backend test` | Passed; 13 passed, 0 failed, 1 gated database test skipped |
| Root `npm test` workspace alias | Passed with the same 13/0/1 result |
| Root `npm ci` (Vercel/CI install path) | Passed; 124 packages installed, 0 vulnerabilities |
| JavaScript syntax checks, including root Vercel entry | Passed as part of `npm test` |
| Runtime production-secret and persistent-session invariants | Passed |
| Existing health, static frontend, API error, CORS, logging, and validation tests | Passed |

The live MongoDB integration suite was not run during this migration because no dedicated test
database was supplied, and destructive or write-oriented checks against production were explicitly
out of scope. A prior workspace run exercised an isolated UUID account and entry against the
`music-journal` database, passed signup/session/idempotency/retrieval/logout checks, and confirmed
cleanup; that historical result is not a substitute for a fresh Vercel deployment test.

## Remaining manual work

1. Rotate the previously exposed Atlas password and confirm a dedicated user with only `readWrite`
   on `music-journal`.
2. Add the Atlas `0.0.0.0/0` Network Access entry required by dynamic Vercel Hobby egress, accepting
   and mitigating the documented security tradeoff.
3. Review, commit, and push these changes to `trunk`.
4. Import `vldstassh/music-journal` into a personal Vercel Hobby account with the exact fields in
   `DEPLOYMENT.md`.
5. Add the five Production-only environment variables, deploy, and set Production Branch Tracking
   to `trunk`.
6. Complete every HTTPS, health, authentication, account-isolation, persistence, cold-start,
   session-cookie, Atlas collection, browser exposure, and log check in `DEPLOYMENT.md`.

Not yet verified: Vercel account import/framework detection, Vercel's actual build output, a live
`vercel.app` hostname, provider-managed HTTPS, the owner's Atlas user/access-list state, production
environment-variable scopes, live cold starts, or end-to-end behavior in the deployed environment.
Those require external account access and newly rotated secrets. The Vercel CLI was not linked or
used to build because doing so requires project/account configuration; no deployment was created.
