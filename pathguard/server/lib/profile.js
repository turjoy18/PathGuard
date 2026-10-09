// Accessibility profile: validation, defaults, derived routing constraints.
export const DEFAULT_PROFILE = {
  mobility: { wheelchair: 'none', stairs: 'ok', maxSlopePct: 12, minWidthM: 0.6, maxKerbCm: 15, walkingSpeed: 'normal' },
  hearing: { level: 'none', signLanguage: false },
  vision: { level: 'none', screenReader: false },
  simpleLanguage: false, textScale: 1, needs: { toilet: false, power: false, quiet: false, assistanceAnimal: false },
  allowUnknownData: false, lang: 'en',
};
const oneOf = (v, list, d) => (list.includes(v) ? v : d);
const num = (v, lo, hi, d) => (v !== undefined && v !== null && v !== '' && Number.isFinite(+v) ? Math.min(hi, Math.max(lo, +v)) : d);
const bool = (v, d = false) => (typeof v === 'boolean' ? v : d);

export function normaliseProfile(input = {}) {
  const m = input.mobility || {}, h = input.hearing || {}, v = input.vision || {}, n = input.needs || {};
  const wheelchair = oneOf(m.wheelchair, ['none', 'manual', 'power', 'walker', 'mobility-scooter'], 'none');
  const limited = wheelchair !== 'none';
  return {
    mobility: {
      wheelchair,
      stairs: oneOf(m.stairs, ['ok', 'avoid', 'never'], limited ? 'never' : 'ok'),
      maxSlopePct: num(m.maxSlopePct, 2, 20, wheelchair === 'power' ? 8.3 : limited ? 5 : 12),
      minWidthM: num(m.minWidthM, 0.5, 1.5, limited ? 0.9 : 0.6),
      maxKerbCm: num(m.maxKerbCm, 0, 20, limited ? 2 : 15),
      walkingSpeed: oneOf(m.walkingSpeed, ['slow', 'normal', 'fast'], 'normal'),
    },
    hearing: { level: oneOf(h.level, ['none', 'hard-of-hearing', 'deaf'], 'none'), signLanguage: bool(h.signLanguage) },
    vision: { level: oneOf(v.level, ['none', 'low', 'blind'], 'none'), screenReader: bool(v.screenReader) },
    simpleLanguage: bool(input.simpleLanguage), textScale: num(input.textScale, 1, 2, 1),
    needs: { toilet: bool(n.toilet), power: bool(n.power), quiet: bool(n.quiet), assistanceAnimal: bool(n.assistanceAnimal) },
    allowUnknownData: bool(input.allowUnknownData), lang: oneOf(input.lang, ['en', 'zh-HK'], 'en'),
  };
}
export const needsStepFree = (p) => p.mobility.wheelchair !== 'none' || p.mobility.stairs !== 'ok';
export function speedMps(p) {
  const base = { slow: 0.8, normal: 1.3, fast: 1.6 }[p.mobility.walkingSpeed];
  if (p.mobility.wheelchair === 'manual') return Math.min(base, 1.0);
  if (p.mobility.wheelchair === 'power') return Math.min(base, 1.3);
  if (p.mobility.wheelchair !== 'none') return Math.min(base, 0.9);
  if (p.vision.level === 'blind' || p.vision.level === 'low') return Math.min(base, 1.0);
  return base;
}
