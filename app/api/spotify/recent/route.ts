import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ensureAccessToken } from "@/lib/spotify";
import {
  clamp01,
  minmax,
  norm,
  range,
  scoreTrackNorm,
  tieBreak,
} from "@/app/utils/scoring";
import { Mood } from "@/app/types/mood";
import { recentQuery } from "@/lib/validation";

export const runtime = "nodejs";

type SourceParam = "auto" | "on_repeat" | "top" | "recent" | "repeat_derived";

async function readJSON(r: Response) {
  const t = await r.text().catch(() => "");
  try {
    return JSON.parse(t);
  } catch {
    return null;
  }
}

// ---------- spotify fetchers ----------
async function fetchRecentlyPlayedWithStats(headers: Record<string, string>) {
  const pages = 3; // ~150 plays
  const all: any[] = [];
  let url: string | null =
    "https://api.spotify.com/v1/me/player/recently-played?limit=50";
  for (let i = 0; i < pages && url; i++) {
    const r = await fetch(url, { headers, cache: "no-store" });
    if (!r.ok) break;
    const j = await r.json();
    const items = (j?.items ?? [])
      .map((x: any) => x?.track)
      .filter((t: any) => t && t.type === "track" && typeof t.id === "string");
    all.push(...items);
    const last = (j?.items ?? [])[(j?.items?.length ?? 0) - 1]?.played_at;
    url = last
      ? `https://api.spotify.com/v1/me/player/recently-played?limit=50&before=${encodeURIComponent(last)}`
      : null;
  }
  // per-track stats
  // count (how many times in the window)
  // recency (exponentially decayed, so fresh listens matter more)
  const stats = new Map<string, { count: number; recency: number }>();
  for (let i = 0; i < all.length; i++) {
    const t = all[i];
    const w = Math.pow(0.98, i); // decay by recency
    const cur = stats.get(t.id) ?? { count: 0, recency: 0 };
    cur.count += 1;
    cur.recency += w;
    stats.set(t.id, cur);
  }

  // distinct tracks in the order they appeared most recently
  const seen = new Set<string>();
  const distinct = all
    .filter((t) => !seen.has(t.id) && seen.add(t.id))
    .slice(0, 50);

  return { tracks: distinct, rpStatsById: stats };
}

// TODO: needs work, not reliable as "made for you" playlist may not show up in /playlist
// on repeat - only works if user has followed "On Repeat" playlist
async function fetchOnRepeatTracks(
  headers: Record<string, string>,
  startOffset: number = 0,
) {
  try {
    let url: string | null =
      `https://api.spotify.com/v1/me/playlists?limit=50&offset=${Math.max(0, startOffset)}`;
    const all: any[] = [];
    for (let i = 0; i < 4 && url; i++) {
      const r = await fetch(url, { headers, cache: "no-store" });
      if (!r.ok) return [];
      const j = await readJSON(r);
      all.push(...(j?.items ?? []));
      url = j?.next ?? null;
    }

    const onRepeat = all.find((p: any) =>
      /\bon\s*repeat\b/i.test(p?.name ?? ""),
    );
    // const onRepeat = '37i9dQZF1Eprcdla8LfTWX';
    if (!onRepeat?.id) return [];
    let tracks: any[] = [];
    let tUrl: string | null =
      `https://api.spotify.com/v1/playlists/${onRepeat.id}/tracks?limit=100`;
    for (let i = 0; i < 4 && tUrl; i++) {
      const r = await fetch(tUrl, { headers, cache: "no-store" });
      if (!r.ok) break;
      const j = await readJSON(r);
      tracks = tracks.concat(
        (j?.items ?? [])
          .map((x: any) => x?.track)
          .filter(
            (t: any) => t && t.type === "track" && typeof t.id === "string",
          ),
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
  // validate params
  const params = Object.fromEntries(new URL(req.url).searchParams);
  const parsed = recentQuery.safeParse(params);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "bad_request", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const {
    mode: modeParam, // "hype" | "focus" | "chill" | undefined
    source: sourceParam = "auto", // "auto" | "on_repeat" | "top" | "recent" | "repeat_derived"
    pl_offset = 0,
    pl_page = 0,
    or_id: orId,
  } = parsed.data;

  const startOffset = pl_offset || pl_page * 50;
  const mode: Mood | null = modeParam ? (modeParam as Mood) : null;

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
  let items: any[] = [];
  let rpStatsById = new Map<string, { count: number; recency: number }>();
  let sourceUsed: SourceParam = sourceParam;

  if (sourceParam === "recent") {
    const { tracks, rpStatsById: map } =
      await fetchRecentlyPlayedWithStats(headers);
    items = tracks;
    rpStatsById = map;
  } else if (sourceParam === "top") {
    items = await fetchTopTracksShortTerm(headers);
  } else if (sourceParam === "on_repeat") {
    items = await fetchOnRepeatTracks(headers, startOffset);
  } else {
    // auto
    items = await fetchOnRepeatTracks(headers);
    sourceUsed = "on_repeat";
    if (!items.length) {
      items = await fetchTopTracksShortTerm(headers);
      sourceUsed = "top";
    }
    if (!items.length) {
      const r = await fetchRecentlyPlayedWithStats(headers);
      items = r.tracks;
      rpStatsById = r.rpStatsById;
      sourceUsed = "recent";
    }
  }

  // audio-features - endpoint removed by Spotify
  // derive mood scores by stats instead
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
  const featuresCount = (featuresList ?? []).filter(Boolean).length;
  const scoringMode = featuresCount > 0 ? "spotify_features" : "derived_recent";

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

    // did we actually get features for this track?
    const hasFeatures = typeof f?.id === "string";

    // recently-played stats (built earlier when source === "recent")
    const rp = rpStatsById.get(t.id) ?? { count: 0, recency: 0 };

    // simple metadata proxies
    const popularity = typeof t?.popularity === "number" ? t.popularity : 50;
    const popN = popularity / 100;
    const durationMin = (t?.duration_ms ?? 180000) / 60000;
    const durMid = 1 - Math.min(1, Math.abs(durationMin - 3.5) / 3.5); // best ~3.5m

    // derived scores (non-zero even when audio-features are 0 or blocked)
    const derived = {
      // Hype: recent + popular
      hype: clamp01(0.5 * norm(rp.recency, 0, 3) + 0.5 * popN),
      // Focus: mid-length + repeated a bit
      focus: clamp01(0.6 * durMid + 0.4 * norm(rp.count, 0, 4)),
      // Chill: less “hitty” + ok with longer songs
      chill: clamp01(
        0.5 * (1 - popN) +
          0.5 * norm(4.5 - Math.abs(durationMin - 4.5), 0, 4.5),
      ),
    };

    const scores = hasFeatures
      ? {
          hype: scoreTrackNorm(featuresN, Mood.HYPE),
          focus: scoreTrackNorm(featuresN, Mood.FOCUS),
          chill: scoreTrackNorm(featuresN, Mood.CHILL),
        }
      : derived;

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
  const sorted = tracks.slice();
  if (mode) {
    sorted.sort((a, b) => {
      // if either missing features, de-prioritize
      if (a.hasFeatures !== b.hasFeatures) return a.hasFeatures ? -1 : 1;
      const d = b.scores[mode] - a.scores[mode];
      if (Math.abs(d) > 1e-3) return d;
      return tieBreak(a, b, mode);
    });
  }

  return NextResponse.json({
    source: sourceUsed,
    scoring_mode: scoringMode,
    mode: mode ?? "none",
    stats,
    top_artists,
    top_genres,
    tracks: sorted, // contains scores + normalized features
    on_repeat_id: orId || null,
  });
}
