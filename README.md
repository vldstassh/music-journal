# Music Journal

Music Journal is a private mood-and-music journal with an Express 5 API, a dependency-free browser
frontend, MongoDB persistence, and server-side sessions. The production application is deployed on
Vercel from the `trunk` branch; the repository root is the Vercel project root.

## What it does

- Records a mood, intensity, song, artist, link, and note.
- Keeps an anonymous browser journal before sign-in.
- Creates private accounts and syncs each account's entries through MongoDB Atlas.
- Retries locally queued authenticated entries without duplicating them.
- Summarizes synced entries with mood distribution and intensity-over-time charts.
- Exports the currently loaded journal as JSON.
- Lets a user clear only Music Journal data cached on the current device. This signs an authenticated
  user out first and never deletes the account or synced MongoDB entries.

## Architecture

```text
app.js                         Vercel entry; default-exports the Express app and never listens
backend/createApp.js           reusable Express factory and middleware composition
backend/runtime.js             environment, MongoDB, and sessions_v2 initialization
backend/server.js              local/traditional Node listener and shutdown handling
backend/connection/            shared MongoClient and database access
backend/controllers|models|…   authenticated API implementation
backend/test/                  unit and HTTP integration tests
public/                        same-origin static frontend
vercel.json                    response security headers only
```

Root `package.json` owns the npm workspace and `app.js`; root `package-lock.json` is the only lockfile.
Install and test from the repository root. The backend package remains a private implementation
workspace and does not advertise a package `main` entry.

## Requirements

- Node.js 24 (`.nvmrc` pins the tested 24.18.0 patch; both package engines accept `24.x`)
- npm 11 or the npm bundled with the pinned Node release
- MongoDB 7-compatible local service or MongoDB Atlas

## Local setup

```sh
nvm use
npm ci
cp backend/.env.example backend/.env
```

Edit `backend/.env` and set at least:

```dotenv
MONGODB_URI=mongodb://127.0.0.1:27017
DB_NAME=music-journal-dev
SESSION_SECRET=replace-with-a-long-random-secret
```

Only `MONGODB_URI` is accepted for MongoDB connectivity. The application has no credential-pair
fallback and contains no hard-coded Atlas hostname. Do not commit `.env` files.

Start the development server:

```sh
npm run dev
```

Then open `http://localhost:3000`. For a database-free local smoke test, set
`SESSION_STORE=memory`; production ignores that setting and requires MongoDB-backed sessions.

## Root commands

| Command | Purpose |
| --- | --- |
| `npm ci` | Reproduce the complete workspace install from the root lockfile |
| `npm start` | Run the traditional Node server |
| `npm run dev` | Run the server with nodemon |
| `npm run check` | Syntax-check application and browser JavaScript |
| `npm test` | Run syntax checks and the complete default test suite |
| `npm run test:watch` | Run the Node test runner in watch mode |

CI uses exactly `npm ci` followed by `npm test` from the repository root.

## Configuration

| Variable | Required | Purpose |
| --- | --- | --- |
| `MONGODB_URI` | Yes, except local MemoryStore smoke tests | Complete MongoDB connection URI; secret in production |
| `DB_NAME` | Yes with MongoDB | Database name (`music-journal` in production) |
| `SESSION_SECRET` | Yes in production | At least 32 characters in production |
| `NODE_ENV` | Production deployment | Use `production` on Vercel |
| `PORT` | No | Traditional server port; defaults to `3000` |
| `COOKIE_SAMESITE` | No | `lax`, `strict`, or `none`; defaults to `lax` |
| `CORS_ORIGIN` | No | Comma-separated additional browser origins |
| `SESSION_STORE` | Local only | `memory` enables non-persistent development sessions |

The deployed frontend and API are same-origin. If a separate frontend is introduced, update both
`CORS_ORIGIN` and the `connect-src` policy in `backend/lib/securityHeaders.js` and `vercel.json`.

## Tests

The default command performs no live database writes:

```sh
npm test
```

The MongoDB integration test is gated. It exercises the configured runtime, a real
`connect-mongo` store in `sessions_v2`, signup, cookie authentication, session persistence and TTL
indexing, journal persistence/idempotency, generic rejected-login behavior, logout deletion, and
rejection of the old cookie. It creates UUID-scoped data and removes it afterward.

Run it only against a dedicated disposable test database:

```sh
RUN_DB_TESTS=1 \
MONGODB_URI='mongodb+srv://TEST_USER:TEST_PASSWORD@TEST_CLUSTER/' \
DB_NAME='music-journal-test' \
npm test
```

The guard requires both connection variables, always rejects `DB_NAME=music-journal`, and normally
requires the database name to contain `test`. An advanced exception exists only for an isolated,
disposable database: set `ALLOW_NON_TEST_DB_NAME` to the exact acknowledgement constant defined in
`backend/testSupport/databaseSafety.js`. Never use that override to target production.

## Security and privacy

- Passwords use bcrypt with cost 12. Signup requires eight characters; signup and login both reject
  values over bcrypt's 72 UTF-8-byte input boundary. The browser calculates bytes with
  `TextEncoder`, so multibyte passwords receive the same validation as the API.
- Login failures remain generic and do not disclose whether an email exists.
- Signup and login share a best-effort per-IP limit of 10 POST attempts per 15 minutes, respond with
  `429`, and send standard `RateLimit` and `Retry-After` headers. The in-memory counter is local to a
  warm Vercel Function instance; configure the included Vercel Hobby WAF rate-limit rule described
  in `DEPLOYMENT.md` for globally consistent edge enforcement.
- Production sessions are stored in `sessions_v2` for seven days. Cookies are `HttpOnly`, `Secure`,
  and `SameSite=Lax`; session IDs are regenerated after signup and login and destroyed on logout.
- API responses omit password hashes and mood ownership identifiers. User-scoped database queries
  enforce journal isolation.
- Express and Vercel responses share a restrictive Content Security Policy and security headers.
  HSTS is intentionally not configured until a custom-domain/HTTPS preload decision is made.
- “Clear local data” removes only this application's legacy, anonymous, per-user cache, and optional
  API-base keys. It never uses `localStorage.clear()` and never deletes server-side records.

## Dependency policy

The root lockfile is the reproducible install authority. The root `allowScripts` manifest field
records the reviewed lifecycle-script dependencies required by this tree. Current npm warns about
unreviewed scripts by default; the repository deliberately has no project `.npmrc` and does not use
the previously warning-producing project configuration on Vercel. Treat any new install-script,
integrity, engine, deprecation, or audit warning as a review failure before release.

The repository and both npm packages are private and `UNLICENSED`; no permission to redistribute is
granted.

## Deployment

Production deployment and verification instructions are in [DEPLOYMENT.md](DEPLOYMENT.md). The
resolved Vercel entry-detection incident is recorded in
[DEPLOYMENT_PROGRESS.md](DEPLOYMENT_PROGRESS.md).
