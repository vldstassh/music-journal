# Vercel Hobby deployment

Music Journal is prepared for one personal, non-commercial Vercel Hobby project backed by MongoDB
Atlas. Vercel serves `public/` from its CDN and runs the root `app.js` Express entry as one Function,
so the frontend and API share the same HTTPS origin.

Render was replaced to provide the requested straightforward free Hobby workflow without instance,
shutdown-delay, health-check, or paid-plan configuration. No Docker image, paid add-on, or separate
frontend project is required.

## Before importing the repository

1. Treat every MongoDB password previously pasted into chat, logs, screenshots, or another
   non-secret channel as invalid. Rotate it before deployment.
2. In Atlas, open **Security > Database Access** and create a dedicated password user for this
   application. Give it only the built-in `readWrite` role on the `music-journal` database. Do not
   grant `atlasAdmin`, `readWriteAnyDatabase`, or another administrative role.
3. Copy the Atlas application connection string. Its general form is:

   ```text
   mongodb+srv://USERNAME:PASSWORD@music-journal.85gqdwy.mongodb.net/?appName=music-journal
   ```

   URL-encode special characters in the password. Do not save the completed URI in this repository.
4. Generate a unique session secret locally:

   ```sh
   openssl rand -hex 32
   ```

   Keep the output only in the Vercel Production environment. Changing it later signs every user
   out but does not remove accounts or journal entries.
5. Confirm the Atlas cluster's backup and alerting choices are suitable for the journal data. Those
   controls depend on the Atlas tier and are not supplied by Vercel.

Atlas database users and Atlas website users are different. The application user needs narrowly
scoped data access, not permission to administer the Atlas project.

## Atlas Network Access for Vercel Hobby

Ordinary Vercel deployments use dynamic outbound addresses. Fixed outbound addresses are paid
Vercel features and are intentionally not used here. Atlas must therefore accept connections from
the dynamic Vercel fleet for this Hobby deployment:

1. In Atlas, open the project containing the cluster.
2. Open **Security > Network Access > IP Access List**.
3. Choose **Add IP Address**, then **Allow Access from Anywhere**.
4. Confirm the entry is exactly `0.0.0.0/0`, add a comment such as
   `Vercel Hobby dynamic outbound`, and save it.
5. Wait until Atlas marks the entry active. After the Vercel deployment is verified, remove any
   obsolete provider-specific access-list entries.

`0.0.0.0/0` allows a network connection attempt from any IPv4 address; it does not bypass MongoDB
authentication. This is a real reduction in network-layer restriction, so compensate with a long,
unique password, the dedicated user, `readWrite` only on `music-journal`, prompt credential rotation,
and Atlas alerts. Do not fabricate or copy a static Vercel IP range. If tighter network allowlisting
becomes mandatory, Vercel Hobby is no longer the appropriate hosting constraint; do not silently
enable a paid networking feature.

## Import into Vercel

1. Push the reviewed deployment commit to `trunk`.
2. Sign in to Vercel with GitHub under a personal Hobby account.
3. Choose **Add New > Project** and import `vldstassh/music-journal`.
4. Before selecting **Deploy**, confirm these fields:

   | Vercel field | Required setting |
   | --- | --- |
   | Plan | Hobby |
   | Project name | `music-journal` (or another available free name) |
   | Framework Preset | Express |
   | Root Directory | `./` / repository root |
   | Node.js Version | 24.x |
   | Install Command | Override with `npm ci` |
   | Build Command | Default; no custom command |
   | Output Directory | Default; no override |

   The repository root is required: it contains the Vercel `app.js`, root workspace lockfile, and
   the sibling `public/` directory. Do not set the root to `backend`.
5. Under the import screen's **Environment Variables**, add the Production values in the next
   section. Select only **Production** for each value.
6. Select **Deploy**. Vercel should detect `app.js` as the Express entry and `public/` as static
   content. The repository intentionally has no `vercel.json`; current Express routing needs no
   custom rewrite.
7. After import, open **Project > Settings > Environments > Production > Branch Tracking**, set the
   production branch to `trunk`, and save. Commits pushed to `trunk` then create Production
   deployments; other branches create Preview deployments.

Do not add Vercel deployment tokens or deployment secrets to GitHub Actions. The native GitHub
integration handles deployments after pushes; the existing workflow remains responsible for tests.

## Production environment variables

In **Project > Settings > Environment Variables**, enter exactly the following and scope each one to
**Production** only:

| Name | Production value | Sensitive |
| --- | --- | --- |
| `NODE_ENV` | `production` | No |
| `DB_NAME` | `music-journal` | No |
| `COOKIE_SAMESITE` | `lax` | No |
| `MONGODB_URI` | Complete dedicated Atlas SRV URI | Yes |
| `SESSION_SECRET` | Output of `openssl rand -hex 32` | Yes |

Leave `PORT`, `CORS_ORIGIN`, and `SESSION_STORE` unset. Vercel supplies request handling rather than a
long-running port; frontend and API are same-origin; and production must use MongoDB-backed sessions.
Never place the secret values in `vercel.json`, `.env.example`, frontend files, build commands, logs,
documentation, or Git history. Environment-variable changes affect only new deployments, so redeploy
after rotating a value.

