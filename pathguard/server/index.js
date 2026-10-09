import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db, uid, now, save, audit, notify, bus, encrypt, decrypt } from './lib/store.js';
import { verify, sign, checkPw, hasRole, createUser, seedDemoUsers, publicUser } from './lib/auth.js';
import { DEFAULT_PROFILE, normaliseProfile } from './lib/profile.js';
import { nodes, edges, landmarks, MARINE_TYPHOON_SHELTER_NOTE, replayScript } from './lib/demo-data.js';
import { liftStatus, floodSpots, shelterList, sim, simAction } from './lib/world.js';
import { weatherSnapshot, refreshHko, syncAlerts, tickWeather } from './lib/weather.js';
import { plan, reroute, profileOf } from './lib/planner.js';
import { submitHazard, publicHazards, queue as hazardQueue, moderate } from './lib/hazards.js';
import { createHelpCase, cancelCase, createCheckin, respondCheckin, dependantsFor, updateCase, tickEscalation, setConsent, consentFor, LADDER } from './lib/escalation.js';
import { handle as agentHandle, confirmAction, TOOLS } from './lib/agent.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const WEB = path.join(here, '../web');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };

const fail = (status, message) => Object.assign(new Error(message), { status });
const routes = [];
const route = (method, pattern, min, handler) => routes.push({ method, re: new RegExp('^' + pattern.replace(/:(\w+)/g, '(?<$1>[^/]+)') + '$'), min, handler });

// ---------- rate limiting ----------
const hits = new Map();
function limited(key, max, windowMs = 60_000) {
  const t = now(); const arr = (hits.get(key) || []).filter((x) => t - x < windowMs); arr.push(t); hits.set(key, arr);
  return arr.length > max;
}
setInterval(() => { for (const [k, v] of hits) if (!v.some((x) => now() - x < 120_000)) hits.delete(k); }, 60_000).unref();

// ---------- auth ----------
route('POST', '/api/auth/login', null, (r) => {
  const { username, password } = r.body;
  const u = db.users.find((x) => x.username === String(username || '').toLowerCase() && !x.deleted);
  if (!u || !u.pw || !checkPw(String(password || ''), u.pw)) throw fail(401, 'Wrong username or password');
  audit(u, 'auth.login', u.id);
  return { token: sign(u), user: publicUser(u) };
});
route('POST', '/api/auth/guest', null, (r) => {
  const u = createUser({ name: String(r.body.name || 'Guest').slice(0, 40), role: 'user' });
  u.guest = true; save();
  return { token: sign(u), user: publicUser(u) };
});
route('POST', '/api/auth/register', null, (r) => {
  const { name, username, password } = r.body;
  if (!/^[a-z0-9_]{3,20}$/i.test(username || '')) throw fail(400, 'Username must be 3-20 letters, numbers or _');
  if (String(password || '').length < 6) throw fail(400, 'Password must be at least 6 characters');
  if (db.users.some((x) => x.username === username.toLowerCase())) throw fail(409, 'Username taken');
  const u = createUser({ name: String(name || username).slice(0, 40), username: username.toLowerCase(), password });
  return { token: sign(u), user: publicUser(u) };
});
route('GET', '/api/me', 'guest', (r) => ({ user: publicUser(r.user), unread: db.notifications.filter((n) => n.userId === r.user.id && !n.read).length }));
route('DELETE', '/api/me', 'guest', (r) => {
  const id = r.user.id;
  delete db.profiles[id];
  db.consents = db.consents.filter((c) => c.userId !== id); db.links = db.links.filter((l) => l.userId !== id && l.caregiverId !== id);
  db.hazards.forEach((h) => { if (h.userId === id) { h.userId = 'deleted'; h.photo = null; } });
  db.cases = db.cases.filter((c) => c.userId !== id); db.checkins = db.checkins.filter((c) => c.userId !== id && c.caregiverId !== id);
  db.notifications = db.notifications.filter((n) => n.userId !== id); db.acks = db.acks.filter((a) => a.userId !== id);
  r.user.deleted = true; r.user.name = 'Deleted user'; r.user.username = null; r.user.pw = null; db.deletedUsers++;
  audit('system', 'account.delete', 'redacted'); save();
  return { deleted: true };
});

