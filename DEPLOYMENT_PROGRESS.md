# Deployment readiness progress

Status as of 2026-08-09: repository preparation is complete; no external service has been created or
deployed by this work.

## Inspected

- Server startup, port binding, graceful shutdown, MongoDB connection lifecycle, session store,
  cookies, proxy trust, CORS, static frontend serving, and `/api/health`.
- Environment template, secret-ignore rules, runtime metadata, lockfile, direct dependencies, tests,
  CI workflow, README, and Git history for common committed-secret patterns.
- Current official Render, MongoDB Atlas, Node.js, and GitHub Actions deployment requirements.

## Changed and why

- Added `render.yaml` for one paid Render web service on `trunk`, with CI-gated auto-deploys,
  `/api/health`, graceful-shutdown allowance, and secret values marked `sync: false`.
- Kept the Render root at the repository root and used `npm --prefix backend` commands. Render makes
  files outside a configured root unavailable, so `rootDir: backend` would break the existing sibling
  `public/` frontend.
- Moved the runtime pin from end-of-life Node 20 to Active LTS Node 24.18.0 consistently across
  `.nvmrc`, package engines, CI's version source, and Render.
- Updated the MongoDB driver from 7.2.0 to compatible 7.5.0; no direct package is now outdated.
- Added an exact install-script allowlist and strict npm policy for the native dependencies required
  by the locked tree.
- Made startup connect to MongoDB before opening the HTTP listener, bind explicitly to `0.0.0.0`,
  retain provider `PORT` handling, and emit actionable but credential-safe operational errors.
- Sanitized unexpected controller/application errors so logs contain error type/code, not messages
  that might include a URI or secret.
- Added secret-summary tests, strengthened `.gitignore`, updated CI action majors, expanded README
  deployment notes, and added the complete Render/Atlas runbook in `DEPLOYMENT.md`.

## Verification completed

All final commands used checksum-verified official Node.js 24.18.0.

| Check | Result |
| --- | --- |
| Render-equivalent `NODE_ENV=production npm --prefix backend ci` | Passed; 96 packages installed, 0 vulnerabilities |
| `npm --prefix backend test` after production-only install | Passed; 10 passed, 0 failed, 1 gated database test skipped |
| `npm audit --omit=dev` | Passed; 0 vulnerabilities |
| `npm outdated` | Passed; no outdated direct dependency reported |
| `npm ls --omit=dev --depth=0` | Passed; production dependency tree valid |
| Real server entrypoint with local memory store | Passed; bound `0.0.0.0`, health JSON and frontend loaded, API 404 remained structured |
| Production start without a session secret | Passed; failed closed with a useful configuration error |
| Failed MongoDB start with a synthetic credential | Passed; log contained the error type and guidance, not the synthetic credential |
| `render.yaml` parse and invariant checks | Passed |
| Workflow YAML parse, runtime consistency, and `git diff --check` | Passed |
| Current-tree and Git-history secret-pattern review | Passed; only intentional URI templates/test fixtures matched; no complete private URI or key found |

The live MongoDB integration test was not rerun during this deployment-preparation pass. A prior run
in this workspace did execute the gated end-to-end suite against the `music-journal` database with an
isolated UUID account and entry; sign-up, persisted sessions, idempotent entry creation, retrieval, and
logout passed, and a follow-up query confirmed the test records were removed. Because that database is
the production database rather than an explicitly designated test database, the safe deployment
procedure still requires the suite to be rerun against a separate test database when secure test
credentials are available.

## Remaining external work

- Rotate the previously exposed Atlas password and create or confirm the dedicated password user with
  `readWrite` only on `music-journal`.
- Confirm Atlas backups/alerts and choose the Render region nearest the Atlas cluster; Frankfurt is the
  reviewed Blueprint default and must be changed before service creation if inappropriate.
- Connect Render to GitHub, review the paid Starter plan, supply `MONGODB_URI` and `SESSION_SECRET`,
  create the Blueprint, and copy the service's outbound CIDRs into the Atlas IP access list.
- Redeploy after the Atlas rules become active, then complete every HTTPS, authentication, isolation,
  persistence, cookie, restart, log, and collection check in `DEPLOYMENT.md`.

Not yet verified: the Render account/Blueprint preview, actual Atlas user/network configuration, a
live HTTPS hostname, provider-managed TLS, or post-deployment behavior. These require the owner's
external account access and newly rotated secrets.
