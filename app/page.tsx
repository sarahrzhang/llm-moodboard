'use client';

import { useEffect, useState } from "react";
import type { LLMOut, SnapshotInput } from "@/lib/schema";
import { MoodBoard } from "@/components/MoodBoard";

type Track = { id:string; name:string; artists:string[]; image?:string };

export default function Page() {
  const [loading, setLoading] = useState(false);
  const [snap, setSnap] = useState<SnapshotInput | null>(null);
  const [albums, setAlbums] = useState<Track[]>([]);
  const [out, setOut] = useState<LLMOut | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasToken, setHasToken] = useState<boolean>(true);
  const [mode, setMode] = useState<"hype"|"focus"|"chill">("hype");

  // fetch tracks whenever `mode` changes (and on first render)
  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      // If your route file is /app/api/spotify/recent/route.ts, keep the path below.
      // If you put the mode-aware handler somewhere else, update the URL to match.
      const res = await fetch(`/api/spotify/recent?mode=${mode}`, { cache: "no-store" });
      if (res.status === 401) {
        setHasToken(false);
        setLoading(false);
        return;
      }
      const j = await res.json();
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
        examples: j.examples ?? []
      });
      setLoading(false);
    })();
  }, [mode]); // watching mode for changes

  const analyze = async () => {
    if (!snap) return;
    setLoading(true);
    setError(null);
    try {
      // keep your lightweight “mode” tweak before sending to /api/analyze
      const tweak = { ...snap };
      if (mode === "focus") tweak.stats.energy_avg = Math.max(0, tweak.stats.energy_avg - 0.2);
      if (mode === "chill") { tweak.stats.energy_avg = Math.max(0, tweak.stats.energy_avg - 0.3); tweak.stats.valence_avg = Math.max(0, tweak.stats.valence_avg - 0.05); }
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(tweak)
      });
      const j = await res.json();
      setOut(j);
    } catch {
      setError("Analysis failed");
    } finally {
      setLoading(false);
    }
  };

  const login = () => { window.location.href = "/api/auth/login"; };

  return (
    <main className="min-h-screen p-6 md:p-10">
      <div className="max-w-3xl mx-auto grid gap-6">
        <header className="flex items-center justify-between">
          <h1 className="text-2xl md:text-3xl font-semibold">LLM Moodboard</h1>
        </header>

        {!hasToken && (
          <div className="rounded-lg p-4 bg-white/5 border border-white/10">
            <p className="mb-2">Sign in with Spotify to analyze your recent listening.</p>
            <button onClick={login} className="px-3 py-2 rounded bg-white/10 hover:bg-white/20 transition">Sign in with Spotify</button>
          </div>
        )}

        {hasToken && (
          <div className="rounded-lg p-4 bg-white/5 border border-white/10 grid gap-3">
            <div className="flex items-center gap-2">
              <span className="text-sm">Mode:</span>
              <button
                onClick={()=>setMode("hype")}
                disabled={loading}
                className={`px-2 py-1 rounded ${mode==="hype"?"bg-white/20":"bg-white/10"} disabled:opacity-60`}
                aria-pressed={mode==="hype"}
              >Hype</button>
              <button
                onClick={()=>setMode("focus")}
                disabled={loading}
                className={`px-2 py-1 rounded ${mode==="focus"?"bg-white/20":"bg-white/10"} disabled:opacity-60`}
                aria-pressed={mode==="focus"}
              >Focus</button>
              <button
                onClick={()=>setMode("chill")}
                disabled={loading}
                className={`px-2 py-1 rounded ${mode==="chill"?"bg-white/20":"bg-white/10"} disabled:opacity-60`}
                aria-pressed={mode==="chill"}
              >Chill</button>
              {loading && <span className="text-xs opacity-70 ml-2">Updating…</span>}
            </div>

            <div className="flex items-center gap-3">
              <button disabled={loading || !snap} onClick={analyze} className="px-3 py-2 rounded bg-white/10 hover:bg-white/20 transition disabled:opacity-60">Analyze with AI</button>
              {loading && <span className="text-sm opacity-70 animate-pulse">Working…</span>}
            </div>

            {error && <div className="text-sm text-red-300">{error}</div>}

            <MoodBoard data={out} albums={albums}/>
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