// ---------- profile & consent ----------
route('GET', '/api/profile', 'user', (r) => ({ profile: profileOf(r.user.id), saved: !!db.profiles[r.user.id], defaults: DEFAULT_PROFILE }));
route('PUT', '/api/profile', 'user', (r) => {
  const p = normaliseProfile(r.body.profile || r.body);
  db.profiles[r.user.id] = encrypt(p);
  if (!db.consents.some((c) => c.userId === r.user.id && c.subject === 'profile-processing')) db.consents.push({ id: uid('cs'), userId: r.user.id, subject: 'profile-processing', fields: { accepted: !!r.body.consent }, at: now(), version: 1 });
  audit(r.user, 'profile.update', r.user.id, { fields: 'redacted' }); save();
  return { profile: p };
});
route('GET', '/api/consents', 'user', (r) => ({
  links: db.links.filter((l) => l.userId === r.user.id && l.status === 'active').map((l) => { const c = db.users.find((u) => u.id === l.caregiverId); return { id: l.id, caregiverId: l.caregiverId, name: c?.name, fields: consentFor(r.user.id, l.caregiverId) }; }),
  history: db.consents.filter((c) => c.userId === r.user.id).slice(-20).map((c) => ({ subject: c.subject, fields: c.fields, at: c.at, version: c.version })),
}));
route('POST', '/api/links', 'user', (r) => {
  const cg = db.users.find((u) => u.username === String(r.body.username || '').toLowerCase() && u.role === 'caregiver' && !u.deleted);
  if (!cg) throw fail(404, 'No caregiver account with that username');
  if (!db.links.some((l) => l.userId === r.user.id && l.caregiverId === cg.id && l.status === 'active')) db.links.push({ id: uid('lk'), userId: r.user.id, caregiverId: cg.id, status: 'active', createdAt: now() });
  setConsent(r.user.id, cg.id, r.body.fields || { status: true }); audit(r.user, 'link.create', cg.id);
  return { ok: true };
});
route('PUT', '/api/links/:id', 'user', (r) => {
  const l = db.links.find((x) => x.id === r.params.id && x.userId === r.user.id);
  if (!l) throw fail(404, 'Not found');
  const f = setConsent(r.user.id, l.caregiverId, r.body.fields || {}); audit(r.user, 'consent.update', l.caregiverId);
  return { fields: f };
});
route('DELETE', '/api/links/:id', 'user', (r) => {
  const l = db.links.find((x) => x.id === r.params.id && x.userId === r.user.id);
  if (!l) throw fail(404, 'Not found');
  l.status = 'revoked'; setConsent(r.user.id, l.caregiverId, {}); audit(r.user, 'link.revoke', l.caregiverId);
  return { ok: true };
});

// ---------- weather, alerts ----------
route('GET', '/api/weather', 'guest', async () => { await refreshHko(); syncAlerts(); return weatherSnapshot(); });
route('GET', '/api/alerts', 'guest', async (r) => {
  await refreshHko(); syncAlerts();
  const mine = (a) => ({ ...a, acknowledged: db.acks.some((k) => k.alertId === a.id && k.userId === r.user.id) });
  return { active: db.alerts.filter((a) => a.status === 'active').map(mine), history: db.alerts.filter((a) => a.status !== 'active').slice(-30).reverse().map(mine) };
});
route('POST', '/api/alerts/:id/ack', 'guest', (r) => {
  const a = db.alerts.find((x) => x.id === r.params.id);
  if (!a) throw fail(404, 'Not found');
  if (!db.acks.some((k) => k.alertId === a.id && k.userId === r.user.id)) db.acks.push({ alertId: a.id, userId: r.user.id, at: now() });
  save(); return { ok: true };
});
route('POST', '/api/ops/publish', 'operator', (r) => {
  const text = String(r.body.text || '').trim().slice(0, 280);
  if (!text) throw fail(400, 'Text required');
  const level = [1, 2, 3, 4].includes(+r.body.level) ? +r.body.level : 2;
  const a = { id: uid('al'), key: `OP:${uid('k')}`, code: 'OPERATOR', title: 'Operator notice', level, severity: ['', 'advisory', 'alert', 'severe', 'critical'][level], text, simple: text, zh: text,
    vibration: [200, 100, 200], pulseHz: 0.8, simulated: false, source: 'Operator (not an official HKO warning)', issuedAt: now(), status: 'active', manual: true };
  db.alerts.push(a); audit(r.user, 'alert.publish', a.id); save(); bus.emit('alerts', {});
  return a;
});
route('POST', '/api/ops/alerts/:id/clear', 'operator', (r) => {
  const a = db.alerts.find((x) => x.id === r.params.id && x.manual);
  if (!a) throw fail(404, 'Only operator notices can be cleared manually');
  a.status = 'cleared'; a.clearedAt = now(); audit(r.user, 'alert.clear', a.id); save(); bus.emit('alerts', {});
  return { ok: true };
});

