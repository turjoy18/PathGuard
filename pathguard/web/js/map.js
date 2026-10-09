// SVG map renderer (no tile server, so it works offline). A list alternative is always provided by the pages.
import { h, t } from './lib.js';

const W = 1000;
export function makeProjector(nodes) {
  const lat0 = Math.min(...nodes.map((n) => n.lat)), lat1 = Math.max(...nodes.map((n) => n.lat));
  const lng0 = Math.min(...nodes.map((n) => n.lng)), lng1 = Math.max(...nodes.map((n) => n.lng));
  const k = Math.cos(((lat0 + lat1) / 2) * Math.PI / 180);
  const mw = (lng1 - lng0) * k, mh = lat1 - lat0, pad = 120, scale = (W - pad * 2) / mw;
  const H = Math.round(mh * scale + pad * 2);
  return { H, xy: (lat, lng) => [pad + (lng - lng0) * k * scale, pad + (lat1 - lat) * scale], scale: scale / 111320 * 1, mScale: (W - pad * 2) / (mw * 111320) };
}

const ICON = { stairs: '⌇', lift: 'L' };
const HAZ = { blocked_path: 'Blocked', flood: 'Flood', lift_out: 'Lift out', fallen_tree: 'Tree', crowd: 'Crowd', other: 'Hazard' };

