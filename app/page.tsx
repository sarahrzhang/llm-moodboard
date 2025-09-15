"use client";

import { useEffect, useState, useMemo } from "react";
import type { LLMOut, SnapshotInput } from "@/lib/schema";
import { MoodBoard } from "@/components/MoodBoard";
import { Track } from "./types/tracks";
import { Mood } from "./types/mood";

export default function Page() {
  const [loading, setLoading] = useState(false);
  const [snap, setSnap] = useState<SnapshotInput | null>(null);
  const [albums, setAlbums] = useState<Track[]>([]);
  const [out, setOut] = useState<LLMOut | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasToken, setHasToken] = useState<boolean>(true);
  const [mood, setMood] = useState<Mood>(Mood.HYPE);

  // Sort & project to your old prop shape
  const visibleAlbums = useMemo(() => {
    if (!albums?.length) return [];
    // If server sent scores, sort by the selected mode; otherwise keep order.
    const sorted = albums[0]?.scores
      ? [...albums].sort(
          (a, b) => (b.scores?.[mood] ?? 0) - (a.scores?.[mood] ?? 0),
        )
      : albums;
    // Project back to your OLD prop shape for MoodBoard
    return sorted.map((t) => ({
      image: t.image,
      name: t.name,
      artists: t.artists,
    }));
  }, [albums, mood]);

  // fetch tracks on mood change (and on first render)
  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);

      const res = await fetch(`/api/spotify/recent?mode=${mood}`, {
        cache: "no-store",
      });
      if (res.status === 401) {
        setHasToken(false);
        setLoading(false);
        return;
      }
      const j = await res.json();
      // TODO: for debugging
      console.log(
        "API mode",
        mood,
        j.tracks?.slice(0, 3)?.map((t: any) => t.name),
      );
      if (!("scores" in (j.tracks?.[0] || {}))) {
        console.warn("No `scores` on tracks; client sort will be a no-op.");
      }

      if (j.error && !j.tracks?.length) {
        setError(j.message || "No tracks available.");
        setAlbums([]);
        setSnap(null);
        setLoading(false);
        return;
      }
      // `tracks` are already sorted on the server for the chosen `mode`
      setAlbums(j.tracks ?? []);
      setSnap({
        stats: j.stats,
        top_artists: j.top_artists ?? [],
        top_genres: j.top_genres ?? [],
        examples: j.examples ?? [],
      });
      setLoading(false);
    })();
  }, [mood]); // watching mood for changes

  const analyze = async () => {
    if (!snap) return;
    setLoading(true);
    setError(null);
    try {
      // keep your lightweight “mood” tweak before sending to /api/analyze
      const tweak = { ...snap };
      if (mood === "focus")
        tweak.stats.energy_avg = Math.max(0, tweak.stats.energy_avg - 0.2);
      if (mood === "chill") {
        tweak.stats.energy_avg = Math.max(0, tweak.stats.energy_avg - 0.3);
        tweak.stats.valence_avg = Math.max(0, tweak.stats.valence_avg - 0.05);
      }
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(tweak),
      });
      const j = await res.json();
      setOut(j);
    } catch {
      setError("Analysis failed");
    } finally {
      setLoading(false);
    }
  };

  const login = () => {
    window.location.href = "/api/auth/login";
  };

  return (
    <main className="min-h-screen p-6 md:p-10">
      <div className="max-w-3xl mx-auto grid gap-6">
        <header className="flex items-center justify-between">
          <h1 className="text-2xl md:text-3xl font-semibold">LLM Moodboard</h1>
        </header>

        {!hasToken && (
          <div className="rounded-lg p-4 bg-white/5 border border-white/10">
            <p className="mb-2">
              Sign in with Spotify to analyze your recent listening.
            </p>
            <button
              onClick={login}
              className="px-3 py-2 rounded bg-white/10 hover:bg-white/20 transition"
            >
              Sign in with Spotify
            </button>
          </div>
        )}

        {hasToken && (
          <div className="rounded-lg p-4 bg-white/5 border border-white/10 grid gap-3">
            <div className="flex items-center gap-2">
              <span className="text-sm">Mode:</span>
              <button
                onClick={() => setMood(Mood.HYPE)}
                disabled={loading}
                className={`px-2 py-1 rounded ${mood === "hype" ? "bg-white/20" : "bg-white/10"} disabled:opacity-60`}
                aria-pressed={mood === "hype"}
              >
                Hype
              </button>
              <button
                onClick={() => setMood(Mood.FOCUS)}
                disabled={loading}
                className={`px-2 py-1 rounded ${mood === "focus" ? "bg-white/20" : "bg-white/10"} disabled:opacity-60`}
                aria-pressed={mood === "focus"}
              >
                Focus
              </button>
              <button
                onClick={() => setMood(Mood.CHILL)}
                disabled={loading}
                className={`px-2 py-1 rounded ${mood === "chill" ? "bg-white/20" : "bg-white/10"} disabled:opacity-60`}
                aria-pressed={mood === "chill"}
              >
                Chill
              </button>
              {loading && (
                <span className="text-xs opacity-70 ml-2">Updating…</span>
              )}
            </div>

            <div className="flex items-center gap-3">
              <button
                disabled={loading || !snap}
                onClick={analyze}
                className="px-3 py-2 rounded bg-white/10 hover:bg-white/20 transition disabled:opacity-60"
              >
                Analyze with AI
              </button>
              {loading && (
                <span className="text-sm opacity-70 animate-pulse">
                  Working…
                </span>
              )}
            </div>

            {error && <div className="text-sm text-red-300">{error}</div>}

            <MoodBoard data={out} albums={visibleAlbums} mode={mood} />
          </div>
        )}

        <footer className="text-xs opacity-70">
          <div className="flex items-center gap-4 flex-wrap">
            <span> Made for you, built by Sarah Z. </span>
          </div>
        </footer>
      </div>
    </main>
  );
}