// ---------- map, planning ----------
route('GET', '/api/map', 'guest', () => ({
  simulated: true, note: 'Geometry, lifts, shelters and statuses are SYNTHETIC demo data. See /api/sources.',
  nodes: nodes.map((n) => ({ id: n.id, lat: n.lat, lng: n.lng, name: n.name, refuge: n.refuge, covered: n.covered })),
  edges: edges.map((e) => ({ id: e.id, a: e.a, b: e.b, street: e.street, type: e.type, width: e.width, gradient: e.gradient, kerb: e.kerb, stairs: e.stairs, liftId: e.liftId, floodProne: e.floodProne, length: e.length })),
  lifts: liftStatus(), blackspots: floodSpots(), shelters: shelterList().map(({ ...s }) => { const n = nodes.find((x) => x.id === s.node); return { ...s, lat: n.lat, lng: n.lng }; }),
  hazards: publicHazards(), landmarks, tcTrack: weatherSnapshot().tcTrack, marineNote: MARINE_TYPHOON_SHELTER_NOTE,
}));
route('GET', '/api/shelters', 'guest', () => shelterList());
route('POST', '/api/position', 'guest', (r) => {
  const b = r.body;
  if (b.node && /^n\d+_\d+$/.test(b.node)) r.user.lastNode = b.node;
  r.user.lastPosition = { node: r.user.lastNode || null, lat: +b.lat || null, lng: +b.lng || null, at: now() }; save();
  return { ok: true };
});
route('POST', '/api/plan', 'guest', (r) => {
  if (r.body.node) r.user.lastNode = r.body.node;
  const out = plan({ userId: r.user.id, profile: r.body.profile ? normaliseProfile(r.body.profile) : undefined, origin: r.body, shelterId: r.body.shelterId });
  if (out.ok) { r.user.sheltered = { shelterId: out.target.shelter.id, name: out.target.shelter.name, at: now() }; }
  return out;
});
route('POST', '/api/reroute', 'guest', (r) => reroute({ userId: r.user.id, profile: r.body.profile ? normaliseProfile(r.body.profile) : undefined, position: r.body.position || r.body, shelterId: r.body.shelterId, previous: r.body.previous, reason: String(r.body.reason || '').slice(0, 120) }));

// ---------- hazards ----------
route('GET', '/api/hazards', 'guest', () => publicHazards());
route('POST', '/api/hazards', 'user', (r) => submitHazard(r.user, r.body));
route('GET', '/api/staff/hazards', 'staff', () => hazardQueue());
route('POST', '/api/staff/hazards/:id/:verdict', 'staff', (r) => moderate(r.user, r.params.id, r.params.verdict));

// ---------- help, check-ins, caregiver ----------
route('POST', '/api/help', 'user', (r) => createHelpCase(r.user, { position: r.user.lastPosition, message: r.body.message }));
route('GET', '/api/help/mine', 'user', (r) => db.cases.filter((c) => c.userId === r.user.id).slice(-5).reverse());
route('POST', '/api/help/:id/cancel', 'user', (r) => cancelCase(r.user, r.params.id));
route('GET', '/api/caregiver/dependants', 'caregiver', (r) => {
  if (r.user.role !== 'caregiver' && !hasRole(r.user, 'operator')) throw fail(403, 'Caregiver account required');
  return dependantsFor(r.user);
});
route('POST', '/api/checkins', 'caregiver', (r) => createCheckin(r.user, r.body.userId));
route('POST', '/api/checkins/:id/respond', 'user', (r) => respondCheckin(r.user, r.params.id, r.body.status));
route('GET', '/api/notifications', 'guest', (r) => db.notifications.filter((n) => n.userId === r.user.id).slice(-30).reverse());
route('POST', '/api/notifications/read', 'guest', (r) => { db.notifications.forEach((n) => { if (n.userId === r.user.id) n.read = true; }); save(); return { ok: true }; });

