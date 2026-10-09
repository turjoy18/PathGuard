// HKO open data client + warning model. Never invents alerts: if HKO is unreachable the state is 'unavailable'/'stale'.
import { db, uid, now, save, bus } from './store.js';
import { sim } from './world.js';
import { climateDemo } from './demo-data.js';

const BASE = 'https://data.weather.gov.hk/weatherAPI/opendata/weather.php';
const TTL = 60_000;
const cache = { warn: null, rhr: null, fetchedAt: 0, error: null };
const DISTRICT = 'Sham Shui Po';

async function hko(dataType) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 6000);
  try {
    const r = await fetch(`${BASE}?dataType=${dataType}&lang=en`, { signal: ctl.signal, headers: { 'user-agent': 'PathGuard-demo/1.0' } });
    if (!r.ok) throw new Error(`HKO ${dataType} HTTP ${r.status}`);
    return await r.json();
  } finally { clearTimeout(t); }
}
export async function refreshHko(force = false) {
  if (process.env.PG_OFFLINE === '1') { cache.error = 'offline mode'; return; }
  if (!force && now() - cache.fetchedAt < TTL) return;
  try {
    const [w, r] = await Promise.all([hko('warnsum'), hko('rhrread')]);
    cache.warn = w; cache.rhr = r; cache.fetchedAt = now(); cache.error = null;
  } catch (e) { cache.error = e.message; }
}

export const LEVELS = { 1: 'advisory', 2: 'alert', 3: 'severe', 4: 'critical' };
const WRAIN = { WRAINA: 2, WRAINR: 3, WRAINB: 4 };
function levelOf(key, w) {
  const code = w.code || '';
  if (WRAIN[code]) return WRAIN[code];
  if (key === 'WTCSGNL') { const n = /TC(\d+)/.exec(code)?.[1]; return n >= 9 ? 4 : n >= 8 ? 3 : n >= 3 ? 2 : 1; }
  if (key === 'WTMW') return 4;
  if (['WFIREY', 'WFIRER', 'WFNTSA', 'WL', 'WHOT', 'WCOLD'].includes(key)) return key === 'WFIRER' ? 3 : 2;
  return 1;
}
const ADVICE = {
  2: { en: 'Stay alert. Check your route and shelter now. Avoid low-lying places.', simple: 'Be careful. Look at your shelter plan.', zh: '請保持警覺，現在查看路線及庇護所，避開低窪地方。' },
  3: { en: 'Severe weather. Move to your chosen shelter early if the route is clear. Do not wait for conditions to worsen.', simple: 'Bad weather. Go to your shelter soon.', zh: '惡劣天氣。如路線暢通，請及早前往庇護所。' },
  4: { en: 'Critical. Avoid travel unless you must move. If you are outdoors, go to the nearest safe covered place and ask for help.', simple: 'Very dangerous. Go to a safe place now. Ask for help.', zh: '情況危急。除非必要請勿外出；身處戶外請前往最近安全的有蓋地方並求助。' },
  1: { en: 'Information only. No action required.', simple: 'For your information.', zh: '僅供參考，無須行動。' },
};
export const VIBRATION = { 1: [200], 2: [300, 150, 300], 3: [500, 200, 500, 200, 500], 4: [800, 200, 800, 200, 800, 200, 800] };
export const PULSE_HZ = { 1: 0.5, 2: 0.8, 3: 1.2, 4: 1.8 }; // all < 3 flashes per second (WCAG 2.3.1)

