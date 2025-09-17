/* Use target-based Gaussian preferences
 * Score each feature by closeness to a mode-specific target (with a width)
 * Spread scores and break ties
 */

import { Mood } from "../types/mood";

// clamp to [0, 1]
export function clamp01(x: number) {
  return Math.max(0, Math.min(1, x));
}

export function gaussianPref(x: number, mu: number, sigma = 0.18) {
  // x in [0,1]; mu is target; sigma controls sharpness
  const z = (x - mu) / sigma;
  return Math.exp(-0.5 * z * z); // 0..1
}

// TODO add spotify types
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function scoreTrackNorm(fN: any, mode: Mood) {
  // normalized features on 0..1
  const { energyN, danceN, valenceN, tempoN, acousticN, instrN, speechN } = fN;

  if (mode === Mood.HYPE) {
    // high energy/dance/tempo, moderately positive valence
    return (
      0.48 * gaussianPref(energyN, 0.95) +
      0.22 * gaussianPref(danceN, 0.9) +
      0.2 * gaussianPref(tempoN, 0.88) +
      0.1 * gaussianPref(valenceN, 0.6)
    );
  }
  if (mode === Mood.FOCUS) {
    // more instrumental, low speech; mid energy/tempo so it’s not sleepy or hype
    return (
      0.45 * gaussianPref(instrN, 0.9) +
      0.25 * gaussianPref(1 - speechN, 0.95) +
      0.15 * gaussianPref(energyN, 0.5, 0.2) +
      0.15 * gaussianPref(tempoN, 0.5, 0.2)
    );
  }
  // chill: low energy/tempo, acoustic texture, pleasant mood
  return (
    0.45 * gaussianPref(energyN, 0.15) +
    0.25 * gaussianPref(tempoN, 0.25) +
    0.2 * gaussianPref(acousticN, 0.8, 0.22) +
    0.1 * gaussianPref(valenceN, 0.55, 0.25)
  );
}

// tie-breakers when two scores are nearly equal
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function tieBreak(a: any, b: any, mode: Mood) {
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
      Math.abs(b.featuresN.energyN - 0.5) - Math.abs(a.featuresN.energyN - 0.5);
    if (Math.abs(d3) > eps) return d3 * -1;
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function scorePlays(plays: any[]) {
  // exponential decay by recency; more recent plays count slightly more
  return plays.reduce((s, it, idx) => s + Math.pow(0.98, idx), 0);
}
