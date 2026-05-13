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

The `front-end` branch contains a static HTML/CSS/JS interface for the main journal experience:

- Mood selection with visual options and an intensity slider.
- Song title, artist, optional link, and journal note fields.
- Timeline history, mood filtering, summary stats, export, and local offline storage.
- Responsive layout for quick daily entries on desktop and mobile.
- Optional sync with the mood API at `/api/moods` when the backend is available from the same origin.

Open `index.html` in a browser to run the frontend.

If the backend runs on a different origin, set the API base URL in the browser console before
reloading:

```js
localStorage.musicJournalApiBase = "http://localhost:3000";
```

## Planned Backend Support

The backend is expected to handle:

- User signup and login.
- Private journal entries.
- Mood, song, note, and timestamp storage.
- API endpoints for creating and reading mood entries.
