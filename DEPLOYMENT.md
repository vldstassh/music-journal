# Production deployment

This repository is prepared as one Render web service backed by MongoDB Atlas. Express serves the
frontend and API from one origin, so production does not need a separate static-site service or a
cross-origin browser configuration.

Render is the deployment target because its native Node runtime, GitHub integration, health checks,
managed HTTPS, rollback support, and Blueprint configuration fit the existing application without a
container or architectural rewrite. The committed [`render.yaml`](render.yaml) is the source of truth
for the service settings.

The runtime is pinned consistently to Node 24.18.0 in `.nvmrc`, `package.json`, CI, and the Blueprint.
Node 24 is the current Active LTS line; the former Node 20 pin is no longer suitable because that line
has reached end-of-life and no longer receives security fixes.

## Before creating the service

1. In Atlas, rotate any database password that has ever appeared in chat, a terminal transcript, a
   screenshot, or another non-secret channel. Do not reuse it for production.
2. Create a dedicated Atlas **database user** for this application. Grant only the built-in
   `readWrite` role on the `music-journal` database and, if the project contains unrelated clusters,
   restrict the user to the intended cluster. Do not grant `atlasAdmin` or `readWriteAnyDatabase`.
3. Copy an Atlas `mongodb+srv://` application connection string for that user. URL-encode special
   characters in its password and confirm it targets `music-journal.85gqdwy.mongodb.net`. Store the
   URI only in Render's secret environment settings.
4. Confirm Atlas backups and operational alerts meet the data-recovery requirements for the chosen
   cluster tier.
5. Review the Blueprint's `region: frankfurt` before initial creation. Frankfurt is the selected
   European default; use the region nearest both the users and the Atlas cluster. Render cannot move
   an existing service between regions, so change this value before the first deployment if needed.
6. Review Render's current Starter instance pricing. `plan: starter` is intentionally a paid
   production baseline and avoids the availability limitations of a free instance.

Atlas database users are distinct from Atlas control-plane users. The application user needs data
access, not permission to administer the Atlas project.

## Create the Render service

1. In Render, choose **New > Blueprint** and connect the GitHub repository
   `vldstassh/music-journal`.
2. Keep the Blueprint path as `render.yaml` and review the proposed `music-journal` web service.
3. Supply the two prompted secret values:

   - `MONGODB_URI`: the dedicated Atlas user's complete SRV connection string.
   - `SESSION_SECRET`: a unique cryptographically random value of at least 32 characters. For
     example, generate one locally with `openssl rand -hex 32` and paste only its output into
     Render.

4. Confirm the resulting settings against this table before accepting the Blueprint:

   | Setting | Required value |
   | --- | --- |
   | Branch | `trunk` |
   | Runtime | Node |
   | Root directory | blank / repository root |
   | Build command | `npm --prefix backend ci` |
   | Start command | `npm --prefix backend start` |
   | Health check path | `/api/health` |
   | Auto-deploy | After CI Checks Pass |
   | Instance type | Starter or larger |

   The root directory must remain blank. Render excludes files outside a configured root directory
   at build time and runtime; setting it to `backend` would omit the sibling `public/` directory that
   Express serves.

5. Create the service. The first start can fail until Atlas permits the new service's outbound
   addresses; this is expected and is safer than opening Atlas to the entire internet.

## Environment variables

The Blueprint sets all non-secret values and prompts for secrets. The final Render environment must
contain:

| Variable | Secret | Production value |
| --- | --- | --- |
| `MONGODB_URI` | Yes | Dedicated Atlas application-user SRV URI |
| `SESSION_SECRET` | Yes | Unique random value, at least 32 characters |
| `DB_NAME` | No | `music-journal` |
| `NODE_ENV` | No | `production` |
| `NODE_VERSION` | No | `24.18.0` |
| `COOKIE_SAMESITE` | No | `lax` |

Do not set `PORT`; Render supplies it. Do not set `SESSION_STORE=memory`; production always uses the
MongoDB-backed `sessions_v2` store. Do not set `CORS_ORIGIN` for this single-origin deployment.
Never place real values in `render.yaml`, `.env.example`, frontend files, Git history, build commands,
or documentation.

## Permit Render in Atlas

After Render creates the service:

1. Open the service, choose **Connect > Outbound**, and copy every listed CIDR range.
2. In Atlas, open **Security > Network Access > Add IP Address** and add each Render CIDR with a
   descriptive comment such as `music-journal Render Frankfurt`.
