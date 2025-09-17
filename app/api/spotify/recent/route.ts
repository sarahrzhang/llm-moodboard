import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ensureAccessToken } from "@/lib/spotify";
import { Mood } from "@/app/types/mood";
import { scoreTrackNorm, tieBreak, scorePlays } from "@/app/utils/scoring";
import { getAppToken } from "@/app/utils/tokens";

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

// ---------- spotify fetchers ----------
// fetch last ~150 plays (3 pages) and rank repeated tracks
async function fetchDerivedOnRepeat(headers: Record<string, string>) {
  const out: any[] = [];
  let url: string | null =
    "https://api.spotify.com/v1/me/player/recently-played?limit=50";
  for (let i = 0; i < 3 && url; i++) {
    const r = await fetch(url, { headers, cache: "no-store" });
    if (!r.ok) break;
    const j = await r.json();
    out.push(...(j?.items ?? []));
    const last = out[out.length - 1]?.played_at;
    url = last
      ? `https://api.spotify.com/v1/me/player/recently-played?limit=50&before=${encodeURIComponent(last)}`
      : null;
  }

  // group by track.id; keep only real tracks
  const buckets = new Map<string, { track: any; plays: any[] }>();
  for (const it of out) {
    const t = it?.track;
    if (!t || t.type !== "track" || typeof t.id !== "string") continue;
    const b = buckets.get(t.id) ?? { track: t, plays: [] as any[] };
    b.plays.push(it);
    buckets.set(t.id, b);
  }

  // score and rank
  const scored = [...buckets.values()]
    .map((b) => ({ track: b.track, score: scorePlays(b.plays) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 20)
    .map((x) => x.track);

  return scored; // array of track objects just like playlist items’ .track
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
    // const onRepeat = all.find(
    //   (p: any) => p?.name === "On Repeat" && p?.owner?.id === "spotify",
    // );
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

// fallback - most recent 20 songs
async function fetchTopTracksShortTerm(headers: Record<string, string>) {
  const r = await fetch(
    "https://api.spotify.com/v1/me/top/tracks?time_range=short_term&limit=20",
    { headers, cache: "no-store" },
  );
  if (!r.ok) return [];
  const j = await readJSON(r);
  return j?.items ?? [];
}

async function fetchRecentlyPlayed(headers: Record<string, string>) {
  // returns up to 20 distinct tracks from last ~50 plays
  const r = await fetch(
    "https://api.spotify.com/v1/me/player/recently-played?limit=50",
    { headers, cache: "no-store" },
  );
  if (!r.ok) return [];
  const j = await r.json();
  const items = (j?.items ?? [])
    .map((x: any) => x?.track)
    .filter((t: any) => t && t.type === "track" && typeof t.id === "string");
  return items.slice(0, 20);
}

// ---------- route ----------
export async function GET(req: Request) {
  const url = new URL(req.url);
  const modeParam = (url.searchParams.get("mode") ?? "none").toLowerCase();
  const sourceParam = (url.searchParams.get("source") ?? "auto") as SourceParam;
  // offset helper (for playlist paging; 0-based)
  const plOffset = Number(url.searchParams.get("pl_offset") ?? "0") || 0;
  // page helper — 1 page = 50 playlists)
  const plPage = Number(url.searchParams.get("pl_page") ?? "0") || 0;
  const startOffset = plOffset || plPage * 50;
  const debug = url.searchParams.get("debug") === "1";
  const mode: Mood | null = (["hype", "focus", "chill"] as const).includes(
    modeParam as Mood,
  )
    ? (modeParam as Mood)
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
  // let items: any[] = await fetchOnRepeatTracks(headers);
  // console.log(`Fetch from On Repeat ${items}`);
  // if (!items.length) items = await fetchTopTracksShortTerm(headers);
  // if (!items.length) {
  //   return NextResponse.json(
  //     {
  //       error: "no_tracks",
  //       message:
  //         "Grant playlist-read-private and/or user-top-read; also ensure you have listening history.",
  //     },
  //     { status: 200 },
  //   );
  // }

  // --- choose source dataset ---
  let items: any[] = [];
  let sourceUsed: SourceParam = sourceParam;

  if (sourceParam === "on_repeat") {
    items = await fetchOnRepeatTracks(headers, startOffset);
  } else if (sourceParam === "repeat_derived") {
    items = await fetchDerivedOnRepeat(headers);
  } else if (sourceParam === "top") {
    items = await fetchTopTracksShortTerm(headers);
  } else if (sourceParam === "recent") {
    items = await fetchRecentlyPlayed(headers);
  } else {
    // auto: try On Repeat → Top Tracks → Recently Played
    items = await fetchOnRepeatTracks(headers);
    sourceUsed = "on_repeat";
    if (!items.length) {
      items = await fetchTopTracksShortTerm(headers);
      sourceUsed = "top";
    }
    if (!items.length) {
      items = await fetchRecentlyPlayed(headers);
      sourceUsed = "recent";
    }
  }
  const playable = items.filter(
    (t: any) => t && t.id && (t.type ?? "track") === "track",
  );

  if (!items.length) {
    return NextResponse.json(
      { error: "no_tracks", message: "No tracks available." },
      { status: 200 },
    );
  }

  // audio-features
  const trackIds = playable.map((t: any) => t.id);
  if (trackIds.length) {
    const test = await fetch(
      `https://api.spotify.com/v1/audio-features/${trackIds[0]}`,
      { headers, cache: "no-store" },
    );
    console.log("af single", { status: test.status, id: trackIds[0] });
  }

  // const urlAF = `https://api.spotify.com/v1/audio-features?ids=${trackIds.join(",")}`;
  // let afRes = trackIds.length
  //   ? await fetch(urlAF, { headers, cache: "no-store" })
  //   : null;
  // // fallback: try app token if user token is rejected (403/401)
  // if (afRes && (afRes.status === 401 || afRes.status === 403)) {
  //   const appTok = await getAppToken();
  //   if (appTok) {
  //     afRes = await fetch(urlAF, {
  //       headers: { Authorization: `Bearer ${appTok}` },
  //       cache: "no-store",
  //     });
  //   }
  // }
  // // ? await fetch(
  // //     `https://api.spotify.com/v1/audio-features?ids=${trackIds.join(",")}`,
  // //     { headers, cache: "no-store" },
  // //   )
  // // : null;
  // const afJson =
  //   afRes && afRes.ok ? await readJSON(afRes) : { audio_features: [] };
  // const featuresList: any[] = afJson?.audio_features ?? [];
  // const featuresCount = featuresList.filter(Boolean).length;
  // if (process.env.NODE_ENV !== "production") {
  //   console.log("audio-features", {
  //     ids: trackIds.length,
  //     status: afRes?.status,
  //     featuresCount,
  //   });
  // }
  let featuresCount = 0;
  let featuresList: any[] = [];

  let userStatus: number | null = null;
  let appTried = false;
  let appStatus: number | null = null;
  let appErr: string | null = null;
  let res: Response | null = null;
  let userErr: string | null = null;

  try {
    if (trackIds.length) {
      const urlAF = `https://api.spotify.com/v1/audio-features?ids=${trackIds.join(",")}`;

      // 1) try user token
      // let res: Response | null = await fetch(urlAF, {
      //   headers,
      //   cache: "no-store",
      // });
      // userStatus = res.status;
      res = await fetch(urlAF, { headers, cache: "no-store" });
      userStatus = res.status;
      if (!res.ok) {
        try { userErr = (await res.text()).slice(0, 200); } catch { /* ignore */ }
      }

      // 2) fallback to client-credentials token on 401/403
      if (!res.ok && (res.status === 401 || res.status === 403)) {
        appTried = true;
        const appTok = await getAppToken(); // make sure SPOTIFY_CLIENT_ID / SECRET are set
        if (appTok) {
          const res2 = await fetch(urlAF, {
            headers: { Authorization: `Bearer ${appTok}` },
            cache: "no-store",
          });
          appStatus = res2.status;
          // if (res2.ok) res = res2; // only replace on success
          if (!res2.ok) {
            try { appErr = (await res2.text()).slice(0, 200); } catch { /* ignore */ }
          } else {
            res = res2;
          }
        }
      }

      if (res.ok) {
        const j = await res.json();
        featuresList = (j?.audio_features ?? []).filter(Boolean);
        featuresCount = featuresList.length;
      }
    }
  } catch (e) {
    console.error("audio-features error", e);
  }

  console.log("audio-features", {
    ids: trackIds.length,
    userStatus,
    appTried,
    appStatus,
    appErr,
    userErr,
    featuresCount,
  });
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
    const hasFeatures = typeof f?.id === "string";
    const scores = hasFeatures
      ? {
          hype: scoreTrackNorm(featuresN, Mood.HYPE),
          focus: scoreTrackNorm(featuresN, Mood.FOCUS),
          chill: scoreTrackNorm(featuresN, Mood.CHILL),
        }
      : { hype: 0, focus: 0, chill: 0 };

    return {
      id: t?.id,
      name: t?.name,
      artists: (t?.artists ?? []).map((a: any) => a?.name),
      image: t?.album?.images?.[0]?.url,
      featuresN,
      scores,
      hasFeatures: hasFeatures,
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

  // --- add meta & source to the payload ---
  const ids = playable.map((t: any) => t.id);
  const meta = {
    tracks_total: items.length,
    tracks_playable: playable.length,
    ids_count: ids.length,
    features_count: featuresCount,
  };

  console.log(
    `[recent] source=${sourceUsed} mode=${mode ?? "none"} first3=${sorted
      .slice(0, 3)
      .map((t: any) => t.name)
      .join(" | ")}`,
  );

  const examples = items.slice(0, 3).map((t: any) => ({
    name: t?.name,
    artist: t?.artists?.[0]?.name ?? "Unknown",
    genres: [] as string[],
  }));

  // Debug: top 5 per mode w/ scores
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
    source: sourceUsed,
    mode: mode ?? "none",
    meta,
    stats,
    top_artists,
    top_genres,
    examples,
    tracks: sorted, // contains scores + normalized features
    debug: debugOut,
  });
}
