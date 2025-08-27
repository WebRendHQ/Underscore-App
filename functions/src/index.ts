import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import fetch from 'cross-fetch';
import OpenAI from 'openai';

admin.initializeApp();
const db = admin.firestore();

export const saveSpotifyTokens = onCall(async (request) => {
  const auth = request.auth;
  if (!auth) {
    throw new HttpsError('unauthenticated', 'Must be authenticated');
  }
  const { accessToken, refreshToken, expiresIn, scope, tokenType, issuedAt } = request.data || {};
  if (!accessToken) {
    throw new HttpsError('invalid-argument', 'accessToken required');
  }
  const uid = auth.uid;
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

export const refreshSpotifyToken = onCall(async (request) => {
  const auth = request.auth;
  if (!auth) {
    throw new HttpsError('unauthenticated', 'Must be authenticated');
  }
  const { clientId } = request.data || {};
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new HttpsError('failed-precondition', 'Missing clientId or SPOTIFY_CLIENT_SECRET');
  }
  const uid = auth.uid;
  const userSnap = await db.collection('users').doc(uid).get();
  const refreshToken = userSnap.get('spotify.refreshToken');
  if (!refreshToken) {
    throw new HttpsError('failed-precondition', 'No refresh token stored');
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
    throw new HttpsError('unknown', `Spotify refresh failed: ${res.status} ${text}`);
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

export const classifyUtterance = onCall(async (request) => {
  const auth = request.auth;
  if (!auth) {
    throw new HttpsError('unauthenticated', 'Must be authenticated');
  }
  const { text } = request.data || {};
  if (!text || typeof text !== 'string') {
    throw new HttpsError('invalid-argument', 'text required');
  }
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    // Fallback to simple rules if secret not set
    const lower = text.toLowerCase();
    let mood = 'neutral';
    if (/(stress|anxious|panic|overwhelmed|anymore)/.test(lower)) mood = 'stress';
    if (/(happy|excited|celebrate|party)/.test(lower)) mood = 'happy';
    if (/(sad|down|blue|cry)/.test(lower)) mood = 'sad';
    if (/(focus|study|work|concentrate)/.test(lower)) mood = 'focus';
    const query = mood === 'stress' ? 'dark opera' : mood;
    return { mood, query, tags: [mood] };
  }
  const openai = new OpenAI({ apiKey });
  const system = `You classify short utterances into music moods and propose a search query.
Return strict JSON: {"mood":"one of: stress|happy|sad|focus|calm|angry|energetic|romantic|neutral","query":"short search query for Spotify","tags":["tag1","tag2"]}`;
  const user = `Utterance: ${text}`;
  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user }
    ],
    temperature: 0.2,
  });
  const content = completion.choices?.[0]?.message?.content || '';
  try {
    const parsed = JSON.parse(content);
    return parsed;
  } catch {
    return { mood: 'neutral', query: 'chill', tags: ['neutral'] };
  }
});