// ---------- staff & operator ----------
route('PUT', '/api/staff/shelters/:id', 'staff', (r) => {
  const s = shelterList().find((x) => x.id === r.params.id);
  if (!s) throw fail(404, 'Not found');
  const b = r.body, o = db.shelterOverrides[s.id] || {};
  const bools = ['open', 'stepFree', 'lift', 'accessibleToilet', 'power', 'quiet', 'signLanguage', 'animals'];
  for (const k of bools) if (typeof b[k] === 'boolean') o[k] = b[k];
  if (Number.isFinite(+b.occupancy)) o.occupancy = Math.max(0, Math.min(s.capacity * 2, Math.round(+b.occupancy)));
  o.updatedAt = now(); db.shelterOverrides[s.id] = o;
  audit(r.user, 'shelter.update', s.id, b); save(); bus.emit('world', { reason: 'shelter' });
  return shelterList().find((x) => x.id === s.id);
});
route('GET', '/api/ops/cases', 'operator', () => {
  tickEscalation();
  return db.cases.filter((c) => c.status !== 'cancelled').sort((a, b) => (b.priority ? 1 : 0) - (a.priority ? 1 : 0) || b.createdAt - a.createdAt).map((c) => ({ ...c, ladder: LADDER }));
});
route('POST', '/api/ops/cases/:id/:action', 'operator', (r) => updateCase(r.user, r.params.id, r.params.action, r.body));
route('GET', '/api/ops/audit', 'operator', () => db.audit.slice(-200).reverse());
route('GET', '/api/ops/stats', 'operator', () => ({ users: db.users.filter((u) => !u.deleted).length, openCases: db.cases.filter((c) => c.status === 'open').length, pendingHazards: db.hazards.filter((h) => h.status === 'pending').length, activeAlerts: db.alerts.filter((a) => a.status === 'active').length, traces: db.agentTraces.length }));
route('GET', '/api/ops/traces', 'operator', () => db.agentTraces.slice(-50).reverse());
route('GET', '/api/sim', 'operator', () => ({ ...sim, lifts: sim.lifts, floods: [...sim.floods], full: [...sim.full], replayScript }));
route('POST', '/api/sim', 'operator', (r) => { try { simAction(r.user, r.body.action, r.body.arg); } catch (e) { throw fail(400, e.message); } syncAlerts(); return { ...sim, floods: [...sim.floods], full: [...sim.full] }; });

// ---------- agent ----------
route('POST', '/api/agent', 'guest', (r) => agentHandle(r.user, r.body));
route('POST', '/api/agent/confirm', 'guest', (r) => confirmAction(r.user, r.body.token, !!r.body.accept));
route('GET', '/api/agent/tools', 'operator', () => Object.entries(TOOLS).map(([name, t]) => ({ name, tag: t.tag, desc: t.desc || null })));

// ---------- meta ----------
route('GET', '/api/health', null, () => ({ ok: true, time: now(), simulation: sim.active }));
route('GET', '/api/sources', null, () => ({
  register: [
    { id: 'S1', name: 'HKO open data (warnsum, rhrread)', use: 'Live warnings, rainfall, temperature', status: 'LIVE when reachable; verified in this build', licence: '[U] confirm on data.gov.hk', cadence: 'polled every 60 s' },
    { id: 'S2', name: 'Lands Dept 3D Pedestrian Network', use: 'Accessible walking network', status: 'NOT BUNDLED: synthetic demo network used', licence: '[U]', cadence: 'quarterly [U]' },
    { id: 'S3', name: 'DSD Flooding Blackspots', use: 'Flood-prone places', status: 'NOT BUNDLED: 4 synthetic blackspots', licence: '[U]', cadence: 'static' },
    { id: 'S4', name: 'HAD temporary shelters', use: 'Human shelters', status: 'NOT BUNDLED: 6 synthetic shelters; no capacity/accessibility fields exist in open data', licence: '[U]', cadence: 'n/a' },
    { id: 'S5', name: 'Marine Dept typhoon shelters', use: 'NOT USED for people (vessel shelters)', status: 'excluded', licence: '[U]', cadence: 'n/a' },
  ], simulatedLayers: ['lift status', 'shelter capacity and features', 'hazard events', 'climate percentiles'],
}));

