import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import fetch from 'cross-fetch';

admin.initializeApp();
const db = admin.firestore();

export const saveSpotifyTokens = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }
  const { accessToken, refreshToken, expiresIn, scope, tokenType, issuedAt } = data || {};
  if (!accessToken) {
    throw new functions.https.HttpsError('invalid-argument', 'accessToken required');
  }
  const uid = context.auth.uid;
  await db.collection('users').doc(uid).set({
    spotify: {
      accessToken,
      refreshToken: refreshToken || null,
      expiresIn: expiresIn || null,
      scope: scope || null,
      tokenType: tokenType || 'Bearer',
      issuedAt: issuedAt || Date.now(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
  }, { merge: true });
  return { ok: true };
});

export const refreshSpotifyToken = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }
  const { clientId, clientSecret } = data || {};
  if (!clientId || !clientSecret) {
    throw new functions.https.HttpsError('invalid-argument', 'clientId and clientSecret required');
  }
  const uid = context.auth.uid;
  const userSnap = await db.collection('users').doc(uid).get();
  const refreshToken = userSnap.get('spotify.refreshToken');
  if (!refreshToken) {
    throw new functions.https.HttpsError('failed-precondition', 'No refresh token stored');
  }
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
  });
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new functions.https.HttpsError('unknown', `Spotify refresh failed: ${res.status} ${text}`);
  }
  const json = await res.json();
  await db.collection('users').doc(uid).set({
    spotify: {
      accessToken: json.access_token,
      expiresIn: json.expires_in,
      scope: json.scope,
      tokenType: json.token_type,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
  }, { merge: true });
  return { ok: true, accessToken: json.access_token };
});
