// Deterministic accessible routing. Safety rules live here, never in the model.
import { nodes, edges } from './demo-data.js';
import { bearing, turnWord, compass } from './geo.js';
import { speedMps } from './profile.js';

const nodeById = new Map(nodes.map((n) => [n.id, n]));
export const getNode = (id) => nodeById.get(id);
const adj = new Map(nodes.map((n) => [n.id, []]));
for (const e of edges) { adj.get(e.a).push({ e, to: e.b }); adj.get(e.b).push({ e, to: e.a }); }

const BLOCKING_HAZARDS = new Set(['blocked_path', 'flood', 'fallen_tree', 'lift_out']);

/**
 * ctx = { profile, lifts:{id:status}, floodedSpots:Set, spotsOnEdge(id), floodMode, hazards:[{edgeId,type,status,liftId?}] }
 * Returns { blocked: string|null, risk: 0..1, extraSec, notes[], unknown:boolean }
 */
export function evalEdge(e, ctx) {
  const p = ctx.profile, m = p.mobility, notes = [];
  let risk = 0, extraSec = 0, unknown = false;
  const allowUnknown = p.allowUnknownData;
  const block = (reason) => ({ blocked: reason, risk: 1, extraSec, notes, unknown });

  if (e.stairs && m.stairs !== 'ok') return block('stairs');
  if (e.stairs && m.stairs === 'ok' && m.walkingSpeed === 'slow') { risk += 0.2; extraSec += 20; }
  if (e.width == null || e.gradient == null || e.kerb == null) {
    unknown = true;
    if (!allowUnknown) return block('unknown-data');
    risk += 0.35; notes.push('Some measurements are missing for this segment');
  } else {
    if (e.width < m.minWidthM) return block('too-narrow');
    if (e.gradient > m.maxSlopePct) return block('too-steep');
    if (e.kerb > m.maxKerbCm) return block('kerb-too-high');
    if (e.gradient > m.maxSlopePct * 0.8) risk += 0.2;
    if (e.width < m.minWidthM + 0.3) risk += 0.1;
  }
  if (e.liftId) {
    const st = ctx.lifts[e.liftId] || 'working';
    if (st === 'down') return block('lift-down');
    if (st === 'unknown') {
      if (!allowUnknown) return block('lift-unknown');
      risk += 0.4;
    }
    extraSec += 45; notes.push(`Uses lift ${e.liftId}`);
  }
  const spots = ctx.spotsOnEdge(e.id);
  if (spots.some((s) => ctx.floodedSpots.has(s))) return block('flooded');
  if (spots.length || e.floodProne) {
    if (ctx.floodMode) {
      if (m.wheelchair !== 'none' || p.vision.level !== 'none' || m.walkingSpeed === 'slow') return block('flood-prone-during-warning');
      risk += 0.6;
    } else risk += 0.15;
  }
  for (const h of ctx.hazards) {
    if (h.edgeId !== e.id) continue;
    if (h.status === 'verified' && BLOCKING_HAZARDS.has(h.type)) return block(`hazard:${h.type}`);
    risk += h.status === 'verified' ? 0.5 : 0.35; notes.push(`Unverified ${h.type.replace('_', ' ')} report`);
  }
  if (!e.covered && ctx.floodMode) risk += 0.1;
  return { blocked: null, risk: Math.min(1, risk), extraSec, notes, unknown };
}

export function dijkstra(startId, ctx) {
  const speed = speedMps(ctx.profile);
  const dist = new Map(nodes.map((n) => [n.id, Infinity])), time = new Map(), riskLen = new Map(), prev = new Map(), len = new Map();
  const stats = {}; const done = new Set();
  dist.set(startId, 0); time.set(startId, 0); riskLen.set(startId, 0); len.set(startId, 0);
  for (;;) {
    let u = null, best = Infinity;
    for (const [id, d] of dist) if (!done.has(id) && d < best) { best = d; u = id; }
    if (u == null) break;
    done.add(u);
    for (const { e, to } of adj.get(u)) {
      if (done.has(to)) continue;
      const ev = ctx._cache?.get(e.id) ?? evalEdge(e, ctx);
      if (ev.blocked) { stats[ev.blocked] = (stats[ev.blocked] || 0) + 0.5; continue; }
      const slope = Math.max(0.5, 1 - (e.gradient || 0) / 40);
      const sec = e.length / (speed * slope) + ev.extraSec;
      const cost = sec + ev.risk * e.length * 0.8;
      if (dist.get(u) + cost < dist.get(to)) {
        dist.set(to, dist.get(u) + cost); time.set(to, time.get(u) + sec);
        riskLen.set(to, riskLen.get(u) + ev.risk * e.length); len.set(to, len.get(u) + e.length); prev.set(to, { from: u, e, ev });
      }
    }
  }
  return { dist, time, riskLen, len, prev, stats, start: startId };
}

export function buildRoute(tree, targetId) {
  if (!tree.prev.has(targetId) && tree.start !== targetId) return null;
  const path = [targetId], segs = [];
  let cur = targetId;
  while (cur !== tree.start) { const pr = tree.prev.get(cur); segs.unshift({ ...pr, to: cur }); cur = pr.from; path.unshift(cur); }
  const distanceM = tree.len.get(targetId) || 0;
  const risk = distanceM ? tree.riskLen.get(targetId) / distanceM : 0;
  const unknownUsed = segs.some((s) => s.ev.unknown);
  const liftsUsed = [...new Set(segs.filter((s) => s.e.liftId).map((s) => s.e.liftId))];
  const unverified = segs.flatMap((s) => s.ev.notes.filter((n) => n.startsWith('Unverified')));
  return {
    found: true, nodes: path, coords: path.map((id) => { const n = nodeById.get(id); return [n.lat, n.lng]; }),
    edgeIds: segs.map((s) => s.e.id), distanceM: Math.round(distanceM), timeSec: Math.round(tree.time.get(targetId)),
    risk: Math.round(risk * 100) / 100, riskLabel: risk < 0.12 ? 'low' : risk < 0.3 ? 'moderate' : 'elevated',
    unknownUsed, liftsUsed, warnings: [...new Set(unverified)],
    steps: describe(segs),
  };
}