// ---------- SSE ----------
const clients = new Set();
function broadcast(event, data, only) { for (const c of clients) if (!only || c.user.id === only) c.res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); }
bus.on('world', (d) => broadcast('world', d));
bus.on('alerts', (d) => broadcast('alerts', d));
bus.on('notify', (n) => broadcast('notify', n, n.userId));
bus.on('case', (c) => broadcast('case', { id: c.id }));

// ---------- HTTP ----------
const SEC = {
  'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer', 'x-frame-options': 'DENY', 'permissions-policy': 'geolocation=(self), camera=(self), microphone=(self)',
  'content-security-policy': "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'",
};
const send = (res, status, body, headers = {}) => { res.writeHead(status, { ...SEC, ...headers }); res.end(body); };
const sendJson = (res, status, obj) => send(res, status, JSON.stringify(obj), { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });

async function readBody(req) {
  const chunks = []; let n = 0;
  for await (const c of req) { n += c.length; if (n > 700_000) throw fail(413, 'Body too large'); chunks.push(c); }
  if (!n) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw fail(400, 'Invalid JSON'); }
}

export const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    if (url.pathname === '/api/events') {
      const user = verify(url.searchParams.get('token'));
      if (!user) return sendJson(res, 401, { error: 'Sign in required' });
      res.writeHead(200, { ...SEC, 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
      res.write('retry: 3000\n\n');
      const c = { res, user }; clients.add(c); req.on('close', () => clients.delete(c));
      return;
    }
    if (url.pathname.startsWith('/api/')) {
      const ip = req.socket.remoteAddress || '?';
      const strict = url.pathname.startsWith('/api/auth/');
      if (limited(`${ip}:${strict ? 'auth' : 'api'}`, strict ? 20 : 600)) return sendJson(res, 429, { error: 'Too many requests' });
      const hit = routes.find((rt) => rt.method === req.method && rt.re.test(url.pathname));
      if (!hit) return sendJson(res, 404, { error: 'Not found' });
      const token = (req.headers.authorization || '').replace(/^Bearer /, '');
      const user = verify(token);
      if (hit.min && !user) return sendJson(res, 401, { error: 'Sign in required' });
      if (hit.min && !hasRole(user, hit.min) && !(hit.min === 'caregiver' && user.role === 'caregiver')) return sendJson(res, 403, { error: 'Not allowed for your role' });
      if (user) { user.lastSeenAt = now(); }
      const params = hit.re.exec(url.pathname).groups || {};
      const body = req.method === 'GET' || req.method === 'DELETE' ? {} : await readBody(req);
      const out = await hit.handler({ user, params, body, query: url.searchParams });
      return sendJson(res, 200, out ?? { ok: true });
    }
    // static
    let p = decodeURIComponent(url.pathname); if (p === '/') p = '/index.html';
    const file = path.normalize(path.join(WEB, p));
    if (!file.startsWith(WEB)) return send(res, 403, 'Forbidden');
    fs.readFile(file, (err, data) => {
      if (err) { return fs.readFile(path.join(WEB, 'index.html'), (e2, d2) => (e2 ? send(res, 404, 'Not found') : send(res, 200, d2, { 'content-type': MIME['.html'] }))); }
      send(res, 200, data, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': p === '/sw.js' ? 'no-cache' : 'public, max-age=60' });
    });
  } catch (e) {
    const status = e.status || 500;
    if (status === 500) console.error(e);
    sendJson(res, status, { error: status === 500 ? 'Server error' : e.message });
  }
});

export function start(port = Number(process.env.PORT || 3000)) {
  seedDemoUsers();
  const alex = db.users.find((u) => u.username === 'alex');
  if (alex && !db.profiles[alex.id]) db.profiles[alex.id] = encrypt(normaliseProfile({ mobility: { wheelchair: 'manual' }, needs: { toilet: true } }));
  tickWeather();
  setInterval(tickWeather, 60_000).unref();
  setInterval(() => { try { tickEscalation(); } catch (e) { console.error(e); } }, 5_000).unref();
  setInterval(() => { for (const c of clients) c.res.write(': ping\n\n'); }, 25_000).unref();
  return new Promise((resolve) => server.listen(port, () => { console.log(`PathGuard running at http://localhost:${server.address().port}`); resolve(server); }));
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) start();
void decrypt;
void notify;
