import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.env.PG_WEB = path.join(root, 'web');
if (!process.env.PG_DB) process.env.PG_DB = '/tmp/pathguard-db.json';

const { server, boot } = await import('../server/index.js');
boot();

export default function handler(req, res) {
  return new Promise((resolve, reject) => {
    res.once('finish', resolve);
    res.once('error', reject);
    server.emit('request', req, res);
  });
}
