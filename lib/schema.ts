import { z } from "zod";

export const OutputSchema = z.object({
  mood_tags: z.array(z.string()).min(1).max(6),
  activities: z.array(z.string()).min(1).max(6),
  energy_band: z.enum(["low", "medium", "high"]),
  top_motifs: z.array(z.string()).max(3),
  primary_caption: z.string().max(120),
  alt_captions: z.array(z.string()).max(5),
  playlist_titles: z.array(z.string()).max(7),
  cover_prompt: z.string().max(180),
});

export type LLMOut = z.infer<typeof OutputSchema>;

export type SnapshotInput = {
  stats: {
    valence_avg: number;
    energy_avg: number;
    danceability_avg: number;
    tempo_avg: number;
  };
  top_artists: string[];
  top_genres: string[];
  examples: { name: string; artist: string; genres: string[] }[];
  history_summaries?: { week: string; energy_avg: number; summary: string }[];
};
