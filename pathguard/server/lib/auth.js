import crypto from 'node:crypto';
import { db, uid, now, save, audit } from './store.js';

const SECRET = process.env.PG_SECRET || crypto.randomBytes(32).toString('hex');
const TTL = 12 * 3600 * 1000;
export const ROLES = ['guest', 'user', 'caregiver', 'staff', 'operator'];
const rank = { guest: 0, user: 1, caregiver: 1, staff: 2, operator: 3 };

export const hashPw = (pw, salt = crypto.randomBytes(16).toString('hex')) => `${salt}:${crypto.scryptSync(pw, salt, 32).toString('hex')}`;
export function checkPw(pw, stored) {
  const [salt, h] = stored.split(':');
  const a = Buffer.from(crypto.scryptSync(pw, salt, 32).toString('hex')), b = Buffer.from(h);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
export function sign(user) {
  const body = Buffer.from(JSON.stringify({ id: user.id, role: user.role, exp: now() + TTL })).toString('base64url');
  return `${body}.${crypto.createHmac('sha256', SECRET).update(body).digest('base64url')}`;
}
export function verify(token) {
  if (!token) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const exp = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  if (sig.length !== exp.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(exp))) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (p.exp < now()) return null;
    const u = db.users.find((x) => x.id === p.id);
    return u && !u.deleted ? u : null;
  } catch { return null; }
}
export const hasRole = (u, min) => !!u && rank[u.role] >= rank[min];

export function createUser({ name, role = 'user', username, password, lang = 'en' }) {
  const u = { id: uid('u'), name, role, username: username || null, pw: password ? hashPw(password) : null, lang, createdAt: now(), trust: 0.5, banned: false };
  db.users.push(u); save(); return u;
}
export function seedDemoUsers() {
  if (db.users.some((u) => u.username === 'alex')) return;
  const alex = createUser({ name: 'Alex Chan', role: 'user', username: 'alex', password: 'demo' });
  const grace = createUser({ name: 'Grace Chan', role: 'caregiver', username: 'grace', password: 'demo' });
  createUser({ name: 'Kai Wong (shelter staff)', role: 'staff', username: 'kai', password: 'demo' });
  createUser({ name: 'Operator Lee', role: 'operator', username: 'ops', password: 'demo' });
  const mei = createUser({ name: 'Mei Lam', role: 'user', username: 'mei', password: 'demo' });
  db.links.push({ id: uid('lk'), userId: alex.id, caregiverId: grace.id, status: 'active', createdAt: now() });
  db.consents.push({ id: uid('cs'), userId: alex.id, subject: `caregiver:${grace.id}`, fields: { status: true, location: true, profile: false, alerts: true }, at: now(), version: 1 });
  void mei; save();
}
export function publicUser(u) { return { id: u.id, name: u.name, role: u.role, lang: u.lang, guest: !u.username }; }
export { audit };