export function currentWarnings() {
  const out = [];
  const w = cache.warn || {};
  for (const [key, v] of Object.entries(w)) {
    if (!v || v.actionCode === 'CANCEL') continue;
    const code = v.code || key;
    out.push({ key, code, name: v.name || key, level: levelOf(key, v), issuedAt: v.issueTime || null, updatedAt: v.updateTime || null, source: 'HKO', simulated: false });
  }
  if (sim.warning) out.push({ key: 'SIM', code: sim.warning.code, name: sim.warning.name, level: sim.warning.level, issuedAt: new Date().toISOString(), source: 'SIMULATION', simulated: true });
  return out.sort((a, b) => b.level - a.level);
}
export function rainfallPastHour() {
  if (sim.rain != null) return { mm: sim.rain, place: DISTRICT, simulated: true, source: 'SIMULATION' };
  const row = cache.rhr?.rainfall?.data?.find((d) => d.place === DISTRICT);
  return { mm: row ? row.max ?? 0 : null, place: DISTRICT, simulated: false, source: 'HKO', window: cache.rhr?.rainfall ? { start: cache.rhr.rainfall.startTime, end: cache.rhr.rainfall.endTime } : null };
}
export function percentile(mm) {
  const month = new Date().getMonth() + 1; const bp = climateDemo[month] || climateDemo[10];
  if (mm == null) return null;
  const ps = [50, 75, 90, 95, 99]; let p = 25; ps.forEach((pp, i) => { if (mm >= bp[i]) p = pp; });
  return { percentile: p, unusual: p >= 95, label: p >= 95 ? 'Unusually heavy for this month' : p >= 75 ? 'Heavier than typical for this month' : 'Within typical range', simulated: true, note: 'Climate percentiles are DEMO values, not HKO statistics. Replace with HKO monthly daily-climate CSVs.' };
}
export function floodMode() { return currentWarnings().some((w) => WRAIN[w.code]) || (rainfallPastHour().mm ?? 0) >= 30; }
export function weatherSnapshot() {
  const ageMin = cache.fetchedAt ? Math.round((now() - cache.fetchedAt) / 60000) : null;
  const status = cache.fetchedAt ? (cache.error ? 'stale' : 'live') : 'unavailable';
  const temp = cache.rhr?.temperature?.data?.find((d) => d.place === 'Sham Shui Po') || cache.rhr?.temperature?.data?.[0];
  const rain = rainfallPastHour();
  return {
    status, ageMin, error: cache.error, source: 'Hong Kong Observatory open data', updateTime: cache.rhr?.updateTime || null,
    warnings: currentWarnings(), rainfall: rain, climate: percentile(rain.mm),
    temperature: temp ? { place: temp.place, value: temp.value, unit: temp.unit } : null,
    tcTrack: sim.replay.running || (sim.warning && /Typhoon|TC/i.test(sim.warning.name)) ? [[22.1, 114.9], [22.2, 114.6], [22.25, 114.35]] : null,
    tcNote: 'Live tropical cyclone track not wired in this demo [U]; shown only in simulation.',
    simulationActive: sim.active, floodMode: floodMode(),
  };
}

// ---- alerts derived from warnings ----
export function syncAlerts() {
  const warnings = currentWarnings(); let changed = false;
  for (const w of warnings) {
    const key = `${w.code}:${w.simulated ? 'sim' : 'live'}`;
    if (db.alerts.some((a) => a.key === key && a.status === 'active')) continue;
    const adv = ADVICE[w.level];
    db.alerts.push({ id: uid('al'), key, code: w.code, title: w.name, level: w.level, severity: LEVELS[w.level], text: adv.en, simple: adv.simple, zh: adv.zh,
      vibration: VIBRATION[w.level], pulseHz: PULSE_HZ[w.level], simulated: w.simulated, source: w.source, issuedAt: now(), status: 'active' });
    changed = true;
  }
  for (const a of db.alerts) if (a.status === 'active' && !warnings.some((w) => `${w.code}:${w.simulated ? 'sim' : 'live'}` === a.key)) { a.status = 'cleared'; a.clearedAt = now(); changed = true; }
  if (changed) { save(); bus.emit('alerts', { at: now() }); }
}
export function tickWeather() { refreshHko().then(syncAlerts).catch(() => {}); }
