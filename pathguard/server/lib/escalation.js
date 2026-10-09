// Help requests, escalation ladder, caregiver check-ins, consent-aware status.
import { db, uid, now, save, notify, audit, bus } from './store.js';

const SCALE = Number(process.env.PG_ESC_SCALE || 1);
// Seconds after creation; compressed by PG_ESC_SCALE for demos/tests.
export const LADDER = [
  { step: 0, afterSec: 0, action: 'Notify consenting caregivers and show confirmation to the user' },
  { step: 1, afterSec: 30, action: 'Repeat to caregivers; add case to operator queue' },
  { step: 2, afterSec: 90, action: 'Operator priority: attempt contact by phone' },
  { step: 3, afterSec: 180, action: 'Operator decides whether to dispatch emergency services (999)' },
];
const fail = (msg, status) => Object.assign(new Error(msg), { status });

export const caregiversOf = (userId) => db.links.filter((l) => l.userId === userId && l.status === 'active').map((l) => l.caregiverId);
export function consentFor(userId, caregiverId) {
  const c = db.consents.filter((x) => x.userId === userId && x.subject === `caregiver:${caregiverId}`).sort((a, b) => b.at - a.at)[0];
  return c?.fields || {};
}
export function setConsent(userId, caregiverId, fields) {
  const prev = db.consents.filter((x) => x.userId === userId && x.subject === `caregiver:${caregiverId}`).length;
  const f = { status: !!fields.status, location: !!fields.location, profile: !!fields.profile, alerts: !!fields.alerts };
  db.consents.push({ id: uid('cs'), userId, subject: `caregiver:${caregiverId}`, fields: f, at: now(), version: prev + 1 });
  save();
  return f;
}

