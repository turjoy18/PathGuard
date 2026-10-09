// Context builder + shelter matching + planning + rerouting (all deterministic).
import { db, decrypt } from './store.js';
import { liftStatus, floodSpots, shelterList, activeHazards, spotsOnEdge, sim } from './world.js';
import { floodMode } from './weather.js';
import { dijkstra, buildRoute, explainRoute, noRoute, getNode, evalEdge } from './routing.js';
import { nearestNode, edges } from './demo-data.js';
import { distM } from './geo.js';
import { needsStepFree, normaliseProfile } from './profile.js';

const edgeMap = new Map(edges.map((e) => [e.id, e]));

export function buildCtx(profile, extra = {}) {
  return {
    profile,
    lifts: Object.fromEntries(liftStatus().map((l) => [l.id, l.status])),
    floodedSpots: new Set(floodSpots().filter((s) => s.floodedNow).map((s) => s.id)),
    spotsOnEdge, floodMode: floodMode(),
    hazards: activeHazards().map((h) => ({ edgeId: h.edgeId, type: h.type, status: h.status })),
    ...extra,
  };
}
export function profileOf(userId) {
  const raw = userId && db.profiles[userId];
  return normaliseProfile(raw ? decrypt(raw) : {});
}
export function resolveOrigin(o) {
  if (o?.node && getNode(o.node)) return getNode(o.node);
  if (Number.isFinite(o?.lat) && Number.isFinite(o?.lng)) return nearestNode(o).node;
  return getNode('n1_5');
}

export const WEIGHTS = { time: 0.35, risk: 0.25, capacity: 0.15, facilities: 0.15, fresh: 0.10 };

function hardFilters(s, profile) {
  const why = [];
  if (!s.open) why.push('Shelter is closed');
  if (s.capacity - s.occupancy <= 0) why.push('Shelter is full');
  if (needsStepFree(profile) && !s.stepFree) why.push('No step-free entrance');
  if (profile.needs.toilet && !s.accessibleToilet) why.push('No accessible toilet');
  if (profile.needs.power && !s.power) why.push('No backup power');
  if (profile.needs.assistanceAnimal && !s.animals) why.push('Assistance animals not confirmed');
  return why;
}
function facilityScore(s, p) {
  const wants = [s.accessibleToilet, s.power];
  if (p.needs.quiet) wants.push(s.quiet);
  if (p.hearing.signLanguage || p.hearing.level === 'deaf') wants.push(s.signLanguage);
  if (p.mobility.wheelchair !== 'none') wants.push(s.lift);
  return wants.filter(Boolean).length / wants.length;
}

export function matchShelters(originNode, profile, ctx, limit = 3) {
  const t0 = performance.now();
  const tree = dijkstra(originNode.id, ctx);
  const rows = shelterList().map((s) => {
    const straight = Math.round(distM(originNode, getNode(s.node)));
    const reasons = hardFilters(s, profile);
    let route = null;
    if (!reasons.length) {
      route = buildRoute(tree, s.node);
      if (!route) reasons.push('No accessible route from your position');
    }
    return { s, straight, reasons, route };
  });
  const ok = rows.filter((r) => !r.reasons.length);
  const maxT = Math.max(600, ...ok.map((r) => r.route.timeSec));
  for (const r of ok) {
    const f = {
      time: 1 - r.route.timeSec / (maxT * 1.1), risk: 1 - Math.min(1, r.route.risk * 2),
      capacity: Math.min(1, ((r.s.capacity - r.s.occupancy) / r.s.capacity) * 1.5), facilities: facilityScore(r.s, profile),
      fresh: 1 - Math.min(r.s.updatedMinutesAgo, 180) / 180,
    };
    r.factors = f;
    r.score = Math.round(Object.entries(WEIGHTS).reduce((a, [k, w]) => a + f[k] * w, 0) * 1000) / 1000;
  }
  ok.sort((a, b) => b.score - a.score);
  const best = ok[0];
  const pub = (r, rank) => {
    const n = getNode(r.s.node);
    return {
      rank, score: r.score, factors: r.factors, straightLineM: r.straight,
      routeSummary: { distanceM: r.route.distanceM, timeSec: r.route.timeSec, risk: r.route.riskLabel },
      shelter: {
        id: r.s.id, name: r.s.name, address: r.s.address, node: r.s.node, lat: n.lat, lng: n.lng, capacity: r.s.capacity, occupancy: r.s.occupancy,
        updatedMinutesAgo: r.s.updatedMinutesAgo, simulated: true,
        features: { stepFree: r.s.stepFree, lift: r.s.lift, accessibleToilet: r.s.accessibleToilet, power: r.s.power, quiet: r.s.quiet, signLanguage: r.s.signLanguage, animals: r.s.animals },
      },
    };
  };
  const ranked = ok.map((r, i) => pub(r, i + 1));
  const rejectedNearer = best
    ? rows.filter((r) => r !== best && r.straight < best.straight && (r.reasons.length || ok.indexOf(r) > 0))
      .map((r) => ({ id: r.s.id, name: r.s.name, straightLineM: r.straight, reasons: r.reasons.length ? r.reasons : [`Scored lower (${r.score}) than ${best.s.name} (${best.score})`] }))
    : [];
  const rejected = rows.filter((r) => r.reasons.length).map((r) => ({ id: r.s.id, name: r.s.name, straightLineM: r.straight, reasons: r.reasons }));
  return {
    origin: { node: originNode.id, name: originNode.name, lat: originNode.lat, lng: originNode.lng },
    recommended: ranked[0] || null, alternatives: ranked.slice(1, limit), rejected, rejectedNearer, weights: WEIGHTS,
    why: best ? whyText(best, rejectedNearer, profile) : ['No shelter passes your hard requirements with a reachable route.'],
    tree, ms: Math.round((performance.now() - t0) * 10) / 10, simulated: true,
  };
}
function whyText(best, rejectedNearer, profile) {
  const w = [
    `${best.s.name}: ${best.route.distanceM} m, about ${Math.max(1, Math.round(best.route.timeSec / 60))} min by an accessible route, risk ${best.route.riskLabel}.`,
    `Meets your requirements${needsStepFree(profile) ? ': step-free entrance' : ''}${profile.needs.toilet ? ', accessible toilet' : ''}${profile.needs.power ? ', backup power' : ''}.`,
    `Capacity margin ${best.s.capacity - best.s.occupancy} places; record updated ${best.s.updatedMinutesAgo} min ago (simulated).`,
  ];
  for (const r of rejectedNearer.slice(0, 3)) w.push(`Not ${r.name} (${r.straightLineM} m away, closer): ${r.reasons[0]}.`);
  return w;
}

