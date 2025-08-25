## Backend (Serverless) Overview

### Do I need a server?

- You don’t need a traditional server you manage. You do need a backend.
- We use Firebase Cloud Functions (serverless) to securely handle Spotify tokens and any sensitive logic.

### Why a backend is needed

- Store Spotify refresh tokens and client secret securely (never ship in the app).
- Refresh access tokens server-side.
- Keep user token data in Firestore tied to Firebase Auth users.
- Centralize future sensitive logic.

### What’s included

- `functions/src/index.ts` with callable functions:
  - `saveSpotifyTokens`: stores token snapshot under `users/{uid}.spotify`.
  - `refreshSpotifyToken`: exchanges a stored refresh token for a new access token.
- App calls `saveSpotifyTokens` in `underscore/App.tsx` after OAuth.

### One-time setup

1) Add your Firebase web config to `underscore/src/firebase.ts`.
2) Set your Spotify client ID in `underscore/App.tsx`.
3) Install Firebase CLI and login:
```bash
npm i -g firebase-tools
firebase login
```
4) Build and deploy functions, and set the Spotify client secret as a Functions secret:
```bash
cd functions
npm run build
firebase functions:secrets:set SPOTIFY_CLIENT_SECRET
firebase deploy --only functions
```

### Client wiring

- After completing Spotify OAuth, the app invokes `saveSpotifyTokens` (see `underscore/App.tsx`).
- To refresh tokens later, call the callable `refreshSpotifyToken` with your `clientId`. The server reads `SPOTIFY_CLIENT_SECRET` from secrets.

### Files to know

- `functions/src/index.ts`: Cloud Functions entry
- `underscore/App.tsx`: calls `saveSpotifyTokens` after OAuth
- `underscore/src/firebase.ts`: Firebase config (replace placeholders)
- `underscore/README.md`: extra steps and notes

### Security notes

- Don’t store long-lived access/refresh tokens or client secrets in the app.
- Use Firebase Functions secrets for `SPOTIFY_CLIENT_SECRET`.
- Consider rotating credentials and restricting Firestore rules to `users/{uid}`.


