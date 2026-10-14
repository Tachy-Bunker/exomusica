// A track's "profile" for the Morph ball: WAVE_BINS amplitude bytes followed by WAVE_BINS spectral-centroid bytes, base64. Worked out once by a listener's browser; first one in wins.
export const WAVE_BINS = 720;
export const isWaveProfile = (v: unknown): v is string => {
  if (typeof v !== "string" || v.length !== 4 * Math.ceil((WAVE_BINS * 2) / 3) || !/^[A-Za-z0-9+/]+={0,2}$/.test(v)) return false;
  return Buffer.from(v, "base64").length === WAVE_BINS * 2;
};
