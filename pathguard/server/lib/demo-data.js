// SYNTHETIC DEMO DATA. The real sources (Lands Dept 3D Pedestrian Network, DSD Flooding Blackspots,
// HAD temporary shelters) are not bundled: the importer interfaces in sources.js are where they plug in.
// Geometry below is generated deterministically and only loosely placed near Sham Shui Po. Nothing here is a real
// footway, lift, flood location or shelter, and every API response that includes it is labelled `simulated: true`.
import { toLatLng, distM, pointSegDist } from './geo.js';

const COLS = 9, ROWS = 7, DX = 140, DY = 115;
const hash = (a, b, s) => { const v = Math.sin(a * 127.1 + b * 311.7 + s * 74.7) * 43758.5453; return (v - Math.floor(v)) * 2 - 1; };

const LANDMARKS = {
  '1,5': 'Riverside Estate entrance',
  '0,3': 'West Market',
  '3,3': 'Main Road footbridge (north landing)',
  '3,4': 'Main Road footbridge (south landing)',
  '7,3': 'Subway exit (north)',
  '7,4': 'Subway entrance (south)',
  '4,4': 'Lai Chi Road crossing',
  '2,5': 'Clinic',
  '5,5': 'Bus terminus',
  '6,5': 'Hill Road Primary School',
  '7,1': 'Harmony Community Hall',
  '4,0': 'Dragon Sports Centre',
  '2,2': 'District Library',
  '8,3': 'Grace Church Hall',
  '4,2': 'Civic Centre',
  '1,1': 'Park pavilion',
  '6,2': 'Station concourse (MTR, unpaid area)',
};
const ROW_STREET = ['North Rd', 'Park St', 'Library St', 'Main Road', 'Lai Chi Rd', 'Clinic Rd', 'River Walk'];
const COL_STREET = ['West Lane', 'Estate Ave', 'Library Ln', 'Bridge Rd', 'Civic Ave', 'Terminus Rd', 'School Rd', 'Station Rd', 'East Lane'];

export const nodes = [];
for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
  const x = c * DX + hash(c, r, 1) * 18, y = (ROWS - 1 - r) * DY + hash(c, r, 2) * 14;
  const { lat, lng } = toLatLng(x, y);
  nodes.push({ id: `n${c}_${r}`, c, r, lat, lng, name: LANDMARKS[`${c},${r}`] || null,
    refuge: ['3,3', '6,2', '7,4'].includes(`${c},${r}`), covered: ['3,3', '6,2', '7,4', '5,5'].includes(`${c},${r}`) });
}
const byCR = (c, r) => nodes.find((n) => n.c === c && n.r === r);

// Pairs with no connection (buildings, the Main Road barrier). Crossings of Main Road are kept only at c=1,3,4,5,7.
const REMOVED = new Set();
const rm = (c1, r1, c2, r2) => REMOVED.add(`${c1},${r1}-${c2},${r2}`);
for (const c of [0, 2, 6, 8]) rm(c, 3, c, 4);
rm(5, 0, 6, 0); rm(2, 1, 3, 1); rm(5, 6, 6, 6); rm(0, 5, 1, 5); rm(6, 3, 7, 3) ; rm(1, 2, 2, 2); rm(7, 5, 7, 6); rm(3, 5, 4, 5);

