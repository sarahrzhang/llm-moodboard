import { NextRequest, NextResponse } from "next/server";
import { OutputSchema, type LLMOut } from "@/lib/schema";

export const runtime = "nodejs";

const SYSTEM_PROMPT = `You are a music mood analyst. Return valid JSON only following the provided schema. Use the stats (valence≈positivity, energy, danceability, tempo), top genres, and artist examples. Make captions specific but under 18 words. Avoid buzzwords. No profanity.`;

function rulesFallback(input: any): LLMOut {
  const v = input?.stats?.valence_avg ?? 0.5;
  const e = input?.stats?.energy_avg ?? 0.5;
  const d = input?.stats?.danceability_avg ?? 0.5;
  const energy_band = e < 0.4 ? "low" : e < 0.7 ? "medium" : "high";
  const mood_tags = [
    v > 0.6 ? "sunny" : v < 0.4 ? "moody" : "neutral",
    e > 0.6 ? "hype" : e < 0.4 ? "chill" : "even",
    d > 0.6 ? "danceable" : d < 0.4 ? "floaty" : "groovy",
  ];
  const primary_caption =
    energy_band === "high"
      ? "High-energy, upbeat grooves keep you moving."
      : energy_band === "low"
        ? "Soft, reflective tracks for winding down."
        : "Balanced, bright rhythm with room to breathe.";
  return {
    mood_tags,
    activities: ["coding", "commute", "gym warmup"],
    energy_band,
    top_motifs: ["steady kick", "catchy hooks"],
    primary_caption,
    alt_captions: ["Sun’s out, beats up.", "Calm focus, steady pulse."],
    playlist_titles: [
      "Ship Mode",
      "Sunlit Sprints",
      "Deep Work Glow",
      "Night Drive",
      "Lo-Fi Lift",
    ],
    cover_prompt:
      "minimalist vector of sunrise over city skyline with subtle equalizer bars",
  };
}

export async function POST(req: NextRequest) {
  const input = await req.json();
  const key = process.env.OPENAI_API_KEY;

  // If no key, use fallback
  if (!key) {
    const out = rulesFallback(input);
    return NextResponse.json(out);
  }

  try {
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: "gpt-5",
        // model: "gpt-4o-mini",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Analyze this listening snapshot and produce JSON that matches the schema.",
              },
              { type: "text", text: JSON.stringify(input) },
            ],
          },
        ],
        temperature: 0.7,
        response_format: { type: "json_object" },
      }),
    });

    const j = await resp.json();
    const raw = j?.choices?.[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw);
    const validated = OutputSchema.safeParse(parsed);
    if (!validated.success) {
      return NextResponse.json(rulesFallback(input));
    }
    return NextResponse.json(validated.data);
  } catch (e) {
    console.error("LLM error:", e);
    return NextResponse.json(rulesFallback(input));
  }
}