export function createHelpCase(user, { position, message, source = 'user' }) {
  const open = db.cases.find((c) => c.userId === user.id && c.kind === 'help' && c.status !== 'resolved' && c.status !== 'cancelled');
  if (open) return { ...open, duplicate: true };
  const c = {
    id: uid('case'), kind: 'help', userId: user.id, userName: user.name, status: 'open', createdAt: now(), message: String(message || '').slice(0, 300),
    position: position || user.lastPosition || null, step: -1, history: [], source,
  };
  db.cases.push(c);
  audit(user, 'help.create', c.id);
  advance(c);
  return c;
}
function advance(c) {
  const elapsed = (now() - c.createdAt) / 1000;
  for (const s of LADDER) {
    if (s.step <= c.step || elapsed < s.afterSec * SCALE) continue;
    c.step = s.step;
    c.history.push({ at: now(), step: s.step, action: s.action });
    if (s.step <= 1) {
      for (const cg of caregiversOf(c.userId)) {
        const f = consentFor(c.userId, cg);
        if (f.status) notify(cg, 'help', `${c.userName} needs help${s.step ? ' (repeat)' : ''}${f.location && c.position ? ' — location shared' : ''}.`, { caseId: c.id, urgent: true });
      }
    }
    if (s.step >= 1) c.queued = true;
    if (s.step >= 2) c.priority = true;
    bus.emit('case', c);
  }
  save();
}
export function tickEscalation() {
  for (const c of db.cases) if (c.kind === 'help' && c.status === 'open' && c.step < LADDER.length - 1) advance(c);
  for (const a of db.alerts) {
    if (a.status !== 'active' || a.level < 3) continue;
    if ((now() - a.issuedAt) / 1000 < 60 * SCALE) continue;
    for (const u of db.users) {
      if (u.role !== 'user' || u.deleted || !u.lastSeenAt || now() - u.lastSeenAt > 3600e3) continue;
      if (db.acks.some((k) => k.alertId === a.id && k.userId === u.id)) continue;
      if (db.cases.some((c) => c.kind === 'unacked' && c.alertId === a.id && c.userId === u.id)) continue;
      const c = {
        id: uid('case'), kind: 'unacked', alertId: a.id, userId: u.id, userName: u.name, status: 'open', createdAt: now(),
        message: `Critical alert "${a.title}" not acknowledged`, step: 1, history: [{ at: now(), step: 1, action: 'Caregiver notified; operator queue' }], queued: true, position: u.lastPosition || null,
      };
      db.cases.push(c);
      for (const cg of caregiversOf(u.id)) if (consentFor(u.id, cg).alerts) notify(cg, 'unacked', `${u.name} has not acknowledged "${a.title}".`, { caseId: c.id });
      bus.emit('case', c);
      save();
    }
  }
  for (const k of db.checkins) {
    if (k.status === 'pending' && now() - k.createdAt > 60e3 * SCALE) {
      k.status = 'missed';
      notify(k.caregiverId, 'checkin-missed', `${k.userName} did not respond to your check-in.`, { checkinId: k.id });
      db.cases.push({ id: uid('case'), kind: 'checkin-missed', userId: k.userId, userName: k.userName, status: 'open', createdAt: now(), message: 'Caregiver check-in not answered', step: 1, history: [], queued: true });
      save();
    }
  }
}
export function createCheckin(caregiver, userId) {
  const link = db.links.find((l) => l.userId === userId && l.caregiverId === caregiver.id && l.status === 'active');
  if (!link) throw fail('Not linked to this person', 403);
  const u = db.users.find((x) => x.id === userId);
  const k = { id: uid('ck'), userId, userName: u.name, caregiverId: caregiver.id, status: 'pending', createdAt: now() };
  db.checkins.push(k);
  notify(userId, 'checkin', `${caregiver.name} is checking on you. Are you OK?`, { checkinId: k.id });
  audit(caregiver, 'checkin.create', userId);
  return k;
}
export function respondCheckin(user, id, status) {
  const k = db.checkins.find((x) => x.id === id && x.userId === user.id);
  if (!k) throw fail('Not found', 404);
  k.status = status === 'help' ? 'help' : 'ok';
  k.respondedAt = now();
  notify(k.caregiverId, 'checkin-reply', `${user.name} replied: ${k.status === 'ok' ? 'I am OK' : 'I need help'}.`, { checkinId: k.id });
  if (k.status === 'help') createHelpCase(user, { message: 'Replied "I need help" to a check-in', source: 'checkin' });
  save();
  return k;
}
// Per-field consent decides what a caregiver sees.
export function dependantsFor(caregiver) {
  return db.links.filter((l) => l.caregiverId === caregiver.id && l.status === 'active').map((l) => {
    const u = db.users.find((x) => x.id === l.userId);
    if (!u || u.deleted) return null;
    const f = consentFor(u.id, caregiver.id);
    const openCase = db.cases.find((c) => c.userId === u.id && c.status === 'open');
    const out = { id: u.id, name: u.name, consent: f };
    if (f.status) {
      out.lastSeenAt = u.lastSeenAt || null;
      out.needsHelp = !!openCase;
      out.case = openCase ? { id: openCase.id, kind: openCase.kind, createdAt: openCase.createdAt, step: openCase.step } : null;
      out.sheltered = u.sheltered || null;
    }
    if (f.location) out.position = u.lastPosition || null;
    if (f.alerts) out.unackedAlerts = db.alerts.filter((a) => a.status === 'active' && !db.acks.some((k) => k.alertId === a.id && k.userId === u.id)).map((a) => ({ id: a.id, title: a.title, severity: a.severity }));
    out.checkins = db.checkins.filter((k) => k.userId === u.id && k.caregiverId === caregiver.id).slice(-3);
    return out;
  }).filter(Boolean);
}
export function updateCase(actor, id, action, body = {}) {
  const c = db.cases.find((x) => x.id === id);
  if (!c) throw fail('Not found', 404);
  if (action === 'ack') { c.status = 'acknowledged'; c.ackBy = actor.name; }
  else if (action === 'assign') { c.assignee = body.assignee || actor.name; if (c.status === 'open') c.status = 'acknowledged'; }
  else if (action === 'resolve') { c.status = 'resolved'; c.resolvedAt = now(); c.resolution = String(body.note || '').slice(0, 300); notify(c.userId, 'case', 'Your help request was marked resolved by an operator.'); }
  else throw fail('Bad action', 400);
  c.history.push({ at: now(), step: c.step, action: `${action} by ${actor.name}` });
  audit(actor, `case.${action}`, id);
  save();
  bus.emit('case', c);
  return c;
}
export function cancelCase(user, id) {
  const c = db.cases.find((x) => x.id === id && x.userId === user.id);
  if (!c) throw fail('Not found', 404);
  c.status = 'cancelled';
  c.history.push({ at: now(), step: c.step, action: 'cancelled by user' });
  save();
  return c;
}