// Attribute overrides: width m, gradient %, kerb cm, type, liftId. null = missing in source ("unknown").
const OV = {
  '1,3-1,4': { type: 'footbridge', stairs: true, width: 2.4, gradient: 0 },                      // stairs only
  '3,3-3,4': { type: 'footbridge', liftId: 'L1', width: 2.2, gradient: 0, covered: true },       // bridge with lift L1
  '4,3-4,4': { type: 'footway', kerb: 10, width: 3, gradient: 1, floodProne: true },             // at-grade crossing, high kerb
  '5,3-5,4': { type: 'ramp', gradient: 9.5, width: 1.8 },                                         // steep ramp
  '7,3-7,4': { type: 'subway', liftId: 'L2', width: 3.0, gradient: 0, covered: true },            // subway with lift L2
  '2,4-3,4': { width: 0.8, note: 'narrow lane between stalls' },
  '2,5-3,5': { type: 'footway', stairs: true, width: 2.0 },                                      // steps to clinic podium
  '5,1-6,1': { gradient: 7 },
  '6,1-7,1': { gradient: 6 },
  '7,0-7,1': { kerb: 4 },
  '7,1-7,2': { kerb: 2 },
  '4,1-4,2': { width: null },                                                                     // missing data
  '5,2-6,2': { type: 'footway', covered: true, width: 3.5 },
  '6,4-6,5': { kerb: 6 },
  '1,4-1,5': { gradient: 5 },
  '0,2-0,3': { width: 1.1 },
  '7,4-7,5': { type: 'footway', gradient: 3 },
  '4,2-4,3': { floodProne: true },
  '2,5-2,6': { floodProne: true, gradient: 1 },
  '3,0-4,0': { stairs: true, type: 'footway', note: 'steps up to sports centre forecourt' },
};

export const edges = [];
const addEdge = (a, b) => {
  const key = `${a.c},${a.r}-${b.c},${b.r}`;
  if (REMOVED.has(key)) return;
  const len = distM(a, b);
  const horiz = a.r === b.r;
  const street = horiz ? ROW_STREET[a.r] : COL_STREET[a.c];
  const o = OV[key] || {};
  edges.push({
    id: `e_${a.id}_${b.id}`, a: a.id, b: b.id, length: Math.round(len), street,
    type: 'footway', width: 2.0, gradient: 1.5, kerb: 0, stairs: false, liftId: null, covered: false, floodProne: false, ...o,
  });
};
for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
  if (c + 1 < COLS) addEdge(byCR(c, r), byCR(c + 1, r));
  if (r + 1 < ROWS) addEdge(byCR(c, r), byCR(c, r + 1));
}

export const lifts = [
  { id: 'L1', name: 'Main Road footbridge lift', nodeA: 'n3_3', nodeB: 'n3_4', status: 'working' },
  { id: 'L2', name: 'Subway lift (Station Rd)', nodeA: 'n7_3', nodeB: 'n7_4', status: 'working' },
];

// Static flood blackspots (stand-in for DSD dataset). Radius in metres.
const bs = (id, name, c, r, radius) => { const n = byCR(c, r); return { id, name, lat: n.lat, lng: n.lng, radius }; };
export const blackspots = [
  bs('BS-01', 'Lai Chi Road underpass (demo)', 4, 4, 110),
  bs('BS-02', 'River Walk low point (demo)', 2, 6, 100),
  bs('BS-03', 'Civic Avenue dip (demo)', 4, 2, 85),
  bs('BS-04', 'West Market lane (demo)', 0, 3, 90),
];

