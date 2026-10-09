// Runtime world state layered over the static (demo) geometry: lifts, flood spots, shelters, hazards, simulation.
import { db, now, save, bus, audit } from './store.js';
import { lifts as baseLifts, blackspots, shelters as baseShelters, edges, edgeMid, replayScript } from './demo-data.js';
import { distM } from './geo.js';

export const sim = {
  active: false, // true while any simulated override is applied
  lifts: {},          // id -> 'down' | 'unknown'
  floods: new Set(),  // blackspot ids flooded right now
  full: new Set(),    // shelter ids forced full
  warning: null,      // {code,name,level} override of live HKO
  rain: null,         // mm past hour override
  replay: { running: false, step: -1, label: null },
  log: [],
};
let replayTimer = null;
const logSim = (actor, text) => { sim.log.unshift({ at: now(), actor: actor?.name || 'system', text }); sim.log.length = Math.min(sim.log.length, 50); };
const touch = (reason) => { sim.active = !!(Object.keys(sim.lifts).length || sim.floods.size || sim.full.size || sim.warning || sim.rain != null || sim.replay.running); bus.emit('world', { reason, at: now() }); };

export function simAction(actor, action, arg) {
  switch (action) {
    case 'lift-fail': if (!baseLifts.find((l) => l.id === arg)) throw new Error('unknown lift'); sim.lifts[arg] = 'down'; logSim(actor, `Lift ${arg} failure injected`); break;
    case 'lift-unknown': sim.lifts[arg] = 'unknown'; logSim(actor, `Lift ${arg} status set to unknown`); break;
    case 'lift-fix': delete sim.lifts[arg]; logSim(actor, `Lift ${arg} restored`); break;
    case 'flood': if (!blackspots.find((b) => b.id === arg)) throw new Error('unknown blackspot'); sim.floods.add(arg); logSim(actor, `Flooding injected at ${arg}`); break;
    case 'flood-clear': sim.floods.delete(arg); logSim(actor, `Flooding cleared at ${arg}`); break;
    case 'shelter-full': if (!baseShelters.find((s) => s.id === arg)) throw new Error('unknown shelter'); sim.full.add(arg); logSim(actor, `Shelter ${arg} marked full`); break;
    case 'shelter-free': sim.full.delete(arg); logSim(actor, `Shelter ${arg} capacity restored`); break;
    case 'warning': sim.warning = arg ? { code: arg.code, name: arg.name, level: arg.level } : null; logSim(actor, arg ? `Warning override: ${arg.name}` : 'Warning override cleared'); break;
    case 'reset': stopReplay(); sim.lifts = {}; sim.floods = new Set(); sim.full = new Set(); sim.warning = null; sim.rain = null; sim.replay = { running: false, step: -1, label: null }; logSim(actor, 'Simulation reset'); break;
    case 'replay-start': startReplay(actor, Number(arg) > 0 ? Number(arg) : 8); return touch(action);
    case 'replay-stop': stopReplay(); logSim(actor, 'Replay stopped'); break;
    default: throw new Error('unknown simulation action');
  }
  audit(actor, `sim.${action}`, String(arg ?? ''));
  touch(action);
}
export function applyReplayStep(i) {
  const s = replayScript.steps[i]; if (!s) return;
  sim.replay.step = i; sim.replay.label = s.label;
  sim.warning = s.warning; sim.rain = s.rain;
  sim.lifts = {}; (s.liftDown || []).forEach((id) => { sim.lifts[id] = 'down'; });
  if (s.flood) s.flood.forEach((id) => sim.floods.add(id));
  if (s.full) s.full.forEach((id) => sim.full.add(id));
  touch('replay-step');
}
function startReplay(actor, seconds) {
  stopReplay(); sim.floods = new Set(); sim.full = new Set();
  sim.replay.running = true; logSim(actor, `Replay started (${seconds}s per step): ${replayScript.title}`);
  let i = 0; applyReplayStep(0);
  replayTimer = setInterval(() => { i++; if (i >= replayScript.steps.length) return stopReplay(true); applyReplayStep(i); }, seconds * 1000);
  replayTimer.unref?.();
}
function stopReplay(done) { clearInterval(replayTimer); replayTimer = null; sim.replay.running = false; if (done) { touch('replay-end'); } }

export function liftStatus() {
  return baseLifts.map((l) => ({ ...l, status: sim.lifts[l.id] || l.status, simulated: !!sim.lifts[l.id] || true, dataNote: 'Live lift status is not in the open data; value is simulated.' }));
}
export function floodSpots() {
  return blackspots.map((b) => ({ ...b, floodedNow: sim.floods.has(b.id), simulated: sim.floods.has(b.id) }));
}
export function shelterList() {
  return baseShelters.map((s) => {
    const o = db.shelterOverrides[s.id] || {};
    const m = { ...s, ...o };
    if (sim.full.has(s.id)) m.occupancy = m.capacity;
    const age = o.updatedAt ? Math.round((now() - o.updatedAt) / 60000) : s.updatedMinutesAgo;
    return { ...m, updatedMinutesAgo: age, simulated: true, dataNote: 'Capacity and accessibility features are simulated; the open shelter list has no such fields.' };
  });
}
// edge -> blackspot ids whose circle covers its midpoint
const edgeSpots = new Map(edges.map((e) => { const m = edgeMid(e); return [e.id, blackspots.filter((b) => distM(m, b) <= b.radius).map((b) => b.id)]; }));
export const spotsOnEdge = (id) => edgeSpots.get(id) || [];

export const HAZARD_TYPES = { blocked_path: 4 * 3600e3, flood: 2 * 3600e3, lift_out: 12 * 3600e3, fallen_tree: 6 * 3600e3, crowd: 3600e3, other: 2 * 3600e3 };
export function activeHazards() {
  const t = now(); let changed = false;
  for (const h of db.hazards) if ((h.status === 'pending' || h.status === 'verified') && h.expiresAt < t) { h.status = 'expired'; changed = true; }
  if (changed) save();
  return db.hazards.filter((h) => h.status === 'pending' || h.status === 'verified');
}