Production database credentials are deliberately unavailable to Preview deployments. Preview static
pages may load, but their API will fail closed because `MONGODB_URI`, `DB_NAME`, and `SESSION_SECRET`
are absent. If live Preview API testing is later required, create a separate non-production Atlas
database and least-privileged user, then add separate Preview-only values. Never point arbitrary
Preview branches at the production database.

## Runtime behavior

- Root `app.js` initializes the existing application and exports it without `listen()` or signal
  handlers. Vercel converts it into one Express Function.
- `backend/server.js` remains the local or traditional-process entry used by `npm start`; only that
  entry binds a port and handles `SIGINT`/`SIGTERM`.
- `public/` continues to provide `/`, `/login.html`, and the existing CSS and JavaScript. Vercel
  serves matching files from its CDN. Express's existing static middleware remains useful locally
  and is ignored by Vercel.
- All other requests, including `/api/*`, reach the exported Express application without custom
  rewrites.
- Each cold Function instance creates one module-scoped `MongoClient`; warm requests reuse its
  cached connection promise. The client is not closed after a request. A later cold instance safely
  creates its own connection. The pool keeps a zero minimum, caps application connections at ten,
  and retires idle connections after 60 seconds to suit a low-traffic function workload.
- The same client backs models and `connect-mongo`. Sessions remain in `sessions_v2` with a seven-day
  TTL. Production cookies remain `HttpOnly`, `Secure`, and `SameSite=Lax`.
- Application correctness does not depend on in-memory state. Accounts, entries, and sessions are
  stored in Atlas and therefore survive warm-instance replacement and cold starts.
- `GET /api/health` remains an unauthenticated liveness response of `{"status":"ok"}`. Its handler
  does not perform a database query.

## Post-deployment verification

Replace `YOUR-PROJECT` below with the assigned hostname, then complete every check:

1. Verify health and static routes over HTTPS:

   ```sh
   curl --fail --silent --show-error https://YOUR-PROJECT.vercel.app/api/health
   # {"status":"ok"}

   curl --fail --silent --show-error --output /dev/null \
     https://YOUR-PROJECT.vercel.app/
   curl --fail --silent --show-error --output /dev/null \
     https://YOUR-PROJECT.vercel.app/login.html
   ```

2. In a browser, confirm `/`, `/login.html`, CSS, and JavaScript load without mixed-content, CORS,
   or console errors.
3. Sign up, call `/api/user` while authenticated, log out, and log back in.
4. Create a journal entry, refresh, wait long enough for later requests to reach another warm/cold
   instance, and confirm the entry persists.
5. Use two intended accounts and confirm user A cannot see user B's entries.
6. In browser network/storage tools, confirm `music-journal.sid` is `HttpOnly`, `Secure`, and
   `SameSite=Lax`.
7. In Atlas, verify that `users`, `moods`, and `sessions_v2` exist and that the session collection has
   its expiry index. Do not edit or delete unrelated production data.
8. Inspect browser-delivered files, error responses, and Vercel logs. Confirm no MongoDB URI,
   password, session secret, or internal error detail appears.
9. Trigger a new request after a period of inactivity and repeat login, `/api/user`, and entry
   retrieval to exercise cold-start behavior.

Users with sessions from the older session collection will need to sign in once. That intentional
one-time invalidation does not affect their account or journal data.

## Hobby limits, recovery, and rollback

Vercel Hobby is for personal, non-commercial use and has fixed free usage limits. This project does
not configure paid overages or paid add-ons. If usage exceeds the Hobby allowance, Vercel can pause
or restrict service until usage resets; it should not be treated as an always-on commercial SLA.

If a deployment is faulty, use the Vercel Deployments view to promote/restore the last known-good
deployment or revert the faulty Git commit on `trunk`. A code rollback does not roll back MongoDB
data. The application currently has no destructive schema migration, so do not delete collections as
part of a rollback. Rotate the Atlas password or `SESSION_SECRET` immediately if either may have been
exposed, then create a fresh deployment.

## Official references

- [Express on Vercel](https://vercel.com/docs/frameworks/backend/express)
- [Vercel Git deployments and production branches](https://vercel.com/docs/git)
- [Vercel environment variables](https://vercel.com/docs/environment-variables)
- [Vercel Node.js versions](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions)
- [Vercel deployment IP allowlisting](https://vercel.com/kb/guide/how-to-allowlist-deployment-ip-address)
- [Vercel Hobby plan](https://vercel.com/docs/plans/hobby)
- [Atlas database users](https://www.mongodb.com/docs/atlas/security-add-mongodb-users/)
- [Atlas built-in database roles](https://www.mongodb.com/docs/manual/reference/built-in-roles/)
- [Atlas IP access lists](https://www.mongodb.com/docs/atlas/security/ip-access-list/)
- [MongoDB Node.js connection pools](https://www.mongodb.com/docs/drivers/node/current/connect/connection-options/connection-pools/)
