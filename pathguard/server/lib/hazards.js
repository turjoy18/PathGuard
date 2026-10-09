import { db, uid, now, save, audit, notify, bus } from './store.js';
import { nearestEdge } from './demo-data.js';
import { HAZARD_TYPES, activeHazards } from './world.js';

const RATE = { windowMs: 3600e3, max: 5 };
const fail = (msg, status) => Object.assign(new Error(msg), { status });

export function submitHazard(user, { type, lat, lng, note, photo, voiceText }) {
  if (user.banned || user.trust < 0.15) throw fail('Reporting is paused for this account', 403);
  if (!HAZARD_TYPES[type]) throw fail('Unknown hazard type', 400);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw fail('Location required', 400);
  const recent = db.hazards.filter((h) => h.userId === user.id && now() - h.createdAt < RATE.windowMs).length;
  if (recent >= RATE.max) throw fail('Report limit reached (5 per hour)', 429);
  if (photo && (typeof photo !== 'string' || !/^data:image\/(png|jpe?g|webp);base64,/.test(photo) || photo.length > 400_000)) throw fail('Photo must be a small PNG/JPEG/WebP', 400);
  const { edge, distance } = nearestEdge({ lat, lng });
  if (distance > 120) throw fail('Location is outside the covered area', 400);
  const text = String(note || voiceText || '').slice(0, 280);
  const dup = db.hazards.find((h) => (h.status === 'pending' || h.status === 'verified') && h.type === type && h.edgeId === edge.id && h.userId !== user.id);
  if (dup) {
    if (!dup.corroborations.includes(user.id)) { dup.corroborations.push(user.id); dup.trust = trustOf(dup, db.users.find((u) => u.id === dup.userId) || user); }
    audit(user, 'hazard.corroborate', dup.id);
    save();
    bus.emit('world', { reason: 'hazard' });
    return { hazard: pub(dup), corroborated: true };
  }
  const h = { id: uid('hz'), userId: user.id, type, lat, lng, edgeId: edge.id, note: text, photo: photo || null, hasVoice: !!voiceText, status: 'pending', corroborations: [], createdAt: now(), expiresAt: now() + HAZARD_TYPES[type] };
  h.trust = trustOf(h, user);
  db.hazards.push(h);
  audit(user, 'hazard.create', h.id, { type, edge: edge.id });
  save();
  bus.emit('world', { reason: 'hazard' });
  return { hazard: pub(h), corroborated: false };
}
function trustOf(h, user) {
  return Math.round(Math.min(1, user.trust * 0.6 + Math.min(0.3, h.corroborations.length * 0.15) + (h.photo ? 0.1 : 0)) * 100) / 100;
}
export const pub = (h) => ({
  id: h.id, type: h.type, lat: h.lat, lng: h.lng, edgeId: h.edgeId, note: h.note, status: h.status, trust: h.trust, corroborations: h.corroborations.length,
  createdAt: h.createdAt, expiresAt: h.expiresAt, hasPhoto: !!h.photo, unverified: h.status !== 'verified',
});
export const publicHazards = () => activeHazards().map(pub);
export function queue() {
  return activeHazards().filter((h) => h.status === 'pending').sort((a, b) => b.trust - a.trust)
    .map((h) => ({ ...pub(h), photo: h.photo, reporter: db.users.find((u) => u.id === h.userId)?.name || '?' }));
}
export function moderate(actor, id, verdict) {
  const h = db.hazards.find((x) => x.id === id);
  if (!h) throw fail('Not found', 404);
  const reporter = db.users.find((u) => u.id === h.userId);
  if (verdict === 'verify') { h.status = 'verified'; h.verifiedBy = actor.name; if (reporter) reporter.trust = Math.min(1, reporter.trust + 0.1); }
  else if (verdict === 'reject') { h.status = 'rejected'; h.verifiedBy = actor.name; if (reporter) { reporter.trust = Math.max(0, reporter.trust - 0.2); if (reporter.trust < 0.15) reporter.banned = true; } }
  else throw fail('Bad verdict', 400);
  audit(actor, `hazard.${verdict}`, id);
  save();
  bus.emit('world', { reason: 'hazard-moderated' });
  if (reporter && verdict === 'verify') notify(reporter.id, 'hazard', 'Your hazard report was verified. Thank you.');
  return pub(h);
}
