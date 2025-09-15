import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ensureAccessToken } from "@/lib/spotify";

export const runtime = "nodejs";

// ---------- helpers ----------
function clamp01(x: number) {
  return Math.max(0, Math.min(1, x));
}
function centerPref(x: number) {
  return clamp01(1 - Math.abs(x - 0.5) * 2);
}
type Mode = "hype" | "focus" | "chill";

async function readJSON(r: Response) {
  const t = await r.text().catch(() => "");
  try {
    return JSON.parse(t);
  } catch {
    return null;
  }
}

function range(list: any[], key: string) {
  const vals = list
    .map((f) => f?.[key] ?? null)
    .filter((v: any) => typeof v === "number" && !Number.isNaN(v));
  if (!vals.length) return { min: 0, max: 1 };
  return { min: Math.min(...vals), max: Math.max(...vals) };
}
function minmax(v: number | undefined, min: number, max: number) {
  if (v == null || Number.isNaN(v)) return 0.5; // neutral center
  if (max <= min) return 0.5;
  return (v - min) / (max - min);
}

function scoreTrackNorm(fN: any, mode: Mode) {
  const { energyN, danceN, valenceN, tempoN, acousticN, instrN, speechN } = fN;

  if (mode === "hype") {
    // big energy/dance, faster tempo, brighter mood
    return 0.5 * energyN + 0.2 * danceN + 0.2 * tempoN + 0.1 * valenceN;
  }
  if (mode === "focus") {
    // instrumental, low speech; aim for mid energy/tempo to avoid hype & sleep
    return (
      0.5 * instrN +
      0.25 * (1 - speechN) +
      0.15 * centerPref(energyN) +
      0.1 * centerPref(tempoN)
    );
  }
  // chill: low energy/tempo, acoustic texture, pleasant valence
  return (
    0.45 * (1 - energyN) +
    0.25 * acousticN +
    0.2 * (1 - tempoN) +
    0.1 * valenceN
  );
}

// tie-breakers when two scores are nearly equal
function tieBreak(a: any, b: any, mode: Mode) {
  const eps = 1e-3;
  if (mode === "hype") {
    const d1 = b.featuresN.energyN - a.featuresN.energyN;
    if (Math.abs(d1) > eps) return d1;
    const d2 = b.featuresN.tempoN - a.featuresN.tempoN;
    if (Math.abs(d2) > eps) return d2;
    const d3 = b.featuresN.danceN - a.featuresN.danceN;
    if (Math.abs(d3) > eps) return d3;
  } else if (mode === "focus") {
    const d1 = b.featuresN.instrN - a.featuresN.instrN;
    if (Math.abs(d1) > eps) return d1;
    const d2 = 1 - b.featuresN.speechN - (1 - a.featuresN.speechN);
    if (Math.abs(d2) > eps) return d2;
    const d3 =
      centerPref(b.featuresN.energyN) - centerPref(a.featuresN.energyN);
    if (Math.abs(d3) > eps) return d3;
  } else {
    const d1 = 1 - b.featuresN.energyN - (1 - a.featuresN.energyN);
    if (Math.abs(d1) > eps) return d1;
    const d2 = b.featuresN.acousticN - a.featuresN.acousticN;
    if (Math.abs(d2) > eps) return d2;
    const d3 = b.featuresN.valenceN - a.featuresN.valenceN;
    if (Math.abs(d3) > eps) return d3;
  }
  return a.name.localeCompare(b.name); // stable deterministic
}

// ---------- spotify fetchers ----------
async function fetchOnRepeatTracks(headers: Record<string, string>) {
  try {
    let url: string | null = "https://api.spotify.com/v1/me/playlists?limit=50";
    const all: any[] = [];
    for (let i = 0; i < 4 && url; i++) {
      const r = await fetch(url, { headers, cache: "no-store" });
      if (!r.ok) return [];
      const j = await readJSON(r);
      all.push(...(j?.items ?? []));
      url = j?.next ?? null;
    }
    const onRepeat = all.find(
      (p: any) => p?.name === "On Repeat" && p?.owner?.id === "spotify",
    );
    if (!onRepeat?.id) return [];
    let tracks: any[] = [];
    let tUrl: string | null =
      `https://api.spotify.com/v1/playlists/${onRepeat.id}/tracks?limit=100`;
    for (let i = 0; i < 4 && tUrl; i++) {
      const r = await fetch(tUrl, { headers, cache: "no-store" });
      if (!r.ok) break;
      const j = await readJSON(r);
      tracks = tracks.concat(
        (j?.items ?? []).map((x: any) => x?.track).filter(Boolean),
      );
      tUrl = j?.next ?? null;
    }
    return tracks.slice(0, 20);
  } catch {
    return [];
  }
}

async function fetchTopTracksShortTerm(headers: Record<string, string>) {
  const r = await fetch(
    "https://api.spotify.com/v1/me/top/tracks?time_range=short_term&limit=20",
    { headers, cache: "no-store" },
  );
  if (!r.ok) return [];
  const j = await readJSON(r);
  return j?.items ?? [];
}

