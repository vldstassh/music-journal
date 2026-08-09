# Music Journal

Music Journal is a responsive mood journal that connects each entry to a song. It works as a
browser-local journal without an account and can privately synchronize account-scoped entries
through an Express and MongoDB backend.

## Features

- Six mood categories with a 1–10 intensity scale.
- Song title, artist, optional HTTP(S) link, and journal note fields.
- Chronological history, mood filtering, aggregate statistics, and JSON export.
- Anonymous local journals that remain in the current browser.
- Authenticated journals isolated by account in browser storage and MongoDB.
- Retryable offline writes with visible sync state and idempotent server persistence.
- Session-based authentication with normalized email addresses, bcrypt password hashes, logout,
  and session rotation at sign-in.
- A single deployable service: Express serves both the API and the files in `public/`.

## Repository layout

```text
.
├── public/                  # Static HTML, CSS, configuration, and browser JavaScript
├── backend/
│   ├── connection/         # Lazy MongoDB connection lifecycle
│   ├── controllers/        # HTTP request handling
│   ├── lib/                # Shared backend validation
│   ├── middleware/         # Authentication and password helpers
│   ├── models/             # MongoDB persistence and indexes
│   ├── routes/             # Express API routes
│   ├── test/               # Node test runner suites
│   ├── app.js              # Testable Express application factory
│   └── server.js           # Environment setup and process lifecycle
└── .github/workflows/ci.yml
```

## Requirements

- Node.js 20.19 or newer (see `.nvmrc`).
- npm.
- MongoDB, either local or hosted.

## Local setup

1. Install dependencies.

   ```sh
   cd backend
   npm ci
   ```

2. Copy the environment template and edit the values.

   ```sh
   cp .env.example .env
   ```

3. Start the application.

   ```sh
   npm run dev
   ```

4. Open `http://localhost:3000`. The sign-in page is available at
   `http://localhost:3000/login.html`.

Use `npm start` instead of `npm run dev` when automatic restart is not needed.

## Configuration

| Variable | Required | Purpose |
| --- | --- | --- |
| `MONGODB_URI` | Yes | MongoDB connection string. |
| `DB_NAME` | Yes | Database containing users, moods, and sessions. |
| `SESSION_SECRET` | Production | Long random value used to sign session cookies. |
| `PORT` | No | HTTP port; defaults to `3000`. |
| `NODE_ENV` | No | Set to `production` in production. |
| `CORS_ORIGIN` | Cross-origin only | Comma-separated list of allowed frontend origins. |
| `COOKIE_SAMESITE` | No | `lax`, `strict`, or `none`; defaults to the safer `lax` value. |
| `SESSION_STORE` | Local checks only | Set to `memory` to start without the persistent session store outside production. |

`DB_USER` and `DB_PASSWORD` remain supported for the original Atlas cluster configuration, but
`MONGODB_URI` is preferred because it does not couple the application to one provider or cluster.

For a frontend hosted on another origin, set `CORS_ORIGIN` on the server and set the API base URL
before loading the browser scripts:

```js
window.MUSIC_JOURNAL_API_BASE = "https://api.example.com";
```

`public/config.js` is the deployment-time location for that value. A developer can also set
`localStorage.musicJournalApiBase` temporarily in the browser.

## Data and synchronization behavior

Anonymous and authenticated journals intentionally use separate local-storage keys. Signing in
does not silently upload anonymous entries or merge one browser user's cache into another account.
This avoids cross-account journal disclosure on a shared device.

Entries created while a signed-in account is temporarily offline are marked as waiting to sync.
The browser retries when it returns online or becomes visible. Every client entry has an idempotency
key, and the backend enforces one entry per account and client key, so a retry cannot create a
duplicate entry.

Existing data from the former global `musicJournalEntries` key is migrated once to the anonymous
journal. It remains available locally and is included in exports.

## API

All request and response bodies use JSON unless a response has no content. Authenticated endpoints
use the `music-journal.sid` HTTP-only cookie.

| Method | Path | Authentication | Description |
| --- | --- | --- | --- |
| `GET` | `/api/health` | No | Liveness response: `{ "status": "ok" }`. |
| `POST` | `/api/signup` | No | Create an account and establish a session. |
| `POST` | `/api/login` | No | Establish a new, rotated session. |
| `POST` | `/api/logout` | No | Destroy the current session. |
| `GET` | `/api/user` | Yes | Return the current user's ID and email. |
| `GET` | `/api/moods` | Yes | Return `{ "data": [...] }` for the current account. |
| `POST` | `/api/moods` | Yes | Validate and idempotently create a journal entry. |

Sign-up and login accept `email` and `password`. New passwords must contain at least 8 characters
and no more than 72 UTF-8 bytes, matching bcrypt's safe input boundary.
Mood creation accepts:

- `mood`: one of `Joyful`, `Calm`, `Focused`, `Anxious`, `Sad`, or `Angry`.
- `intensity`: an integer from 1 through 10.
- `songTitle`: required, at most 200 characters.
- `artist`: optional, at most 200 characters.
- `songLink`: optional valid HTTP(S) URL.
- `note`: optional, at most 5,000 characters.
- `clientId`: optional retry/idempotency key generated by the browser.

Errors use a consistent `{ "error": "Human-readable message" }` shape. Unexpected database and
server errors are logged server-side without exposing internal details to clients.

## Quality checks

Run the complete local verification from `backend/`:

```sh
npm test
```

This command syntax-checks every server and browser JavaScript file, then runs validation and HTTP
integration tests with Node's built-in test runner. The integration tests use an in-memory session
store and do not require MongoDB. CI runs the same command for pull requests and pushes to `trunk`.

The MongoDB integration suite is gated to avoid changing a developer database accidentally. It
creates isolated records, verifies signup, sessions, idempotent mood creation, retrieval, and logout,
then removes its records:

```sh
RUN_DB_TESTS=1 MONGODB_URI='mongodb://127.0.0.1:27017' DB_NAME='music-journal' \
  node --test test/database.integration.test.js
```

For rapid test development:

```sh
npm run test:watch
```

## Deployment notes

- Run the service from `backend/` with `npm start`; Express serves `public/` from the repository
  root and never exposes backend files.
- The session-store upgrade uses the `sessions_v2` collection. Existing sessions from older
  deployments are intentionally invalidated once; users will need to sign in again.
- Use HTTPS in production. Production cookies are secure by default.
- Use a long, unique `SESSION_SECRET` and a least-privileged MongoDB account.
- Configure `CORS_ORIGIN` only when the frontend is genuinely deployed separately.
- For a genuinely cross-site frontend, use HTTPS and explicitly set `COOKIE_SAMESITE=none`.
- Do not use `SESSION_STORE=memory` in production; it is explicitly ignored there.
- The health endpoint does not query MongoDB, so it reports HTTP-process liveness rather than
  database readiness.

## Development workflow

The repository uses trunk-based development. Branch short-lived work from `trunk`, keep changes
focused, run `npm test`, and integrate back into `trunk` through the repository's normal review
process.
