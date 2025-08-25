export async function fetchUserPlaylists(accessToken: string) {
  const res = await fetch('https://api.spotify.com/v1/me/playlists?limit=20', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Spotify playlists error: ${res.status}`);
  return res.json();
}

export async function fetchPlaylistTracks(accessToken: string, playlistId: string) {
  const res = await fetch(`https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=50`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Spotify tracks error: ${res.status}`);
  return res.json();
}

export function pickTrackUriByKeyword(playlists: any, keyword: string): string | null {
  // Very simple stub logic: choose the first track of the first playlist whose name includes the keyword
  if (!playlists?.items?.length) return null;
  const match = playlists.items.find((p: any) => (p.name || '').toLowerCase().includes(keyword.toLowerCase()));
  const chosen = match ?? playlists.items[0];
  const firstTrack = chosen?.tracks?.items?.[0]?.track?.uri || null;
  return firstTrack ? String(firstTrack).replace('spotify:track:', '') : null;
}