const strip = ({ tree, ...rest }) => rest;

export function plan({ userId, profile, origin, shelterId, ctxExtra }) {
  const t0 = performance.now();
  const prof = profile || profileOf(userId);
  const ctx = buildCtx(prof, ctxExtra);
  const o = resolveOrigin(origin);
  const m = matchShelters(o, prof, ctx);
  const pool = [m.recommended, ...m.alternatives].filter(Boolean);
  let target = shelterId ? pool.find((r) => r.shelter.id === shelterId) : m.recommended;
  if (shelterId && !target) {
    // user-chosen shelter outside the shortlist: try it directly, else explain
    const rej = m.rejected.find((r) => r.id === shelterId);
    if (rej) return { ok: false, ...strip(m), noRoute: noRoute(o.id, ctx, m.tree), message: `${rej.name} cannot be used: ${rej.reasons.join('; ')}.` };
    target = m.recommended;
  }
  if (!target) return { ok: false, ...strip(m), noRoute: noRoute(o.id, ctx, m.tree), message: 'No shelter is currently reachable for your profile.', ms: Math.round(performance.now() - t0) };
  const route = buildRoute(m.tree, target.shelter.node);
  route.explanation = explainRoute(route, ctx, m.tree);
  return { ok: true, ...strip(m), target, route, floodMode: ctx.floodMode, simulationActive: sim.active, ms: Math.round((performance.now() - t0) * 10) / 10, createdAt: Date.now() };
}

// Replan from the current position. Stability: keep the old route if it is still valid and the new one is <12% faster.
export function reroute({ userId, profile, position, shelterId, previous, reason }) {
  const t0 = performance.now();
  const prof = profile || profileOf(userId);
  const ctx = buildCtx(prof);
  const o = resolveOrigin(position);
  const m = matchShelters(o, prof, ctx);
  const tree = m.tree;
  const current = shelterList().find((s) => s.id === shelterId);
  const usable = current && !hardFilters(current, prof).length && buildRoute(tree, current.node);
  let target = current, shelterChanged = false, why = reason || 'Conditions changed';
  if (!usable) {
    shelterChanged = true;
    why = current && current.occupancy >= current.capacity ? `${current.name} is full` : `${current?.name || 'Previous shelter'} can no longer be reached or used with your profile`;
    target = m.recommended ? shelterList().find((s) => s.id === m.recommended.shelter.id) : null;
  }
  const ms = () => Math.round((performance.now() - t0) * 10) / 10;
  if (!target) return { ok: false, reason: why, noRoute: noRoute(o.id, ctx, tree), message: 'No safe shelter is reachable. Go to the refuge point (if shown) and request help.', ms: ms() };
  const route = buildRoute(tree, target.node);
  route.explanation = explainRoute(route, ctx, tree);
  let kept = false;
  const differs = !previous?.edgeIds || previous.edgeIds.join() !== route.edgeIds.join();
  if (previous?.edgeIds && !shelterChanged && differs) {
    const stillValid = previous.edgeIds.every((id) => edgeMap.get(id) && !evalEdge(edgeMap.get(id), ctx).blocked);
    if (stillValid && previous.timeSec && route.timeSec > previous.timeSec * 0.88) kept = true;
  }
  const changed = differs && !kept;
  return {
    ok: true, kept, changed, shelterChanged, reason: why, route, shelter: { id: target.id, name: target.name, node: target.node },
    explanation: changed ? `Route changed because: ${why}. ${route.explanation[0]}` : 'Your current route is still the best safe option.',
    ms: ms(), simulated: sim.active,
  };
}