// ---------- route ----------
export async function GET(req: Request) {
  const url = new URL(req.url);
  const modeParam = (url.searchParams.get("mode") ?? "none").toLowerCase();
  const debug = url.searchParams.get("debug") === "1";
  const mode: Mode | null = (["hype", "focus", "chill"] as const).includes(
    modeParam as Mode,
  )
    ? (modeParam as Mode)
    : null;

  const cookie = cookies().get("spotify_tokens")?.value;
  if (!cookie)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let tokens = JSON.parse(cookie);
  tokens = await ensureAccessToken(tokens);
  cookies().set({
    name: "spotify_tokens",
    value: JSON.stringify(tokens),
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 7 * 24 * 3600,
  });

  const headers = { Authorization: `Bearer ${tokens.access_token}` };

  // get items
  let items: any[] = await fetchOnRepeatTracks(headers);
  if (!items.length) items = await fetchTopTracksShortTerm(headers);
  if (!items.length) {
    return NextResponse.json(
      {
        error: "no_tracks",
        message:
          "Grant playlist-read-private and/or user-top-read; also ensure you have listening history.",
      },
      { status: 200 },
    );
  }

  // audio-features
  const trackIds = items.map((t: any) => t?.id).filter(Boolean);
  const afRes = trackIds.length
    ? await fetch(
        `https://api.spotify.com/v1/audio-features?ids=${trackIds.join(",")}`,
        { headers, cache: "no-store" },
      )
    : null;
  const afJson =
    afRes && afRes.ok ? await readJSON(afRes) : { audio_features: [] };
  const featuresList: any[] = afJson?.audio_features ?? [];

  // build normalization ranges over THIS set
  const R = {
    energy: range(featuresList, "energy"),
    danceability: range(featuresList, "danceability"),
    valence: range(featuresList, "valence"),
    tempo: range(featuresList, "tempo"),
    acousticness: range(featuresList, "acousticness"),
    instrumentalness: range(featuresList, "instrumentalness"),
    speechiness: range(featuresList, "speechiness"),
  };

  const fById = new Map<string, any>();
  for (const f of featuresList) if (f?.id) fById.set(f.id, f);

  // stats (raw, just for display)
  const n = featuresList.length || 1;
  const stats = {
    valence_avg:
      featuresList.reduce((s, f: any) => s + (f?.valence ?? 0), 0) / n,
    energy_avg: featuresList.reduce((s, f: any) => s + (f?.energy ?? 0), 0) / n,
    danceability_avg:
      featuresList.reduce((s, f: any) => s + (f?.danceability ?? 0), 0) / n,
    tempo_avg: featuresList.reduce((s, f: any) => s + (f?.tempo ?? 0), 0) / n,
  };

  // genres & top artists
  const artistIds = Array.from(
    new Set(
      items
        .flatMap((t: any) => (t?.artists ?? []).map((a: any) => a?.id))
        .filter(Boolean),
    ),
  );
  let top_genres: string[] = [];
  if (artistIds.length) {
    const counts: Record<string, number> = {};
    for (let i = 0; i < artistIds.length; i += 50) {
      const chunk = artistIds.slice(i, i + 50);
      const r = await fetch(
        `https://api.spotify.com/v1/artists?ids=${chunk.join(",")}`,
        { headers, cache: "no-store" },
      );
      if (!r.ok) continue;
      const j = await readJSON(r);
      for (const a of j?.artists ?? [])
        for (const g of a.genres ?? []) counts[g] = (counts[g] || 0) + 1;
    }
    top_genres = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([g]) => g);
  }
  const top_artists = Array.from(
    new Set(
      items.flatMap((t: any) =>
        (t?.artists ?? []).map((a: any) => a?.name).filter(Boolean),
      ),
    ),
  ).slice(0, 5);

  // attach normalized features + scores
  const tracks = items.map((t: any) => {
    const f = fById.get(t.id) ?? {};
    const featuresN = {
      energyN: minmax(f?.energy, R.energy.min, R.energy.max),
      danceN: minmax(f?.danceability, R.danceability.min, R.danceability.max),
      valenceN: minmax(f?.valence, R.valence.min, R.valence.max),
      tempoN: minmax(f?.tempo, R.tempo.min, R.tempo.max),
      acousticN: minmax(
        f?.acousticness,
        R.acousticness.min,
        R.acousticness.max,
      ),
      instrN: minmax(
        f?.instrumentalness,
        R.instrumentalness.min,
        R.instrumentalness.max,
      ),
      speechN: minmax(f?.speechiness, R.speechiness.min, R.speechiness.max),
    };
    const scores = {
      hype: scoreTrackNorm(featuresN, "hype"),
      focus: scoreTrackNorm(featuresN, "focus"),
      chill: scoreTrackNorm(featuresN, "chill"),
    };
    return {
      id: t?.id,
      name: t?.name,
      artists: (t?.artists ?? []).map((a: any) => a?.name),
      image: t?.album?.images?.[0]?.url,
      featuresN,
      scores,
      hasFeatures: !!f?.id,
    };
  });

  // sort by mode with tie-breakers; push tracks with missing features to end
  let sorted = tracks.slice();
  if (mode) {
    sorted.sort((a, b) => {
      // if either missing features, de-prioritize
      if (a.hasFeatures !== b.hasFeatures) return a.hasFeatures ? -1 : 1;
      const d = b.scores[mode] - a.scores[mode];
      if (Math.abs(d) > 1e-3) return d;
      return tieBreak(a, b, mode);
    });
  }

  // examples for your page
  const examples = items.slice(0, 3).map((t: any) => ({
    name: t?.name,
    artist: t?.artists?.[0]?.name ?? "Unknown",
    genres: [] as string[],
  }));

  // optional debug: top 5 per mode w/ scores
  const debugOut = debug
    ? {
        hype: sorted
          .slice(0, 5)
          .map((t) => ({ name: t.name, score: t.scores.hype.toFixed(3) })),
        focus: sorted
          .slice(0, 5)
          .map((t) => ({ name: t.name, score: t.scores.focus.toFixed(3) })),
        chill: sorted
          .slice(0, 5)
          .map((t) => ({ name: t.name, score: t.scores.chill.toFixed(3) })),
      }
    : undefined;

  return NextResponse.json({
    mode: mode ?? "none",
    stats,
    top_artists,
    top_genres,
    examples,
    tracks: sorted, // contains scores + normalized features
    debug: debugOut,
  });
}