3. Do not add `0.0.0.0/0`. Render may use any address in its region's shared outbound ranges, so all
   listed ranges are required. For tighter isolation, a Render Pro-or-higher workspace can use
   dedicated outbound IPs; allowlist those fixed addresses instead.
4. Once Atlas reports the entries active, use **Manual Deploy > Deploy latest commit** in Render if
   the initial deployment failed.
5. Recheck Atlas Network Access after changing the Render region or enabling dedicated outbound IPs.

Network allowlisting and database authentication are separate controls; both must succeed.

## HTTPS and cookies

Render provides and renews TLS certificates for the service's `onrender.com` hostname and for verified
custom domains, and redirects HTTP traffic to HTTPS. The application trusts one Render proxy hop and
sets production session cookies as `Secure`, `HttpOnly`, and `SameSite=Lax`.

For a custom domain, add it under **Settings > Custom Domains**, apply the DNS records Render shows,
wait for verification and certificate issuance, then verify the HTTPS URL. Keep `COOKIE_SAMESITE=lax`
for this single-origin design. A future genuinely cross-site frontend would require an explicit
`CORS_ORIGIN`, HTTPS on both origins, and `COOKIE_SAMESITE=none`.

## Post-deployment verification

Perform these checks after the deploy is marked live:

1. Confirm process liveness and the exact response:

   ```sh
   curl --fail --silent --show-error https://YOUR-SERVICE.onrender.com/api/health
   # {"status":"ok"}
   ```

2. Load the HTTPS root page and `/login.html`; confirm CSS and JavaScript assets return successfully
   and browser developer tools show no mixed-content or CORS errors.
3. Create or use an intended production account. Confirm sign-up succeeds, authenticated
   `GET /api/user` returns that account, logout succeeds, and login succeeds again.
4. Add one journal entry, reload the page, and confirm the same entry is loaded from MongoDB. Use a
   second intended account to confirm accounts cannot see each other's entries.
5. In browser storage/network tools, confirm the session cookie is named `music-journal.sid` and has
   `Secure`, `HttpOnly`, and `SameSite=Lax`. Confirm no credential or database URI appears in any
   browser-delivered file or response.
6. Restart the service from Render. The existing session should remain valid because
   it is stored in MongoDB, and the journal entry must still be present.
7. Review Render logs for the non-sensitive startup messages `MongoDB connection established` and
   `Music Journal listening on 0.0.0.0:<port>`. Logs intentionally report error types rather than
   exception messages that might contain secrets.
8. In Atlas, verify the `users`, `moods`, and `sessions_v2` collections and expected indexes exist,
   without editing or deleting unrelated production records.
9. Expect cookies from any deployment that used the older session collection to be invalid. This
   one-time sign-out does not remove accounts or journal entries.

`/api/health` is deliberately a lightweight HTTP-process liveness check. It does not query MongoDB on
every probe, so a short database interruption does not create a health-check restart loop. Initial
startup does verify the database connection before opening the HTTP listener.

## Rollback and recovery

If a new release fails its health check, Render keeps the previous healthy deployment serving traffic.
For an issue found after traffic switches:

1. Open **Deploys**, select the last known-good successful deploy, choose **Rollback**, and confirm.
2. Render disables automatic deploys after a dashboard rollback. Leave them disabled while diagnosing.
3. Remember that a code rollback does not undo MongoDB data. This application currently has no
   destructive schema migrations; do not manually delete collections as part of a rollback.
4. Revert or fix the faulty change on `trunk`, run `npm ci`, `npm test`, and the smoke checks, then push
   the corrective commit.
5. Re-enable **After CI Checks Pass** only after the corrected deployment is healthy.

If credentials may have been exposed, rotate the Atlas password and/or `SESSION_SECRET` in Render and
redeploy. Rotating `SESSION_SECRET` signs every user out. Changing from the older session collection to
`sessions_v2` likewise requires existing users to sign in once again.

## Official references

- [Render Blueprint specification](https://render.com/docs/blueprint-spec)
- [Render monorepo and root-directory behavior](https://render.com/docs/monorepo-support)
- [Render outbound IP addresses](https://render.com/docs/outbound-ip-addresses)
- [Render health checks](https://render.com/docs/health-checks)
- [Render TLS certificates](https://render.com/docs/tls)
- [Render rollbacks](https://render.com/docs/rollbacks)
- [Node.js release status](https://nodejs.org/en/about/previous-releases)
- [Atlas database users](https://www.mongodb.com/docs/atlas/security-add-mongodb-users/)
- [Atlas IP access lists](https://www.mongodb.com/docs/atlas/security/ip-access-list/)