/** opts: {data, layers:{network,lifts,shelters,blackspots,hazards,weather,labels}, route, position, selectedShelter, onPickNode, onPickShelter, floodMode} */
export function renderMap(opts) {
  const { data, layers = {}, route, position, selectedShelter, onPickNode, onPickShelter } = opts;
  const P = makeProjector(data.nodes);
  const nodeById = Object.fromEntries(data.nodes.map((n) => [n.id, n]));
  const pt = (id) => P.xy(nodeById[id].lat, nodeById[id].lng);
  const svg = h('svg', { viewBox: `0 0 ${W} ${P.H}`, class: 'map-svg', role: 'group', 'aria-label': t('Map'), preserveAspectRatio: 'xMidYMid meet' },
    h('desc', null, 'Simplified demo map of the neighbourhood. A full text list of places and hazards is provided below the map.'));
  const g = (cls, ...k) => h('g', { class: cls }, ...k);

  if (layers.weather && opts.floodMode) svg.append(h('rect', { x: 0, y: 0, width: W, height: P.H, class: 'rain-tint' }));
  if (layers.blackspots) {
    svg.append(g('layer-blackspots', ...data.blackspots.map((b) => {
      const [x, y] = P.xy(b.lat, b.lng);
      return h('g', null, h('circle', { cx: x, cy: y, r: b.radius * P.mScale, class: b.floodedNow ? 'spot flooded' : 'spot' }, h('title', null, `${b.name}${b.floodedNow ? ' – FLOODED (simulated)' : ' – flood-prone'}`)),
        layers.labels ? h('text', { x, y: y - b.radius * P.mScale - 4, class: 'lbl small' }, b.floodedNow ? `🌊 ${b.id} flooded` : b.id) : null);
    })));
  }
  if (layers.network) {
    svg.append(g('layer-network', ...data.edges.map((e) => {
      const [x1, y1] = pt(e.a), [x2, y2] = pt(e.b);
      const cls = `edge ${e.stairs ? 'stairs' : e.type}`;
      return h('line', { x1, y1, x2, y2, class: cls }, h('title', null, `${e.street}: ${e.stairs ? 'stairs' : e.type}, width ${e.width ?? 'unknown'} m, slope ${e.gradient ?? '?'}%, kerb ${e.kerb ?? '?'} cm`));
    })));
    svg.append(g('layer-nodes', ...data.nodes.filter((n) => n.name).map((n) => {
      const [x, y] = P.xy(n.lat, n.lng);
      const el = h('g', onPickNode ? { class: 'node pick', tabindex: 0, role: 'button', 'aria-label': `Set my position to ${n.name}`, onClick: () => onPickNode(n.id), onKeydown: (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); onPickNode(n.id); } } } : { class: 'node' },
        h('circle', { cx: x, cy: y, r: n.refuge ? 9 : 6, class: n.refuge ? 'refuge' : 'lm' }), layers.labels && !data.shelters.some((s) => s.node === n.id) ? h('text', { x: x + 11, y: y + 4, class: 'lbl' }, n.name) : null);
      return el;
    })));
  }
  if (route?.coords) {
    const pts = route.coords.map(([la, ln]) => P.xy(la, ln).join(',')).join(' ');
    svg.append(h('polyline', { points: pts, class: 'route-casing' }), h('polyline', { points: pts, class: 'route-line' }));
  }
  if (layers.weather && opts.tcTrack) {
    const pts = opts.tcTrack.map(([la, ln]) => P.xy(la, ln).join(',')).join(' ');
    svg.append(h('polyline', { points: pts, class: 'tc-track' }, h('title', null, 'Tropical cyclone track (simulation)')));
  }
  if (layers.lifts) {
    svg.append(g('layer-lifts', ...data.lifts.map((l) => {
      const [x1, y1] = pt(l.nodeA), [x2, y2] = pt(l.nodeB), x = (x1 + x2) / 2, y = (y1 + y2) / 2;
      const down = l.status !== 'working';
      return h('g', { class: `lift ${down ? 'down' : 'ok'}` }, h('title', null, `${l.name}: ${l.status} (simulated)`),
        h('rect', { x: x - 20, y: y - 14, width: 40, height: 28, rx: 6 }), h('text', { x, y: y + 5, class: 'lift-txt' }, `${l.id} ${down ? '✕' : '✓'}`));
    })));
  }
  if (layers.hazards) {
    svg.append(g('layer-hazards', ...data.hazards.map((hz) => {
      const [x, y] = P.xy(hz.lat, hz.lng);
      return h('g', { class: `hazard ${hz.status}` }, h('title', null, `${HAZ[hz.type]} (${hz.status}${hz.status !== 'verified' ? ', unverified' : ''})`),
        h('polygon', { points: `${x},${y - 16} ${x + 15},${y + 11} ${x - 15},${y + 11}` }), h('text', { x, y: y + 8, class: 'haz-txt' }, '!'));
    })));
  }
  if (layers.shelters) {
    svg.append(g('layer-shelters', ...data.shelters.map((s) => {
      const [x, y] = P.xy(s.lat, s.lng);
      const full = s.occupancy >= s.capacity, sel = selectedShelter === s.id;
      const label = `Shelter ${s.name}, ${full ? 'full' : 'open'}, ${s.stepFree ? 'step-free' : 'not step-free'}`;
      return h('g', { class: `shelter ${full ? 'full' : ''} ${sel ? 'sel' : ''}`, tabindex: onPickShelter ? 0 : null, role: onPickShelter ? 'button' : null, 'aria-label': label,
        onClick: onPickShelter ? () => onPickShelter(s.id) : null, onKeydown: onPickShelter ? (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); onPickShelter(s.id); } } : null },
      h('rect', { x: x - 15, y: y - 15, width: 30, height: 30, rx: 5 }), h('text', { x, y: y + 6, class: 'shelter-txt' }, full ? '✕' : 'S'),
      layers.labels ? h('text', { x, y: y + 30, class: 'lbl center' }, s.name) : null);
    })));
  }
  if (position && nodeById[position]) {
    const [x, y] = pt(position);
    svg.append(h('g', { class: 'you' }, h('circle', { cx: x, cy: y, r: 16, class: 'you-ring' }), h('circle', { cx: x, cy: y, r: 7, class: 'you-dot' }), h('text', { x, y: y - 22, class: 'lbl center bold' }, 'You')));
  }
  return svg;
}

export function legend() {
  const item = (cls, text) => h('li', null, h('svg', { width: 34, height: 12, 'aria-hidden': 'true' }, h('line', { x1: 2, y1: 6, x2: 32, y2: 6, class: `edge ${cls}` })), text);
  return h('ul', { class: 'legend', 'aria-label': 'Map legend' },
    item('footway', 'Footway'), item('stairs', 'Stairs (dashed)'), item('ramp', 'Ramp'), item('footbridge', 'Footbridge'), item('subway', 'Subway'),
    h('li', null, h('span', { class: 'key lift-ok' }, 'L✓'), ' Lift working'), h('li', null, h('span', { class: 'key lift-down' }, 'L✕'), ' Lift down'),
    h('li', null, h('span', { class: 'key shelter-key' }, 'S'), ' Shelter'), h('li', null, h('span', { class: 'key spot-key' }), ' Flood blackspot'));
}
export { ICON, HAZ };
