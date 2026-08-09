# Deployment migration progress

Status as of 2026-08-10: the internal-factory filename collision was corrected, but the following
Vercel build still selected the backend workspace metadata instead of the root Express application.
The repository-side package-ownership correction is prepared and remains uncommitted and unpushed;
production must be redeployed after review.

## Production entry-point incident

The production runtime reported:

```text
Invalid export found in module "/var/task/backend/app.js".
The default export must be a function or server.
FUNCTION_INVOCATION_FAILED
```

The root cause was an Express auto-detection filename collision. Root `app.js` was the correct
Vercel entry and already default-exported the configured Express application, but the internal
`backend/app.js` factory used another recognized entry filename and exported only the named
`createApp()` function. Vercel detected that internal module and rejected it.

The factory is now `backend/createApp.js`; every runtime and test import plus the syntax-check script
uses that path. It remains a named factory export rather than acquiring a fake default application.
Root `app.js` remains the sole Vercel entry and still does not call `listen()`. `backend/runtime.js`
still initializes configuration, MongoDB, and sessions, while `backend/server.js` remains the local
listener.

The same fix removes two nonfatal build warnings:

- Both package manifests now accept `node: 24.x`, so a Vercel-managed Node 24 patch such as 24.15.0
  no longer conflicts with an unnecessary backend minimum of 24.18.0. `.nvmrc` still pins 24.18.0
  for repeatable local and CI validation.
- The root and backend `.npmrc` files containing unsupported project-level
  `strict-allow-scripts`/`allow-scripts` settings were removed. The reviewed install-script
  approvals remain in the root `package.json` `allowScripts` field.

The next Vercel build then reported:

```text
No entrypoint found which imports express. Found possible entrypoint: server.js
```

The backend workspace still advertised `server.js` through its package `main` field, while the root
package neither advertised `app.js` nor directly declared the `express` dependency imported by that
file. The root package now sets `main: app.js` and directly depends on the same Express version as the
backend. The backend `main: server.js` field was removed; its unchanged `start: node server.js` script
continues to provide the local/traditional server. This makes the repository root the unambiguous
owner of the zero-configuration Vercel Express entry without adding `vercel.json`.

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
- Kept the testable factory in `backend/createApp.js` and environment validation plus MongoDB
  session-store creation in `backend/runtime.js` so
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
  remains triggered for pull requests and pushes to `trunk`; `.nvmrc` pins its Node 24 patch while
  both package engines allow `24.x`.
- Added runtime contract tests for production session-secret validation, persistent-store
  enforcement, the `sessions_v2` name, and the seven-day TTL.
- Kept reviewed install-script approvals in the root package manifest without npm project settings
  that the Vercel build reports as unknown.

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
| Root `npm ci` (Vercel/CI install path) | Passed; 124 packages installed with no `EBADENGINE` or unknown project-config warning |
| `npm --prefix backend test` | Passed; 13 passed, 0 failed, 1 gated database test skipped |
| Root `npm test` workspace alias | Passed with the same 13/0/1 result |
| Explicit syntax checks for `app.js`, `backend/createApp.js`, `backend/runtime.js`, and `backend/server.js` | Passed |
| Entry-name/export scan | Passed; root `app.js` imports Express and default-exports without `listen()`, factory has no default export, and `backend/app.js` is absent |
| `git diff --check` | Passed |
| Runtime production-secret and persistent-session invariants | Passed |
| Existing health, static frontend, API error, CORS, logging, and validation tests | Passed |

The live MongoDB integration suite was not run during this migration because no dedicated test
database was supplied, and destructive or write-oriented checks against production were explicitly
out of scope. A prior workspace run exercised an isolated UUID account and entry against the
`music-journal` database, passed signup/session/idempotency/retrieval/logout checks, and confirmed
cleanup; that historical result is not a substitute for a fresh Vercel deployment test.

## Remaining manual work

1. Review, commit, and push this correction to `trunk`.
2. Allow Vercel's Git integration to create a new Production deployment, or redeploy the resulting
   commit from the Vercel Deployments view.
3. Confirm the build no longer reports `EBADENGINE` or unknown npm project configuration warnings.
4. Confirm the runtime no longer reports an invalid export for `backend/app.js`.
5. Run the HTTPS health, authentication, account-isolation, persistence, cold-start, session-cookie,
   Atlas collection, browser exposure, and log checks in `DEPLOYMENT.md`.

Not yet verified: Vercel's build output for this correction, the new production Function runtime, or
the post-redeploy live checks. These require pushing the reviewed commit and observing the external
deployment. The Vercel CLI has not been linked or used to download any production configuration or
secrets.
