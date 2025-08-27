## Underscore (Expo)

This app connects to Spotify via OAuth, listens for keywords (future), and opens Spotify to play a track.

### Setup

- Create a Spotify app in the Spotify Developer Dashboard and add a redirect URL:
  - `underscore://redirect`
- Put your Client ID in `App.tsx` (`SPOTIFY_CLIENT_ID`).
- iOS bundle id is `com.underscore.app` in `app.json`.

### Firebase setup

1) Create a Firebase project and enable Email/Password in Authentication.
2) Create a Firestore database in production or test mode.
3) Copy your web config into `src/firebase.ts` (replace placeholders).
4) (Optional) Update Firestore rules to restrict reads/writes to the current user document.

Sign-in/Sign-up are implemented using Firebase Authentication. After connecting Spotify, a minimal token snapshot is stored in Firestore under `users/{uid}/spotify` (see `App.tsx`). Avoid storing long-lived access tokens unencrypted in production.

### AI inference (OpenAI)

- Set the OpenAI key as a Firebase Functions secret and deploy:
```bash
cd ../functions
firebase functions:secrets:set OPENAI_API_KEY
npm run build && firebase deploy --only functions
```
- The client calls `classifyUtterance` → returns `{ mood, query, tags }`.
- We search Spotify with the `query` and play a result.

### Running

```bash
npm run ios
```

### Background speech recognition

On iOS, true continuous background speech recognition for third-party apps is constrained by platform policies. Expo and React Native do not provide a permitted, always-on speech recognizer while the app is closed. A typical approach is:

- Use a short foreground session with `expo-speech`/native Speech APIs while the app is active.
- Schedule background audio or push-triggered tasks to reopen the app.
- Rely on user-initiated activation (widget, Siri Shortcut, or background audio session)

We mark background keyword detection as a future native module integration. Today, this app focuses on Spotify OAuth and deep linking to playback in the Spotify app.

### Notes

- We request microphone permission and enable iOS background `audio` mode in `app.json`.
- To actually play in the background without user interaction via Spotify, a server-side integration (Spotify Connect) is required; here we open the Spotify client with a track deeplink.

### Next steps

- Add native/background speech module or Siri Shortcut integration.
- Persist chosen keyword list and map to playlists.
- Add UI for playlist selection and keyword configuration.

## Backend (Firebase Functions)

We include callable functions in `functions/` for securely handling Spotify tokens:

- `saveSpotifyTokens`: store access/refresh token snapshot server-side under `users/{uid}.spotify`.
- `refreshSpotifyToken`: exchange refresh token for a new access token.

Setup:

1) Install Firebase CLI and login.
```bash
npm i -g firebase-tools
firebase login
```

2) Initialize project (once). If already initialized, set the default project.
```bash
cd functions
npm run build
```

3) Configure Spotify Client Secret as a Firebase secret or env variable. Recommended: use Firebase secrets.
```bash
firebase functions:secrets:set SPOTIFY_CLIENT_SECRET
```

4) Deploy functions:
```bash
firebase deploy --only functions
```

Client wiring:
- After user completes Spotify OAuth in the app, we call `saveSpotifyTokens` (see `App.tsx`).
- To refresh, call `refreshSpotifyToken` with your `clientId`. Server reads `SPOTIFY_CLIENT_SECRET`.