export const shelters = [
  { id: 'SH-01', name: 'Harmony Community Hall', node: 'n7_1', address: '1 Harmony Rd (demo)', capacity: 120, occupancy: 38, open: true, stepFree: true, lift: true, accessibleToilet: true, power: true, quiet: true, signLanguage: true, animals: true, updatedMinutesAgo: 4 },
  { id: 'SH-02', name: 'Dragon Sports Centre', node: 'n4_0', address: '9 North Rd (demo)', capacity: 300, occupancy: 120, open: true, stepFree: false, lift: false, accessibleToilet: true, power: true, quiet: false, signLanguage: false, animals: false, updatedMinutesAgo: 9 },
  { id: 'SH-03', name: 'District Library', node: 'n2_2', address: '14 Library St (demo)', capacity: 60, occupancy: 31, open: true, stepFree: true, lift: true, accessibleToilet: true, power: false, quiet: true, signLanguage: false, animals: false, updatedMinutesAgo: 22 },
  { id: 'SH-04', name: 'Hill Road Primary School Hall', node: 'n6_5', address: '3 Hill Rd (demo)', capacity: 80, occupancy: 41, open: true, stepFree: true, lift: true, accessibleToilet: true, power: true, quiet: true, signLanguage: false, animals: true, updatedMinutesAgo: 6 },
  { id: 'SH-05', name: 'Grace Church Hall', node: 'n8_3', address: '22 East Lane (demo)', capacity: 50, occupancy: 12, open: true, stepFree: true, lift: false, accessibleToilet: false, power: true, quiet: false, signLanguage: false, animals: false, updatedMinutesAgo: 95 },
  { id: 'SH-06', name: 'Civic Centre', node: 'n4_2', address: '1 Civic Ave (demo)', capacity: 200, occupancy: 200, open: true, stepFree: true, lift: true, accessibleToilet: true, power: true, quiet: false, signLanguage: true, animals: false, updatedMinutesAgo: 3 },
];

export const MARINE_TYPHOON_SHELTER_NOTE = 'Marine Department typhoon shelters are for vessels, never for people. Not used as human shelters.';

// Demo climate table: past-hour maximum district rainfall (mm) percentile breakpoints per month. DEMO VALUES, not HKO statistics.
export const climateDemo = { 5: [1, 4, 9, 18, 32], 6: [2, 6, 14, 28, 45], 7: [2, 5, 12, 25, 40], 8: [2, 6, 13, 27, 44], 9: [1, 4, 10, 22, 38], 10: [0, 1, 3, 8, 16] };

// Scripted replay "modelled on" a past black rainstorm. Timeline is invented for the demo; confirm against HKO history before real use [U].
export const replayScript = {
  id: 'black-rain-replay', title: 'Scripted black rainstorm replay (demo, modelled on a past event)',
  steps: [
    { t: 0, label: 'Amber rainstorm warning issued', warning: { code: 'WRAINA', name: 'Amber Rainstorm Warning', level: 2 }, rain: 18 },
    { t: 1, label: 'Red rainstorm warning; Main Road footbridge lift L1 fails', warning: { code: 'WRAINR', name: 'Red Rainstorm Warning', level: 3 }, rain: 52, liftDown: ['L1'] },
    { t: 2, label: 'Black rainstorm warning; flooding at Lai Chi Road underpass', warning: { code: 'WRAINB', name: 'Black Rainstorm Warning', level: 4 }, rain: 96, flood: ['BS-01', 'BS-03'] },
    { t: 3, label: 'Civic Centre and Library reach capacity', warning: { code: 'WRAINB', name: 'Black Rainstorm Warning', level: 4 }, rain: 71, full: ['SH-03', 'SH-01'] },
    { t: 4, label: 'Rain easing; Black warning cancelled, Red remains', warning: { code: 'WRAINR', name: 'Red Rainstorm Warning', level: 3 }, rain: 24 },
  ],
};

export const landmarks = nodes.filter((n) => n.name).map((n) => ({ id: n.id, name: n.name, lat: n.lat, lng: n.lng }));

export function edgeMid(e) {
  const a = nodes.find((n) => n.id === e.a), b = nodes.find((n) => n.id === e.b);
  return { lat: (a.lat + b.lat) / 2, lng: (a.lng + b.lng) / 2 };
}
export function nearestEdge(p) {
  let best = null, bd = Infinity;
  for (const e of edges) {
    const a = nodes.find((n) => n.id === e.a), b = nodes.find((n) => n.id === e.b);
    const d = pointSegDist(p, a, b);
    if (d < bd) { bd = d; best = e; }
  }
  return { edge: best, distance: bd };
}
export function nearestNode(p) {
  let best = null, bd = Infinity;
  for (const n of nodes) { const d = distM(p, n); if (d < bd) { bd = d; best = n; } }
  return { node: best, distance: bd };
}
