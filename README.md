# Music Journal

Music Journal is a mood-based journaling app where users record how they feel and connect that
mood to a song. Over time, each entry builds a personal emotional playlist and a timeline of mood
patterns.

## Project Goals

- Help users track emotions in a creative, low-friction way.
- Connect daily moods with music choices.
- Show a visual history of emotional patterns over time.
- Support private journal entries through backend storage and authentication.

## Frontend

The root of this repository contains a static HTML/CSS/JS interface for the main journal experience:

- Basic `login.html` page for login and signup, redirecting to `index.html` after successful authentication.
- Mood selection with visual options and an intensity slider.
- Song title, artist, optional link, and journal note fields.
- Timeline history, mood filtering, summary stats, export, and local offline storage.
- Responsive layout for quick daily entries on desktop and mobile.
- Optional sync with the mood API at `/api/moods` when the backend is available from the same origin.

Open `login.html` to start with login, or open `index.html` directly to use the local journal view.

If the backend runs on a different origin, set the API base URL in the browser console before
reloading, or update `config.js` before deployment:

```js
localStorage.musicJournalApiBase = "http://localhost:3000";
```

```js
window.MUSIC_JOURNAL_API_BASE = "https://your-api.example";
```

## Backend

The `backend` directory contains a Node.js Express server for authentication and journal entries.
It uses MongoDB Atlas for users, mood entries, and persistent sessions.

### Backend Development

Install dependencies and run checks from the backend directory:

```sh
cd backend
npm install
npm test
```

Copy `backend/.env.example` to `backend/.env` for local development, then set the real values.

Deployment environment variables:

- `DB_USER`: MongoDB Atlas username.
- `DB_PASSWORD`: MongoDB Atlas password.
- `DB_NAME`: MongoDB database name.
- `SESSION_SECRET`: Secret used to sign session cookies.
- `PORT`: Server port. Optional locally; defaults to `3000`.
- `CORS_ORIGIN`: Frontend origin for cross-origin deployments. Use a comma-separated list for multiple origins.
- `COOKIE_SAMESITE`: Optional cookie SameSite value. Defaults to `none` in production and `lax` locally.

Run the backend:

```sh
npm start
```

For a local startup smoke test without MongoDB sessions, use:

```sh
SESSION_STORE=memory DB_USER=placeholder DB_PASSWORD=placeholder DB_NAME=placeholder npm start
```

The backend exposes these endpoints:

- `POST /api/signup` with `email` and `password`.
- `POST /api/login` with `email` and `password`.
- `GET /api/user` for the logged-in user's profile.
- `GET /api/moods` for the logged-in user's entries.
- `POST /api/moods` with `mood`, `songTitle`, optional `artist`, `songLink`, `intensity`, and `note`.
- `GET /api/health` for deployment health checks.