const lbl = (n) => n?.name || null;
function describe(segs) {
  const groups = [];
  for (const s of segs) {
    const key = `${s.e.street}|${s.e.type}|${s.e.liftId || ''}|${s.e.stairs}`;
    const g = groups[groups.length - 1];
    if (g && g.key === key) { g.len += s.e.length; g.last = s; g.toNode = s.to; g.edges.push(s.e); }
    else groups.push({ key, first: s, last: s, len: s.e.length, from: s.from, toNode: s.to, edges: [s.e] });
  }
  const steps = []; let prevBearing = null;
  groups.forEach((g, i) => {
    const a = nodeById.get(g.from), b = nodeById.get(g.toNode);
    const br = bearing(a, b);
    const e = g.first.e;
    const turn = prevBearing == null ? `Head ${compass(br)}` : turnWord(prevBearing, br);
    prevBearing = br;
    let text = `${turn} on ${e.street}`;
    const bits = [];
    if (e.liftId) text += `, then take lift ${e.liftId}`;
    else if (e.type === 'subway') bits.push('through the subway');
    else if (e.type === 'footbridge') bits.push('across the footbridge');
    else if (e.type === 'ramp') bits.push(`ramp, gradient ${e.gradient}%`);
    if (e.stairs) bits.push('has stairs');
    const kerbs = g.edges.filter((x) => x.kerb > 0).map((x) => x.kerb);
    if (kerbs.length) bits.push(`kerb up to ${Math.max(...kerbs)} cm`);
    if (g.edges.some((x) => x.width == null)) bits.push('width not surveyed, take care');
    const landmark = lbl(b);
    steps.push({
      index: i + 1, text: `${text}${bits.length ? ' (' + bits.join('; ') + ')' : ''} for ${Math.round(g.len)} m${landmark ? `, to ${landmark}` : ''}`,
      distanceM: Math.round(g.len), via: e.type, lift: e.liftId || null, toNode: g.toNode,
    });
  });
  steps.push({ index: steps.length + 1, text: 'You have arrived.', distanceM: 0, via: 'arrive', toNode: segs.length ? segs[segs.length - 1].to : null });
  return steps;
}

export function explainRoute(route, ctx, tree) {
  const out = [];
  const p = ctx.profile.mobility;
  out.push(`Route is ${route.distanceM} m, about ${Math.round(route.timeSec / 60 * 10) / 10} min at your travel speed, risk ${route.riskLabel}.`);
  if (p.stairs !== 'ok') out.push('Every stair segment was excluded because of your stairs setting.');
  const s = tree.stats;
  const parts = [];
  if (s.stairs) parts.push(`${Math.round(s.stairs)} stair segment(s)`);
  if (s['too-steep']) parts.push(`${Math.round(s['too-steep'])} too steep (limit ${p.maxSlopePct}%)`);
  if (s['too-narrow']) parts.push(`${Math.round(s['too-narrow'])} too narrow (min ${p.minWidthM} m)`);
  if (s['kerb-too-high']) parts.push(`${Math.round(s['kerb-too-high'])} kerb above ${p.maxKerbCm} cm`);
  if (s['lift-down'] || s['lift-unknown']) parts.push(`${Math.round((s['lift-down'] || 0) + (s['lift-unknown'] || 0))} lift link(s) with failed or unknown lift`);
  if (s['flooded'] || s['flood-prone-during-warning']) parts.push(`${Math.round((s.flooded || 0) + (s['flood-prone-during-warning'] || 0))} flooded or flood-prone segment(s)`);
  if (s['unknown-data']) parts.push(`${Math.round(s['unknown-data'])} segment(s) with missing survey data (treated as blocked)`);
  const hz = Object.keys(s).filter((k) => k.startsWith('hazard:'));
  if (hz.length) parts.push(`segments with verified hazards (${hz.map((h) => h.slice(7)).join(', ')})`);
  if (parts.length) out.push(`Avoided: ${parts.join('; ')}.`);
  if (route.liftsUsed.length) out.push(`Uses lift ${route.liftsUsed.join(', ')} (status simulated).`);
  if (route.unknownUsed) out.push('Includes segments with missing data because you allowed unknown data.');
  route.warnings.forEach((w) => out.push(`${w} nearby: treated as a penalty until staff verify it.`));
  return out;
}

export function noRoute(startId, ctx, tree) {
  let best = null;
  for (const n of nodes) if (n.refuge && tree.dist.get(n.id) < Infinity && (!best || tree.dist.get(n.id) < tree.dist.get(best.id))) best = n;
  const refuge = best ? buildRoute(tree, best.id) : null;
  return {
    found: false, reason: 'No route to this shelter satisfies your accessibility limits and the current hazards.',
    blocked: tree.stats,
    refuge: best ? { node: best.id, name: best.name || 'Covered refuge point', route: refuge } : null,
    advice: best ? ['Move to the refuge point shown and wait there.', 'Press “I need help” so an operator and your caregiver are told where you are.'] : ['Stay where you are if it is safe.', 'Press “I need help” now.', 'Call 999 if life is in danger.'],
  };
}
