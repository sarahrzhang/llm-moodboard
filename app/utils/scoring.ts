import { Mood } from "../types/mood";

// Functions for calculating feature scores based on mode

export function clamp01(x: number) {
  return Math.max(0, Math.min(1, x));
}

export const norm = (x: number, a: number, b: number) =>
  clamp01((x - a) / (b - a));

function centerPref(x: number) {
  return clamp01(1 - Math.abs(x - 0.5) * 2);
}

export function scoreTrackNorm(fN: any, mode: Mood) {
  const { energyN, danceN, valenceN, tempoN, acousticN, instrN, speechN } = fN;

  if (mode === Mood.HYPE) {
    // big energy/dance, faster tempo, brighter mood
    return 0.5 * energyN + 0.2 * danceN + 0.2 * tempoN + 0.1 * valenceN;
  }
  if (mode === Mood.FOCUS) {
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
export function tieBreak(a: any, b: any, mode: Mode) {
  const eps = 1e-3;
  if (mode === Mood.HYPE) {
    const d1 = b.featuresN.energyN - a.featuresN.energyN;
    if (Math.abs(d1) > eps) return d1;
    const d2 = b.featuresN.tempoN - a.featuresN.tempoN;
    if (Math.abs(d2) > eps) return d2;
    const d3 = b.featuresN.danceN - a.featuresN.danceN;
    if (Math.abs(d3) > eps) return d3;
  } else if (mode === Mood.FOCUS) {
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

export function range(list: any[], key: string) {
  const vals = list
    .map((f) => f?.[key] ?? null)
    .filter((v: any) => typeof v === "number" && !Number.isNaN(v));
  if (!vals.length) return { min: 0, max: 1 };
  return { min: Math.min(...vals), max: Math.max(...vals) };
}

export function minmax(v: number | undefined, min: number, max: number) {
  if (v == null || Number.isNaN(v)) return 0.5; // neutral center
  if (max <= min) return 0.5;
  return (v - min) / (max - min);
}
