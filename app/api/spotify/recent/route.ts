import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ensureAccessToken } from "@/lib/spotify";

export const runtime = "nodejs";

async function fetchOnRepeatTracks(headers: Record<string, string>) {
  // Try to find the user's "On Repeat" playlist (owned by Spotify).
  // Requires: playlist-read-private
  try {
    let url = "https://api.spotify.com/v1/me/playlists?limit=50";
    const allPlaylists: any[] = [];

    // paginate through user playlists (up to a few pages)
    for (let i = 0; i < 4 && url; i++) {
      const r = await fetch(url, { headers });
      if (!r.ok) break;
      const j = await r.json();
      allPlaylists.push(...(j.items ?? []));
      url = j.next ?? null;
    }

    const onRepeat = allPlaylists.find(
      (p: any) => p?.name === "On Repeat" && p?.owner?.id === "spotify"
    );
    if (!onRepeat?.id) return [];

    // Fetch tracks from the playlist (map to track objects)
    let tracks: any[] = [];
    let tUrl = `https://api.spotify.com/v1/playlists/${onRepeat.id}/tracks?limit=100`;
    for (let i = 0; i < 4 && tUrl; i++) {
      const t = await fetch(tUrl, { headers });
      if (!t.ok) break;
      const tj = await t.json();
      tracks = tracks.concat(
        (tj.items ?? [])
          .map((x: any) => x?.track)
          .filter(Boolean)
      );
      tUrl = tj.next ?? null;
    }

    // Keep first 20 to match prior behavior
    return tracks.slice(0, 20);
  } catch {
    return [];
  }
}

async function fetchTopTracksShortTerm(headers: Record<string, string>) {
  // Approximation of "On Repeat" over the last ~4 weeks.
  // Requires: user-top-read
  const r = await fetch(
    "https://api.spotify.com/v1/me/top/tracks?time_range=short_term&limit=20",
    { headers }
  );
  if (!r.ok) return [];
  const j = await r.json();
  // /me/top/tracks returns track objects directly
  return (j.items ?? []);
}

export async function GET() {
  const cookie = cookies().get("spotify_tokens")?.value;
  if (!cookie) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let tokens = JSON.parse(cookie);
  tokens = await ensureAccessToken(tokens);
  cookies().set({
    name: "spotify_tokens",
    value: JSON.stringify(tokens),
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 7 * 24 * 3600
  });

  const headers = { Authorization: `Bearer ${tokens.access_token}` };

  // Prefer "On Repeat"; fallback to short-term Top Tracks
  let items: any[] = await fetchOnRepeatTracks(headers);
  if (items.length === 0) {
    items = await fetchTopTracksShortTerm(headers);
  }

  // If still empty, return early with a helpful error
  if (items.length === 0) {
    return NextResponse.json(
      { error: "no_tracks", message: "Grant playlist-read-private and/or user-top-read and ensure you have listening history." },
      { status: 200 }
    );
  }

  const trackIds = items.map((t: any) => t?.id).filter(Boolean);
  const artistIds = Array.from(
    new Set(
      items.flatMap((t: any) => (t?.artists ?? []).map((a: any) => a?.id)).filter(Boolean)
    )
  );

  // audio features
  let stats = { valence_avg: 0, energy_avg: 0, danceability_avg: 0, tempo_avg: 0 };
  let features: any[] = [];
  if (trackIds.length) {
    const af = await fetch(
      `https://api.spotify.com/v1/audio-features?ids=${trackIds.join(",")}`,
      { headers }
    );
    if (af.ok) {
      const afJson = await af.json();
      features = afJson.audio_features ?? [];
      const n = features.length || 1;
      stats = {
        valence_avg: features.reduce((s: any, f: any) => s + (f?.valence ?? 0), 0) / n,
        energy_avg: features.reduce((s: any, f: any) => s + (f?.energy ?? 0), 0) / n,
        danceability_avg: features.reduce((s: any, f: any) => s + (f?.danceability ?? 0), 0) / n,
        tempo_avg: features.reduce((s: any, f: any) => s + (f?.tempo ?? 0), 0) / n
      };
    }
  }

  // artist genres
  let top_genres: string[] = [];
  if (artistIds.length) {
    const chunks: string[][] = [];
    for (let i = 0; i < artistIds.length; i += 50) chunks.push(artistIds.slice(i, i + 50));
    const genreCounts: Record<string, number> = {};
    for (const chunk of chunks) {
      const ar = await fetch(`https://api.spotify.com/v1/artists?ids=${chunk.join(",")}`, { headers });
      if (!ar.ok) continue;
      const arJson = await ar.json();
      for (const a of arJson.artists ?? []) {
        for (const g of a.genres ?? []) genreCounts[g] = (genreCounts[g] || 0) + 1;
      }
    }
    top_genres = Object.entries(genreCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([g]) => g);
  }

  const top_artists = Array.from(
    new Set(items.flatMap((t: any) => (t?.artists ?? []).map((a: any) => a?.name).filter(Boolean)))
  ).slice(0, 5);

  const examples = items.slice(0, 3).map((t: any) => ({
    name: t?.name,
    artist: t?.artists?.[0]?.name ?? "Unknown",
    genres: [] as string[]
  }));

  return NextResponse.json({
    stats,
    top_artists,
    top_genres,
    examples,
    tracks: items.map((t: any) => ({
      id: t?.id,
      name: t?.name,
      artists: (t?.artists ?? []).map((a: any) => a?.name),
      image: t?.album?.images?.[0]?.url
    }))
  });
}
