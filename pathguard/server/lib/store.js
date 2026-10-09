// JSON-file backed store (swap for Postgres with the same collection API; see docs/schema.sql).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const FILE = process.env.PG_DB || path.join(here, '../../data/db.json');
const PERSIST = process.env.PG_NO_PERSIST !== '1';
const KEY = crypto.scryptSync(process.env.PG_DATA_KEY || 'dev-only-key-change-me', 'pathguard-salt', 32);
if (!process.env.PG_DATA_KEY) console.warn('[security] PG_DATA_KEY not set: using development key for special-category data encryption.');

export const uid = (p = 'id') => `${p}_${crypto.randomBytes(6).toString('hex')}`;
export const now = () => Date.now();

const empty = () => ({
  users: [], profiles: {}, consents: [], links: [], alerts: [], acks: [], cases: [], checkins: [], hazards: [],
  shelterOverrides: {}, audit: [], notifications: [], agentTraces: [], deletedUsers: 0,
});
export let db = empty();
if (PERSIST) { try { db = { ...empty(), ...JSON.parse(fs.readFileSync(FILE, 'utf8')) }; } catch { /* first run */ } }

let timer = null;
export function save() {
  if (!PERSIST) return;
  clearTimeout(timer);
  timer = setTimeout(() => { try { fs.mkdirSync(path.dirname(FILE), { recursive: true }); fs.writeFileSync(FILE, JSON.stringify(db)); } catch (e) { console.error('save failed', e.message); } }, 400);
}
export function resetAll() { db = empty(); }

// Special-category (health/accessibility) profile data is encrypted at rest and stored apart from the user record.
export function encrypt(obj) {
  const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const enc = Buffer.concat([c.update(JSON.stringify(obj), 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), enc].map((b) => b.toString('base64')).join('.');
}
export function decrypt(s) {
  const [iv, tag, enc] = s.split('.').map((x) => Buffer.from(x, 'base64'));
  const d = crypto.createDecipheriv('aes-256-gcm', KEY, iv); d.setAuthTag(tag);
  return JSON.parse(Buffer.concat([d.update(enc), d.final()]).toString('utf8'));
}

export function audit(actor, action, target, detail = {}) {
  db.audit.push({ id: uid('au'), at: now(), actor: actor?.id || actor || 'system', role: actor?.role || null, action, target, detail });
  if (db.audit.length > 5000) db.audit.splice(0, 1000);
  save();
}
export function notify(userId, kind, text, extra = {}) {
  const n = { id: uid('nt'), userId, kind, text, at: now(), read: false, ...extra };
  db.notifications.push(n); save(); bus.emit('notify', n); return n;
}
import { EventEmitter } from 'node:events';
export const bus = new EventEmitter();
bus.setMaxListeners(200);
