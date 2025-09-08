'use client';

import { useState } from "react";
import type { LLMOut } from "@/lib/schema";

type Props = {
  data: LLMOut | null;                
  albums: { image?: string; name: string; artists: string[] }[];
  mode?: "hype" | "focus" | "chill"; // ⬅️ new
};

export function MoodBoard({ data, albums, mode}: Props ) {
  const [showWhy, setShowWhy] = useState(false);

  if (!data) return null;
  const { mood_tags, activities, energy_band, top_motifs, primary_caption, alt_captions, playlist_titles } = data;

  return (
    <div className="grid gap-4">
      <div className="flex items-center gap-2 flex-wrap">
        {mood_tags.map((m,i)=>(
          <span key={i} className="text-sm rounded-full bg-white/10 px-3 py-1">{m}</span>
        ))}
        <span className="text-xs rounded-full bg-white/5 px-2 py-1 border border-white/10">{energy_band}</span>
      </div>

      <p className="text-xl md:text-2xl">{primary_caption}</p>

      {alt_captions?.length ? (
        <div className="text-sm opacity-80">
          <span className="mr-2">Alternates:</span>
          {alt_captions.map((c,i)=>(<span key={i} className="mr-2">“{c}”</span>))}
        </div>
      ) : null}

      <div className="flex items-center gap-2 flex-wrap">
        {activities.map((a,i)=>(<span key={i} className="text-xs rounded bg-white/10 px-2 py-1">{a}</span>))}
        {top_motifs.map((t,i)=>(<span key={i} className="text-xs rounded bg-white/10 px-2 py-1">{t}</span>))}
      </div>

      <div>
        <h3 className="font-semibold mb-2">Playlist titles</h3>
        <div className="flex gap-2 flex-wrap">
          {playlist_titles.map((t,i)=>(<button key={i} onClick={()=>navigator.clipboard.writeText(t)} className="text-xs rounded bg-white/10 px-2 py-1 hover:bg-white/20 transition">{t} ↗</button>))}
        </div>
      </div>

      <button onClick={()=>setShowWhy(!showWhy)} className="text-sm underline underline-offset-4 opacity-80 hover:opacity-100">
        {showWhy ? "Hide" : "Why this?"}
      </button>
      {showWhy && (
        <div className="text-sm opacity-80">
          <p>Reasoned from energy, valence, and danceability across your most recent tracks.</p>
        </div>
      )}
      {mode && <div className="text-sm opacity-70 mb-2">Mode: {mode.toUpperCase()}</div>}

      <div className="grid grid-cols-3 md:grid-cols-5 gap-2">
        {albums.slice(0,15).map((a,i)=>(
          <div key={i} className="rounded overflow-hidden bg-white/5">
            {a.image ? (<img src={a.image} alt={a.name} className="w-full h-24 object-cover"/>) : (<div className="w-full h-24 bg-white/10"/>)}
          </div>
        ))}
      </div>
    </div>
  );
}
