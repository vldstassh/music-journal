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

## Backend

The `back-end` branch contains a node.js Express server for handling user authentication and music journal entries:

- User signup and login with session management using cookies.
- API endpoints for creating and retrieving journal entries.
- Full connection to MongoDB atlas for storing user accounts and journal entries, with Mongodb native driver.

# How to use the backend for development:
- In order to retrive and create journal entries, you need to be logged in. You can use the signup and login endpoints to create an account and log in.

- Endpoint: `http://localhost:3000/api/signup`
- To signup, send a POST request with JSON body containing:
```json
{
    "username": "your username",
    "password": "your password"
}
```

- Endpoint: `http://localhost:3000/api/login`
- To login, send a POST request with JSON body containing:
```json
{
    "username": "your username",
    "password": "your password"
}
```
- After successful login the server will set a cookie in the browser to maintain the session. If you shut down the server, the cookie will be cleared and you will need to log in again to access the journal entry endpoints.

- Enpoint: `http://localhost:3000/api/moods` 
- To create a new journal entry (requires login), send a POST request with JSON body containing:
```json
{
    "mood": "joy",
    "songTitle": "song title",
    "artist": "artist",
    "note": "test note"
}
```

- To retrieve all journal entries for the logged-in user, send a GET request to the same endpoint at `http://localhost:3000/api/moods`.
