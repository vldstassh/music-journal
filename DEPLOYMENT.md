# Production deployment on Vercel

Music Journal deploys as one zero-configuration Express application on Vercel Hobby, with static
files from `public/` and MongoDB Atlas for accounts, journal entries, and `sessions_v2`. Production
has already deployed successfully with the Vercel project **Root Directory set to the repository
root**.

## Repository contract

- `app.js` is the only Vercel Express entry. It directly imports Express, awaits the configured
  runtime, default-exports the application, and never calls `listen()` or registers signal handlers.
- `backend/createApp.js` is the reusable application factory.
- `backend/runtime.js` validates environment state and creates the Mongo session store.
- `backend/server.js` is the only traditional listener and is used by `npm start`.
- `public/` contains the same-origin frontend.
- `vercel.json` contains headers only. It has no routes, rewrites, builds, functions, framework, or
  output configuration.
- Root `package.json` and root `package-lock.json` own the npm workspace and deployment install.

Do not set Vercel's Root Directory to `backend`; that removes the intended `app.js`, root package
metadata, lockfile, `public/`, and `vercel.json` from the build context.

## Atlas preparation

Use a dedicated Atlas database user with only `readWrite` on `music-journal`. Use a generated,
unique password, retain the complete SRV URI only in Vercel's encrypted environment settings, and
rotate any credential that has appeared in chat, logs, screenshots, or source history.

Vercel Hobby does not provide fixed outbound addresses. If Atlas connectivity requires the broad
`0.0.0.0/0` network rule, compensate with the least-privileged dedicated user, strong credentials,
TLS, Atlas alerts, and prompt rotation. Do not copy an unofficial static Vercel IP list. A future
fixed-egress requirement needs a different hosting/networking decision.

## Vercel project settings

Import the GitHub repository and confirm:

| Setting | Value |
| --- | --- |
| Plan | Hobby, for eligible personal/non-commercial use |
| Production branch | `trunk` |
| Framework preset | Express |
| Root Directory | `./` (repository root) |
| Node.js version | 24.x |
| Install command | `npm ci` |
| Build command | Default; no override |
| Output directory | Default; no override |

The native Git integration should deploy `trunk`; CI separately runs the root install and tests. Do
not put Vercel deployment tokens or production secrets in GitHub Actions.

## Production environment

Set these variables for **Production** only:

| Name | Value | Sensitive |
| --- | --- | --- |
| `NODE_ENV` | `production` | No |
| `DB_NAME` | `music-journal` | No |
| `COOKIE_SAMESITE` | `lax` | No |
| `MONGODB_URI` | Complete dedicated Atlas SRV URI | Yes |
| `SESSION_SECRET` | Output of `openssl rand -hex 32` | Yes |

Leave `PORT`, `CORS_ORIGIN`, and `SESSION_STORE` unset for the same-origin production deployment.
Environment changes affect new deployments only. Preview deployments should receive separate test
database credentials or fail closed; never point arbitrary preview branches at production Atlas.

## Authentication rate limiting

The application immediately provides a combined login/signup safeguard: 10 POST attempts per IP per
15 minutes, standard rate-limit headers, and a JSON `429` response. Its memory store is intentionally
described as best-effort because separate or recycled Functions do not share counters.

Vercel Hobby currently includes one globally enforced WAF rate-limit rule per project and up to one
million allowed requests per month. Configure that native rule in **Project > Firewall > Configure**:

1. Match request method `POST` and request path “is any of” `/api/login`, `/api/signup`.
2. Select **Rate Limit**, fixed window, key by IP.
3. Use 10 requests per 10 minutes (the Hobby maximum window is 10 minutes) and the default `429`
   action.
4. Observe the rule in log mode first if the dashboard permits, then publish it and verify both auth
   paths without affecting `/api/health`, `/api/user`, or `/api/moods`.

The WAF rule is live project state, not repository routing. It is intentionally absent from the
headers-only `vercel.json` and was not changed during the local cleanup pass.

## Runtime and security behavior

- A module-scoped `MongoClient` and connection promise are reused within each warm Function. The
  pool has a zero minimum, a maximum of ten, and a 60-second idle timeout.
- Models and `connect-mongo` share that client. Sessions use `sessions_v2`, a seven-day TTL, and
  production `HttpOnly`, `Secure`, `SameSite=Lax` cookies.
- Production refuses a missing/short session secret, missing database configuration, and an
  in-memory session-store request.
- `GET /api/health` is a database-independent liveness endpoint returning `{"status":"ok"}`.
- Vercel and Express apply the same CSP, framing, MIME-sniffing, opener, referrer, and permissions
  policies. HSTS is deliberately omitted pending a custom-domain and HTTPS-preload decision.
- `MONGODB_URI` is the only connection input. No legacy username/password synthesis or hard-coded
  cluster hostname remains.

## Release verification

Before pushing a release candidate, use Node 24 from `.nvmrc` and run from the repository root:

```sh
npm ci
npm test
npm ls
npm ls express
git diff --check
```

Run the gated database integration only with `music-journal-test` or another isolated test database,
following `README.md`. Never run it against `music-journal`.

After Vercel deploys, replace `YOUR-PROJECT` and verify:

```sh
curl --fail --silent --show-error https://YOUR-PROJECT.vercel.app/api/health
curl --fail --silent --show-error --output /dev/null https://YOUR-PROJECT.vercel.app/
curl --fail --silent --show-error --output /dev/null https://YOUR-PROJECT.vercel.app/login.html
```

Then verify in a browser and Atlas:

1. Static HTML, CSS, and JavaScript load without CSP, mixed-content, or console errors.
2. Signup, `/api/user`, logout, login, and the 72-byte password boundary behave correctly.
3. A journal entry persists after refresh and a later cold request; two accounts remain isolated.
4. `music-journal.sid` is `HttpOnly`, `Secure`, and `SameSite=Lax`.
5. `sessions_v2` contains authenticated sessions and has a TTL index on `expires`; logout removes the
   relevant session and the old cookie receives `401`.
6. Repeated login/signup attempts receive standard rate-limit headers and eventually `429`; the WAF
   traffic view confirms edge enforcement.
7. “Clear local data” removes the device cache and signs out but leaves the account and synced entries
   available after signing in again.
8. Responses, delivered browser files, Vercel logs, and Git history expose no URI, password, secret,
   cookie value, or internal exception detail.

Users whose sessions were stored before the intentional `sessions_v2` migration must sign in once;
account and journal data remain intact.

## Recovery

Promote the last known-good Vercel deployment or revert the faulty `trunk` commit. A code rollback
does not roll back MongoDB, and this release introduces no destructive schema migration. Do not
delete collections during rollback. Rotate Atlas credentials or `SESSION_SECRET` immediately after
suspected exposure, then create a fresh deployment.

## Official references

- [Express on Vercel](https://vercel.com/docs/frameworks/backend/express)
- [Vercel project configuration](https://vercel.com/docs/project-configuration/vercel-json)
- [Vercel WAF rate limiting](https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting)
- [Vercel Hobby plan](https://vercel.com/docs/plans/hobby)
- [Vercel environment variables](https://vercel.com/docs/environment-variables)
- [Vercel Node.js versions](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions)
- [Atlas database users](https://www.mongodb.com/docs/atlas/security-add-mongodb-users/)
- [Atlas IP access lists](https://www.mongodb.com/docs/atlas/security/ip-access-list/)
- [MongoDB Node.js connection pools](https://www.mongodb.com/docs/drivers/node/current/connect/connection-options/connection-pools/)
