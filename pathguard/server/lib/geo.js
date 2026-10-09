// Local geometry helpers. Demo area is anchored near Sham Shui Po, Hong Kong.
export const LAT0 = 22.33;
export const LNG0 = 114.16;
const M_LAT = 111320;
const M_LNG = 111320 * Math.cos((LAT0 * Math.PI) / 180);

export const toLatLng = (x, y) => ({ lat: LAT0 + y / M_LAT, lng: LNG0 + x / M_LNG });
export const toXY = (lat, lng) => ({ x: (lng - LNG0) * M_LNG, y: (lat - LAT0) * M_LAT });
export const distM = (a, b) => {
  const p = toXY(a.lat, a.lng), q = toXY(b.lat, b.lng);
  return Math.hypot(p.x - q.x, p.y - q.y);
};
export const bearing = (a, b) => {
  const p = toXY(a.lat, a.lng), q = toXY(b.lat, b.lng);
  return (Math.atan2(q.x - p.x, q.y - p.y) * 180 / Math.PI + 360) % 360;
};
export const compass = (deg) => ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'][Math.round(deg / 45) % 8];
export const turnWord = (prev, next) => {
  const d = ((next - prev + 540) % 360) - 180;
  if (Math.abs(d) < 25) return 'Continue straight';
  if (Math.abs(d) > 155) return 'Turn around';
  return (d > 0 ? 'Turn right' : 'Turn left') + (Math.abs(d) > 100 ? ' (sharp)' : '');
};
export function pointSegDist(p, a, b) {
  const P = toXY(p.lat, p.lng), A = toXY(a.lat, a.lng), B = toXY(b.lat, b.lng);
  const dx = B.x - A.x, dy = B.y - A.y;
  const t = Math.max(0, Math.min(1, ((P.x - A.x) * dx + (P.y - A.y) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(P.x - (A.x + t * dx), P.y - (A.y + t * dy));
}
