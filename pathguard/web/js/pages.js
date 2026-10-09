import { h, $, clear, S, api, setToken, store, t, setLang, speak, vibrate, announce, toast, emit, on, SEV, SIM_BADGE, mins, ago } from './lib.js';
import { renderMap, legend, HAZ } from './map.js';

const boot = () => window.pgBoot;
const feat = (ok, label) => h('span', { class: `chip ${ok ? 'yes' : 'no'}` }, ok ? '✓' : '✕', ' ', label);
const stale = () => (S.online ? null : h('div', { class: 'stale-banner', role: 'status' }, '⚠ You are offline. Showing the last saved information – it may be out of date. Alerts are not being checked.'));
const lm = () => (S.map?.landmarks || []);
const nodeName = (id) => lm().find((l) => l.id === id)?.name || id;

// ---------------------------------------------------------------- plan helpers
export async function computePlan(shelterId) {
  try {
    const p = await api('/plan', { method: 'POST', body: { node: S.node, shelterId } });
    S.plan = p; S.planCached = false; S.stepIndex = 0; store('pg.plan', { plan: p, at: Date.now(), node: S.node }); emit('plan'); return p;
  } catch (e) {
    if (e.offline) { const c = store('pg.plan'); if (c) { S.plan = c.plan; S.planCached = true; S.planAt = c.at; emit('plan'); return S.plan; } }
    throw e;
  }
}
export async function autoReroute(reason) {
  if (!S.plan) return;
  const t0 = performance.now();
  const r = await api('/reroute', { method: 'POST', body: { position: { node: S.node }, shelterId: S.plan.target?.shelter.id, previous: S.plan.route ? { edgeIds: S.plan.route.edgeIds, timeSec: S.plan.route.timeSec } : null, reason } });
  const rtt = Math.round(performance.now() - t0);
  S.lastReroute = { reason: r.reason, ms: r.ms, rtt, at: Date.now(), changed: !!r.changed, ok: r.ok };
  if (r.ok && (r.changed || !S.plan.ok)) {
    await computePlan(r.shelter.id);
    const msg = `Route updated. ${r.reason}. New destination: ${r.shelter.name}.`;
    toast(msg); announce(msg); vibrate([200, 100, 200]); if (S.speech) speak(msg);
  } else if (!r.ok) {
    S.plan = { ok: false, noRoute: r.noRoute, message: r.message, why: [], rejected: [], rejectedNearer: [] }; emit('plan');
    const msg = 'No safe accessible route to a shelter right now. Open the plan for the refuge point and help options.'; toast(msg, 'error'); announce(msg); vibrate([500, 200, 500]);
  } else emit('plan');
}
const setPos = async (node) => { S.node = node; try { localStorage.setItem('pg.node', node); } catch { /* */ } try { await api('/position', { method: 'POST', body: { node } }); } catch { /* offline ok */ } emit('pos'); };

function posPicker(onChange) {
  const sel = h('select', { id: 'pos', 'aria-describedby': 'pos-h', onChange: async (e) => { await setPos(e.target.value); onChange?.(); } },
    lm().map((l) => h('option', { value: l.id, selected: l.id === S.node }, l.name)));
  return h('div', { class: 'field' }, h('label', { for: 'pos' }, 'Where are you? (manual position)'), sel,
    h('div', { id: 'pos-h', class: 'hint' }, 'Choose the nearest place. This works without GPS or a connection.'));
}

// ---------------------------------------------------------------- login
export async function loginPage(main) {
  if (S.token && S.user) { location.hash = '#/'; return; }
  const err = h('p', { class: 'err', role: 'alert' });
  const finish = async (r) => { setToken(r.token); S.user = r.user; store('pg.user', r.user); await boot().loadCore(); boot().connectEvents(); location.hash = '#/'; };
  const u = h('input', { id: 'u', type: 'text', autocomplete: 'username', autocapitalize: 'none' }), p = h('input', { id: 'p', type: 'password', autocomplete: 'current-password' });
  const submit = async (e) => { e.preventDefault(); err.textContent = ''; try { await finish(await api('/auth/login', { method: 'POST', body: { username: u.value, password: p.value } })); } catch (x) { err.textContent = x.message; } };
  main.append(h('h1', null, 'PathGuard'),
    h('p', { class: 'lead' }, 'In an emergency, the nearest shelter means nothing if you cannot reach it. PathGuard finds a shelter and a route that fit your body, your senses and the current conditions.'),
    h('div', { class: 'card' }, h('p', null, h('strong', null, 'Demo build. '), 'Map, lifts, shelters, capacity and hazards are simulated. Weather warnings come live from the Hong Kong Observatory when reachable. In a real emergency call 999.')),
    h('div', { class: 'two' },
      h('div', { class: 'card' }, h('h2', null, 'Quick start'), h('p', null, 'No account needed. You can set your accessibility profile next.'),
        h('button', { class: 'primary big', onClick: async () => { try { await finish(await api('/auth/guest', { method: 'POST', body: { name: 'Guest' } })); location.hash = '#/setup'; } catch (x) { err.textContent = x.message; } } }, t('Continue as guest'))),
      h('form', { class: 'card', onSubmit: submit }, h('h2', null, t('Sign in')),
        h('div', { class: 'field' }, h('label', { for: 'u' }, 'Username'), u), h('div', { class: 'field' }, h('label', { for: 'p' }, 'Password'), p), err,
        h('div', { class: 'row' }, h('button', { class: 'primary', type: 'submit' }, t('Sign in')),
          h('button', { type: 'button', onClick: async () => { err.textContent = ''; try { await finish(await api('/auth/register', { method: 'POST', body: { name: u.value, username: u.value, password: p.value } })); location.hash = '#/setup'; } catch (x) { err.textContent = x.message; } } }, 'Create account')))),
    h('details', { class: 'card' }, h('summary', null, 'Demo accounts (password: demo)'),
      h('ul', null, [['alex', 'Alex – wheelchair user (has a saved profile)'], ['grace', 'Grace – caregiver linked to Alex'], ['kai', 'Kai – shelter staff (hazard queue, shelter editor)'], ['ops', 'Operator – simulation, escalations, audit'], ['mei', 'Mei – new user, no profile']].map(([n, d]) => h('li', null, h('button', { class: 'ghost', type: 'button', onClick: () => { u.value = n; p.value = 'demo'; p.focus(); } }, n), ' ', d)))));
}

// ---------------------------------------------------------------- home
function warningCards(w, limit = 3) {
  if (!w) return [h('div', { class: 'stale-banner' }, 'Weather data unavailable. PathGuard will not guess about warnings.')];
  const out = [];
  if (w.status !== 'live') out.push(h('div', { class: 'stale-banner', role: 'status' }, w.status === 'stale' ? `Observatory data is outdated (${w.ageMin ?? '?'} min old). Last known values shown.` : 'Observatory data is unavailable. No alerts are invented; check the radio or hko.gov.hk.'));
  if (!w.warnings.length) out.push(h('div', { class: 'card' }, h('strong', null, '✔ ', t('No warning in force')), h('p', { class: 'muted' }, `Source: Hong Kong Observatory${w.updateTime ? ' · updated ' + new Date(w.updateTime).toLocaleTimeString() : ''}`)));
  for (const x of w.warnings.slice(0, limit)) {
    const sv = SEV[['', 'advisory', 'alert', 'severe', 'critical'][x.level]];
    out.push(h('section', { class: `sev ${sv.cls}` }, h('span', { class: 'ico', 'aria-hidden': 'true' }, sv.icon), h('div', null, h('div', { class: 'word' }, t(sv.word)), h('strong', null, x.name), ' ', x.simulated ? SIM_BADGE() : h('span', { class: 'chip' }, 'HKO'))));
  }
  return out;
}
export async function checkinCards() {
  let notes = []; try { notes = await api('/notifications', { quiet: true }); } catch { return null; }
  const pend = notes.filter((n) => n.kind === 'checkin' && !n.answered && Date.now() - n.at < 10 * 60e3);
  if (!pend.length) return null;
  const wrap = h('div');
  for (const n of pend) {
    wrap.append(h('section', { class: 'sev sev-2' }, h('span', { class: 'ico', 'aria-hidden': 'true' }, '👋'), h('div', null, h('strong', null, n.text)),
      h('div', { class: 'body' }, h('div', { class: 'row' },
        h('button', { class: 'primary', onClick: async () => { await api(`/checkins/${n.checkinId}/respond`, { method: 'POST', body: { status: 'ok' } }); toast('Your caregiver was told you are OK.'); wrap.remove(); } }, '👍 I am OK'),
        h('button', { class: 'danger primary', onClick: async () => { await api(`/checkins/${n.checkinId}/respond`, { method: 'POST', body: { status: 'help' } }); toast('Help request opened.'); wrap.remove(); } }, '🆘 I need help')))));
  }
  return wrap;
}
export async function home(main) {
  const w = S.weather;
  const box = h('div');
  main.append(stale(), h('h1', null, S.user?.guest ? 'Welcome' : `Hello, ${S.user?.name.split(' ')[0] || ''}`));
  if (S.user && !S.profileSaved) main.append(h('div', { class: 'card rec' }, h('h2', null, 'Set up your accessibility profile'), h('p', null, 'Tell PathGuard about stairs, slopes, width, hearing, vision and needs so routes and shelters fit you. Takes about two minutes. Guests can use safe defaults.'), h('a', { class: 'btn primary', href: '#/setup' }, 'Set up profile')));
  const ck = await checkinCards(); if (ck) main.append(ck);
  main.append(h('h2', null, t('Active warnings')), ...warningCards(w));
  if (w?.rainfall) main.append(h('div', { class: 'card' }, h('strong', null, t('Rain in the past hour'), ': '), `${w.rainfall.mm ?? 'n/a'} mm at ${w.rainfall.place}`, ' ', w.rainfall.simulated ? SIM_BADGE() : null, w.climate ? h('p', { class: 'muted' }, w.climate.label, ' ', SIM_BADGE('DEMO STATS')) : null));
  main.append(h('div', { class: 'card' }, posPicker(), h('button', { class: 'primary big', onClick: async (e) => { e.target.disabled = true; try { await computePlan(); location.hash = '#/plan'; } catch (x) { toast(x.message, 'error'); e.target.disabled = false; } } }, '🧭 ', t('Get me to safety')),
    S.plan ? h('p', { class: 'hint' }, S.plan.ok ? `Current plan: ${S.plan.target.shelter.name} · ` : 'Current plan: no route · ', h('a', { href: '#/plan' }, 'open plan')) : null));
  main.append(h('div', { class: 'grid' },
    ...[['#/map', '🗺 Map', 'Routes, shelters, lifts, flood spots'], ['#/report', '⚠ Report a hazard', 'Three quick steps'], ['#/assistant', '💬 Assistant', 'Ask in plain words'], ['#/alerts', '🔔 Alerts', 'History and acknowledgement']]
      .map(([href, title, d]) => h('a', { class: 'card', href, style: 'text-decoration:none;color:inherit' }, h('strong', null, title), h('p', { class: 'muted' }, d)))));
  main.append(box);
  const off = on((ev) => { if (['world', 'alerts'].includes(ev)) { clear(main); home(main); } });
  return off;
}

// ---------------------------------------------------------------- profile setup
const PRESETS = {
  'Wheelchair (manual)': { mobility: { wheelchair: 'manual' }, needs: { toilet: true } },
  'Wheelchair (power)': { mobility: { wheelchair: 'power' }, needs: { toilet: true, power: true } },
  'Older adult, slow walker': { mobility: { wheelchair: 'none', stairs: 'avoid', walkingSpeed: 'slow', maxSlopePct: 6, maxKerbCm: 10 }, needs: { toilet: true } },
  'Deaf / hard of hearing': { hearing: { level: 'deaf', signLanguage: true } },
  'Blind / low vision': { vision: { level: 'low', screenReader: true } },
  'No special needs': {},
};
export async function setupPage(main) {
  let d = JSON.parse(JSON.stringify(S.profile || (await api('/profile')).profile));
  let consent = false;
  const root = h('div'); main.append(root);
  const radio = (label, name, opts, get, set) => h('fieldset', { class: 'field' }, h('legend', null, label), h('div', { class: 'row' }, opts.map(([v, text]) => h('label', { class: 'check' }, h('input', { type: 'radio', name, value: v, checked: get() === v, onChange: () => { set(v); } }), text))));
  const check = (label, get, set, hint) => h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: get(), onChange: (e) => set(e.target.checked) }), h('span', null, label, hint ? h('span', { class: 'hint' }, ' – ', hint) : null));
  const num = (label, id, get, set, min, max, step, unit, hint) => h('div', { class: 'field' }, h('label', { for: id }, `${label} (${unit})`), h('input', { id, type: 'number', min, max, step, value: get(), onChange: (e) => set(parseFloat(e.target.value)) }), h('div', { class: 'hint' }, hint));
  const draw = () => {
    clear(root);
    const m = d.mobility;
    root.append(h('h1', null, t('Your accessibility profile')),
      h('p', null, 'Used only to choose shelters and routes and to shape alerts. It is stored encrypted, separate from your name, and you can delete it at any time.'),
      h('div', { class: 'card' }, h('strong', null, 'Quick start: '), h('div', { class: 'row' }, Object.keys(PRESETS).map((k) => h('button', { type: 'button', class: 'ghost', onClick: async () => { const base = (await api('/profile')).defaults; d = JSON.parse(JSON.stringify(base)); const p = PRESETS[k]; for (const g of Object.keys(p)) Object.assign(d[g], p[g]); if (p.mobility?.wheelchair && p.mobility.wheelchair !== 'none') { d.mobility.stairs = 'never'; d.mobility.maxSlopePct = p.mobility.wheelchair === 'power' ? 8.3 : 5; d.mobility.minWidthM = 0.9; d.mobility.maxKerbCm = 2; } draw(); announce(`${k} preset applied`); } }, k)))),
      h('fieldset', null, h('legend', null, 'Getting around'),
        radio('Mobility aid', 'wc', [['none', 'None'], ['manual', 'Manual wheelchair'], ['power', 'Power wheelchair'], ['walker', 'Walker / frame'], ['mobility-scooter', 'Scooter']], () => m.wheelchair, (v) => { m.wheelchair = v; if (v !== 'none') { m.stairs = 'never'; m.maxKerbCm = Math.min(m.maxKerbCm, 2); m.minWidthM = Math.max(m.minWidthM, 0.9); m.maxSlopePct = Math.min(m.maxSlopePct, v === 'power' ? 8.3 : 5); } draw(); }),
        radio('Stairs', 'st', [['ok', 'I can use stairs'], ['avoid', 'Avoid if possible'], ['never', 'Never use stairs']], () => m.stairs, (v) => { m.stairs = v; }),
        radio('Walking speed', 'sp', [['slow', 'Slow'], ['normal', 'Normal'], ['fast', 'Fast']], () => m.walkingSpeed, (v) => { m.walkingSpeed = v; }),
        num('Steepest slope you can manage', 'slope', () => m.maxSlopePct, (v) => { m.maxSlopePct = v; }, 2, 20, 0.1, '%', '1:12 ramp = 8.3%. Segments steeper than this are never used.'),
        num('Narrowest gap you can pass', 'width', () => m.minWidthM, (v) => { m.minWidthM = v; }, 0.5, 1.5, 0.05, 'm', 'Include your chair width plus room for hands.'),
        num('Highest kerb or step-up', 'kerb', () => m.maxKerbCm, (v) => { m.maxKerbCm = v; }, 0, 20, 1, 'cm', 'Dropped kerbs count as 0.')),
      h('fieldset', null, h('legend', null, 'Hearing and vision'),
        radio('Hearing', 'hear', [['none', 'No difficulty'], ['hard-of-hearing', 'Hard of hearing'], ['deaf', 'Deaf']], () => d.hearing.level, (v) => { d.hearing.level = v; }),
        check('I use sign language', () => d.hearing.signLanguage, (v) => { d.hearing.signLanguage = v; }, 'prefer shelters with sign language support'),
        radio('Vision', 'vis', [['none', 'No difficulty'], ['low', 'Low vision'], ['blind', 'Blind']], () => d.vision.level, (v) => { d.vision.level = v; }),
        check('I use a screen reader', () => d.vision.screenReader, (v) => { d.vision.screenReader = v; })),
      h('fieldset', null, h('legend', null, 'Shelter needs'),
        check('Accessible toilet', () => d.needs.toilet, (v) => { d.needs.toilet = v; }), check('Power for equipment', () => d.needs.power, (v) => { d.needs.power = v; }),
        check('Quiet space', () => d.needs.quiet, (v) => { d.needs.quiet = v; }), check('I travel with an assistance animal', () => d.needs.assistanceAnimal, (v) => { d.needs.assistanceAnimal = v; })),
      h('fieldset', null, h('legend', null, 'Reading and display'),
        check('Simple language mode', () => d.simpleLanguage, (v) => { d.simpleLanguage = v; }, 'shorter alerts and instructions'),
        h('div', { class: 'field' }, h('label', { for: 'ts' }, `${t('Text size')}: ${Math.round(d.textScale * 100)}%`), h('input', { id: 'ts', type: 'range', min: 1, max: 2, step: 0.1, value: d.textScale, onInput: (e) => { d.textScale = +e.target.value; S.profile = { ...(S.profile || d), textScale: d.textScale }; window.pgApplyPrefs(); $('label[for=ts]').textContent = `${t('Text size')}: ${Math.round(d.textScale * 100)}%`; } })),
        check('Allow routes with missing survey data', () => d.allowUnknownData, (v) => { d.allowUnknownData = v; }, 'off by default: unknown width, slope or kerb is treated as blocked')),
      h('div', { class: 'card' }, check('I agree that PathGuard may process this accessibility information to plan my routes and shape my alerts. I can withdraw this at any time in Settings.', () => consent, (v) => { consent = v; })),
      h('div', { class: 'row' }, h('button', { class: 'primary', onClick: async () => { if (!consent) { toast('Please tick the consent box to save.', 'error'); return; } try { const r = await api('/profile', { method: 'PUT', body: { profile: d, consent } }); S.profile = r.profile; S.profileSaved = true; window.pgApplyPrefs(); toast('Profile saved'); S.plan = null; location.hash = '#/'; } catch (e) { toast(e.message, 'error'); } } }, t('Save')),
        h('button', { onClick: () => history.back() }, t('Cancel')), h('button', { class: 'ghost', onClick: () => { S.profile = d; S.profileSaved = false; window.pgApplyPrefs(); toast('Using these settings for this session only.'); location.hash = '#/'; } }, 'Use without saving')));
  };
  draw();
}

// ---------------------------------------------------------------- plan
function factorBars(f) {
  const rows = [['time', 'Accessible-route time', 0.35], ['risk', 'Route safety', 0.25], ['capacity', 'Capacity margin', 0.15], ['facilities', 'Facilities fit', 0.15], ['fresh', 'Data freshness', 0.10]];
  return h('table', null, h('thead', null, h('tr', null, h('th', null, 'Factor'), h('th', null, 'Weight'), h('th', null, 'Score'))),
    h('tbody', null, rows.map(([k, l, w]) => h('tr', null, h('td', null, l), h('td', null, `${w * 100}%`), h('td', null, h('div', { class: 'bar', role: 'img', 'aria-label': `${Math.round(Math.max(0, f[k]) * 100)} percent` }, h('i', { style: `width:${Math.round(Math.max(0, f[k]) * 100)}%` })))))));
}
function shelterCard(r, rec) {
  const s = r.shelter, f = s.features, left = s.capacity - s.occupancy;
  return h('div', { class: `card ${rec ? 'rec' : ''}` },
    h('h2', { style: 'margin-top:0' }, rec ? '★ Recommended: ' : `#${r.rank} `, s.name, ' ', SIM_BADGE('SIMULATED DATA')),
    h('p', null, s.address, ' · ', h('strong', null, `${r.routeSummary.distanceM} m, about ${mins(r.routeSummary.timeSec)}`), ` by accessible route · risk ${r.routeSummary.risk}`),
    h('div', { class: 'row' }, feat(f.stepFree, 'Step-free entrance'), feat(f.lift, 'Lift'), feat(f.accessibleToilet, 'Accessible toilet'), feat(f.power, 'Backup power'), feat(f.quiet, 'Quiet space'), feat(f.signLanguage, 'Sign language'), feat(f.animals, 'Assistance animals')),
    h('p', { class: 'small' }, `Places left: ${left} of ${s.capacity} · record updated ${s.updatedMinutesAgo} min ago`, s.updatedMinutesAgo > 60 ? h('strong', { class: 'err' }, ' · OUTDATED, confirm on arrival') : null),
    h('div', { class: 'bar', role: 'img', 'aria-label': `${Math.round(s.occupancy / s.capacity * 100)} percent full` }, h('i', { style: `width:${Math.min(100, s.occupancy / s.capacity * 100)}%` })));
}
export async function planPage(main) {
  if (!S.plan) { try { await computePlan(); } catch (e) { main.append(h('p', { class: 'err' }, e.message)); return; } }
  const root = h('div'); main.append(root);
  let timer = null;
  const draw = () => {
    clear(root);
    const p = S.plan; if (!p) return;
    root.append(stale(), S.planCached ? h('div', { class: 'stale-banner' }, `Showing your saved plan from ${ago(S.planAt)}. It may be out of date.`) : null,
      h('h1', null, 'Your safe route'), posPicker(async () => { await computePlan(); draw(); }));
    if (S.lastReroute?.changed && Date.now() - S.lastReroute.at < 120000) root.append(h('div', { class: 'sev sev-3', role: 'status' }, h('span', { class: 'ico', 'aria-hidden': 'true' }, '↻'), h('div', null, h('div', { class: 'word' }, 'Route changed'), `${S.lastReroute.reason}. Replanned in ${S.lastReroute.ms} ms (round trip ${S.lastReroute.rtt} ms).`)));
    if (!p.ok) {
      const nr = p.noRoute;
      root.append(h('section', { class: 'sev sev-4 big', role: 'alert' }, h('span', { class: 'ico', 'aria-hidden': 'true' }, '⛔'), h('div', { class: 'word' }, 'No accessible route'), h('div', { class: 'body' }, p.message || nr?.reason || 'No shelter is reachable with your limits right now.')));
      if (nr) {
        root.append(h('div', { class: 'card' }, h('h2', null, 'What to do now'), h('ol', null, (nr.advice || []).map((a) => h('li', null, a))),
          nr.refuge ? h('div', null, h('p', null, h('strong', null, `Nearest reachable refuge: ${nr.refuge.name}`), nr.refuge.route ? ` – ${nr.refuge.route.distanceM} m, about ${mins(nr.refuge.route.timeSec)}` : ' (you are already there)'),
            nr.refuge.route ? h('ol', { class: 'steps' }, nr.refuge.route.steps.map((s) => h('li', null, s.text))) : null) : null,
          h('p', { class: 'small muted' }, 'Why: ', Object.entries(nr.blocked || {}).map(([k, v]) => `${Math.round(v)} × ${k}`).join(', ') || 'blocked by conditions'),
          h('div', { class: 'row' }, h('button', { class: 'danger primary', onClick: () => document.querySelector('.help-fab')?.click() }, '🆘 I need help'), h('button', { onClick: async () => { await computePlan(); draw(); } }, 'Check again'))));
        if (S.map) root.append(mapBlock(nr.refuge?.route));
      }
      return;
    }
    const best = p.target;
    root.append(shelterCard(best, true));
    root.append(h('details', { class: 'card', open: true }, h('summary', null, t('Why this one')),
      h('ul', null, p.why.map((x) => h('li', null, x))), factorBars(best.factors),
      p.rejectedNearer.length ? h('div', null, h('h3', null, 'Nearer shelters that were ruled out'), h('ul', null, p.rejectedNearer.map((r) => h('li', null, h('strong', null, r.name), ` (${r.straightLineM} m straight-line): ${r.reasons.join('; ')}`)))) : null));
    root.append(h('details', { class: 'card' }, h('summary', null, 'How the route was chosen'), h('ul', null, p.route.explanation.map((x) => h('li', null, x))), p.route.warnings.length ? h('p', { class: 'err' }, p.route.warnings.join(' ')) : null,
      h('p', { class: 'small muted' }, `Planned in ${p.ms} ms. Lifts used: ${p.route.liftsUsed.join(', ') || 'none'}. ${p.floodMode ? 'Rainstorm mode: flood-prone paths are avoided.' : ''}`)));
    if (p.alternatives.length) root.append(h('details', { class: 'card' }, h('summary', null, `Other options (${p.alternatives.length})`), p.alternatives.map((a) => h('div', null, shelterCard(a, false), h('button', { onClick: async () => { await computePlan(a.shelter.id); draw(); } }, `Go to ${a.shelter.name} instead`)))));
    // navigation
    const steps = p.route.steps; const idx = Math.min(S.stepIndex, steps.length - 1);
    const arrived = steps[idx].via === 'arrive' && S.navigating;
    root.append(h('h2', null, t('Step-by-step directions')),
      arrived ? h('section', { class: 'sev sev-1 big', role: 'status' }, h('span', { class: 'ico', 'aria-hidden': 'true' }, '✔'), h('div', { class: 'word' }, 'You have arrived'), h('div', { class: 'body' }, `${best.shelter.name}. Tell a member of staff you arrived. Capacity and features are simulated here.`)) : null,
      h('div', { class: 'row' },
        !S.navigating ? h('button', { class: 'primary', onClick: () => { S.navigating = true; S.stepIndex = 0; speak(steps[0].text); draw(); } }, '▶ ', t('Start navigating')) : h('button', { onClick: () => { S.navigating = false; clearInterval(timer); draw(); } }, 'Stop'),
        S.navigating && !arrived ? h('button', { class: 'primary', onClick: () => advance(steps, draw) }, t('Next'), ' ›') : null,
        S.navigating && S.stepIndex > 0 ? h('button', { onClick: () => { S.stepIndex--; draw(); } }, '‹ ', t('Back')) : null,
        h('button', { onClick: () => speak(steps[idx].text) }, '🔊 ', t('Read aloud')),
        h('button', { class: 'ghost', 'aria-pressed': timer ? 'true' : 'false', onClick: () => { if (timer) { clearInterval(timer); timer = null; draw(); } else { S.navigating = true; timer = setInterval(() => { if (S.stepIndex >= steps.length - 1) { clearInterval(timer); timer = null; draw(); return; } advance(steps, draw); }, 2500); draw(); } } }, timer ? '⏸ Stop demo walk' : '⏩ Demo walk')),
      h('ol', { class: 'steps', 'aria-label': 'Directions' }, steps.map((s, i) => h('li', { class: S.navigating ? (i === idx ? 'cur' : i < idx ? 'done' : '') : '', 'aria-current': S.navigating && i === idx ? 'step' : null }, s.text))),
      h('div', { class: 'row' }, h('button', { onClick: async () => { await computePlan(best.shelter.id); draw(); } }, '↻ Replan from here'), h('a', { class: 'btn', href: '#/report' }, '⚠ Report a hazard here'), h('button', { class: 'ghost', onClick: async () => { const r = await api('/agent', { method: 'POST', body: { message: 'Tell my caregiver I am heading to shelter', shelterId: best.shelter.id } }); if (r.confirm) { if (confirm(r.confirm.prompt)) { await api('/agent/confirm', { method: 'POST', body: { token: r.confirm.token, accept: true } }); toast('Caregivers notified'); } } } }, '👥 Tell my caregiver')));
    root.append(mapBlock(p.route, best.shelter.id));
  };
  const mapBlock = (route, sel) => {
    const rt = route && S.navigating && route.nodes ? { coords: route.coords.slice(Math.max(0, route.nodes.indexOf(S.node))) } : route;
    return h('div', null, h('div', { class: 'map-wrap' }, renderMap({ data: S.map, layers: { network: true, lifts: true, shelters: true, blackspots: true, hazards: true, weather: true, labels: false }, route: rt, position: S.node, selectedShelter: sel, floodMode: S.weather?.floodMode, tcTrack: S.weather?.tcTrack })), legend());
  };
  draw();
  const off = on((ev) => { if (['plan', 'pos'].includes(ev)) draw(); });
  return () => { off(); clearInterval(timer); };
}
async function advance(steps, draw) {
  const cur = steps[Math.min(S.stepIndex, steps.length - 1)];
  if (cur.toNode && cur.via !== 'arrive') await setPos(cur.toNode);
  S.stepIndex = Math.min(S.stepIndex + 1, steps.length - 1);
  const nxt = steps[S.stepIndex]; announce(nxt.text); if (S.speech) speak(nxt.text);
  draw();
}

// ---------------------------------------------------------------- map
export async function mapPage(main) {
  if (!S.map) { main.append(h('p', { class: 'err' }, 'Map data unavailable offline and not cached yet.')); return; }
  const layers = store('pg.layers') || { network: true, lifts: true, shelters: true, blackspots: true, hazards: true, weather: true, labels: true };
  const root = h('div'); main.append(root);
  let sel = null;
  const draw = () => {
    clear(root); store('pg.layers', layers); const m = S.map;
    const names = { network: 'Footways and crossings', lifts: 'Lifts', shelters: 'Shelters', blackspots: 'Flood blackspots', hazards: 'Hazard reports', weather: 'Warnings (rain overlay, cyclone track)', labels: 'Place labels' };
    root.append(stale(), S.mapStale ? h('div', { class: 'stale-banner' }, 'Map shown from your last download.') : null, h('h1', null, t('Map')),
      h('div', { class: 'card' }, h('p', null, h('strong', null, 'Demo geography. '), 'The network, lifts, shelters and hazards are synthetic and labelled SIMULATION. A text list follows the map.')),
      h('fieldset', null, h('legend', null, 'Layers'), h('div', { class: 'row' }, Object.entries(names).map(([k, l]) => h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: layers[k], onChange: (e) => { layers[k] = e.target.checked; draw(); } }), l)))),
      posPicker(draw),
      h('div', { class: 'map-wrap' }, renderMap({ data: m, layers, route: S.plan?.route, position: S.node, selectedShelter: sel, onPickNode: async (id) => { await setPos(id); draw(); announce(`Position set to ${nodeName(id)}`); }, onPickShelter: (id) => { sel = id; draw(); announce('Selected ' + m.shelters.find((s) => s.id === id).name); }, floodMode: S.weather?.floodMode, tcTrack: S.weather?.tcTrack })), legend());
    if (sel) { const s = m.shelters.find((x) => x.id === sel); root.append(h('div', { class: 'card' }, h('h2', null, s.name), h('p', null, s.address, ' ', SIM_BADGE()), h('div', { class: 'row' }, feat(s.stepFree, 'Step-free'), feat(s.lift, 'Lift'), feat(s.accessibleToilet, 'Toilet'), feat(s.power, 'Power')), h('button', { class: 'primary', onClick: async () => { await computePlan(s.id); location.hash = '#/plan'; } }, `Route me to ${s.name}`))); }
    const tbl = (head, rows) => h('div', { class: 'tablewrap' }, h('table', null, h('thead', null, h('tr', null, head.map((x) => h('th', { scope: 'col' }, x)))), h('tbody', null, rows.map((r) => h('tr', null, r.map((c) => h('td', null, c)))))));
    root.append(h('h2', null, 'List alternative'),
      h('details', { open: true }, h('summary', null, 'Shelters'), tbl(['Name', 'Status', 'Step-free', 'Lift', 'Toilet', 'Power', 'Places left', ''], m.shelters.map((s) => [s.name, s.occupancy >= s.capacity ? 'FULL' : 'Open', s.stepFree ? 'Yes' : 'No', s.lift ? 'Yes' : 'No', s.accessibleToilet ? 'Yes' : 'No', s.power ? 'Yes' : 'No', `${Math.max(0, s.capacity - s.occupancy)} (sim)`, h('button', { onClick: async () => { await computePlan(s.id); location.hash = '#/plan'; } }, 'Route')]))),
      h('details', null, h('summary', null, 'Lifts (status simulated)'), tbl(['Lift', 'Between', 'Status'], m.lifts.map((l) => [`${l.id} ${l.name}`, `${nodeName(l.nodeA)} ↔ ${nodeName(l.nodeB)}`, l.status === 'working' ? '✓ working' : `✕ ${l.status}`]))),
      h('details', null, h('summary', null, 'Flood blackspots'), tbl(['Name', 'Radius', 'Status'], m.blackspots.map((b) => [b.name, `${b.radius} m`, b.floodedNow ? 'FLOODED (simulated)' : 'flood-prone']))),
      h('details', null, h('summary', null, `Hazard reports (${m.hazards.length})`), m.hazards.length ? tbl(['Type', 'Status', 'Note', 'Expires'], m.hazards.map((x) => [HAZ[x.type], x.status === 'verified' ? 'Verified' : 'Unverified', x.note || '–', new Date(x.expiresAt).toLocaleTimeString()])) : h('p', null, 'No active reports.')),
      h('details', null, h('summary', null, 'Places (set my position)'), tbl(['Place', ''], m.landmarks.map((l) => [l.name, h('button', { onClick: async () => { await setPos(l.id); draw(); } }, l.id === S.node ? '✓ You are here' : 'I am here')]))),
      h('p', { class: 'small muted' }, m.marineNote));
  };
  draw();
  const off = on((ev) => { if (['world', 'plan'].includes(ev)) draw(); });
  return off;
}

// ---------------------------------------------------------------- alerts
export async function alertsPage(main) {
  const root = h('div'); main.append(root);
  const draw = async () => {
    clear(root); let a = S.alerts; try { a = S.alerts = await api('/alerts'); } catch { /* use cache */ }
    root.append(stale(), h('h1', null, t('Alerts')), h('p', { class: 'muted' }, 'Official HKO warnings appear here as soon as they are issued. Severity is shown by icon, word and colour. Alerts vibrate your device if it supports it and flash no faster than twice per second.'));
    const ck = await checkinCards(); if (ck) root.append(ck);
    root.append(h('h2', null, 'Active'));
    if (!a?.active?.length) root.append(h('div', { class: 'card' }, '✔ No active alerts.', S.weather?.status !== 'live' ? h('p', { class: 'err' }, 'Observatory feed is not live right now, so this list may be incomplete.') : null));
    for (const x of a?.active || []) root.append(alertCard(x, draw));
    root.append(h('h2', null, 'History'));
    for (const x of a?.history || []) root.append(h('div', { class: 'card' }, h('strong', null, `${SEV[x.severity].icon} ${t(SEV[x.severity].word)} · ${x.title}`), ' ', x.simulated ? SIM_BADGE() : null, h('p', { class: 'muted small' }, `Issued ${new Date(x.issuedAt).toLocaleString()} · ${x.status}${x.clearedAt ? ' ' + ago(x.clearedAt) : ''}`)));
    if (!a?.history?.length) root.append(h('p', { class: 'muted' }, 'No earlier alerts.'));
    root.append(h('h2', null, 'Messages'));
    let notes = []; try { notes = await api('/notifications'); } catch { /* */ }
    root.append(notes.length ? h('ul', null, notes.slice(0, 12).map((n) => h('li', null, h('span', { class: 'small muted' }, ago(n.at)), ' ', n.text))) : h('p', { class: 'muted' }, 'No messages.'));
  };
  await draw();
  const off = on((ev) => { if (['alerts', 'notify'].includes(ev)) draw(); });
  return off;
}
function alertCard(a, redraw) {
  const sv = SEV[a.severity], simple = S.profile?.simpleLanguage;
  const text = S.lang === 'zh-HK' ? a.zh : simple ? a.simple : a.text;
  return h('section', { class: `sev ${sv.cls} pulse ${a.level >= 3 || simple ? 'big' : ''}`, style: `--pulse:${(1 / a.pulseHz).toFixed(2)}s` },
    h('span', { class: 'ico', 'aria-hidden': 'true' }, sv.icon), h('div', null, h('div', { class: 'word' }, t(sv.word)), h('strong', null, a.title), ' ', a.simulated ? SIM_BADGE() : h('span', { class: 'chip' }, a.source)),
    h('div', { class: 'body' }, text, h('p', { class: 'small muted' }, `Issued ${new Date(a.issuedAt).toLocaleTimeString()}${a.acknowledged ? ' · you acknowledged' : ''}`),
      h('div', { class: 'row' }, a.acknowledged ? h('span', { class: 'chip yes' }, '✓ Acknowledged') : h('button', { class: 'primary', onClick: async () => { await api(`/alerts/${a.id}/ack`, { method: 'POST' }); toast('Acknowledged'); await window.pgBoot.loadCore(); redraw(); } }, t('Acknowledge')),
        h('button', { onClick: () => speak(`${sv.word}. ${a.title}. ${text}`) }, '🔊 ', t('Read aloud')), h('button', { class: 'ghost', onClick: () => { if (!vibrate(a.vibration)) toast('This device cannot vibrate.'); else toast(`Vibration pattern: ${a.vibration.join('-')} ms`); } }, '📳 Test vibration'), h('a', { class: 'btn', href: '#/plan' }, 'Plan route'))));
}

// ---------------------------------------------------------------- report
const HTYPES = [['blocked_path', '🚧', 'Path blocked'], ['flood', '🌊', 'Flooding'], ['lift_out', '🛗', 'Lift not working'], ['fallen_tree', '🌳', 'Fallen tree'], ['crowd', '👥', 'Dangerous crowd'], ['other', '❓', 'Something else']];
export async function reportPage(main) {
  const st = { step: 1, type: null, node: S.node, photo: null, note: '', done: null };
  const root = h('div'); main.append(root);
  const resize = (file) => new Promise((res, rej) => { const img = new Image(); img.onload = () => { const k = Math.min(1, 800 / Math.max(img.width, img.height)); const c = document.createElement('canvas'); c.width = img.width * k; c.height = img.height * k; c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); res(c.toDataURL('image/jpeg', 0.7)); }; img.onerror = rej; img.src = URL.createObjectURL(file); });
  const draw = () => {
    clear(root);
    root.append(stale(), h('h1', null, t('Report a hazard')), h('p', { class: 'muted' }, `Step ${Math.min(st.step, 3)} of 3 · Reports are checked by staff. Until verified they are shown as unverified and only slightly raise route risk.`));
    if (st.done) {
      root.append(h('section', { class: 'sev sev-1', role: 'status' }, h('span', { class: 'ico', 'aria-hidden': 'true' }, '✔'), h('div', { class: 'word' }, 'Report received'), h('div', { class: 'body' }, st.done.corroborated ? 'Someone else already reported this. Your report adds confidence.' : 'Thank you. Staff will verify it.', ` Trust score ${st.done.hazard.trust}. It expires ${new Date(st.done.hazard.expiresAt).toLocaleTimeString()}.`)),
        h('div', { class: 'row' }, h('a', { class: 'btn primary', href: '#/plan' }, 'Back to my route'), h('button', { onClick: () => { Object.assign(st, { step: 1, type: null, photo: null, note: '', done: null }); draw(); } }, 'Report another')));
      return;
    }
    if (st.step === 1) root.append(h('fieldset', null, h('legend', null, 'What is the problem?'), h('div', { class: 'grid' }, HTYPES.map(([v, i, l]) => h('button', { class: st.type === v ? 'primary' : '', style: 'min-height:72px;font-size:1.1rem', 'aria-pressed': st.type === v ? 'true' : 'false', onClick: () => { st.type = v; st.step = 2; draw(); } }, h('span', { 'aria-hidden': 'true' }, i), l)))));
    if (st.step === 2) root.append(h('fieldset', null, h('legend', null, 'Where is it?'), h('div', { class: 'field' }, h('label', { for: 'rn' }, 'Nearest place'), h('select', { id: 'rn', onChange: (e) => { st.node = e.target.value; } }, lm().map((l) => h('option', { value: l.id, selected: l.id === st.node }, l.name))), h('p', { class: 'hint' }, 'Starts at your current position.')),
      h('div', { class: 'row' }, h('button', { onClick: () => { st.step = 1; draw(); } }, t('Back')), h('button', { class: 'primary', onClick: () => { st.step = 3; draw(); } }, t('Next')))));
    if (st.step === 3) {
      const note = h('textarea', { id: 'note', rows: 3, maxlength: 280, value: st.note, 'aria-describedby': 'nh', onInput: (e) => { st.note = e.target.value; } });
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      root.append(h('fieldset', null, h('legend', null, 'Add details (optional)'),
        h('div', { class: 'field' }, h('label', { for: 'note' }, 'Describe it'), note, h('div', { id: 'nh', class: 'hint' }, 'Type, or use the microphone button where supported.')),
        SR ? h('button', { type: 'button', onClick: () => { const r = new SR(); r.lang = S.lang === 'zh-HK' ? 'zh-HK' : 'en-GB'; r.onresult = (e) => { st.note = e.results[0][0].transcript; note.value = st.note; }; r.start(); toast('Listening…'); } }, '🎤 Dictate') : null,
        h('div', { class: 'field' }, h('label', { for: 'ph' }, 'Photo (optional)'), h('input', { id: 'ph', type: 'file', accept: 'image/*', capture: 'environment', onChange: async (e) => { const f = e.target.files[0]; if (f) { try { st.photo = await resize(f); toast('Photo attached'); } catch { toast('Could not read that photo', 'error'); } } } })),
        h('div', { class: 'row' }, h('button', { onClick: () => { st.step = 2; draw(); } }, t('Back')),
          h('button', { class: 'primary', onClick: async (e) => { e.target.disabled = true; const nd = S.map.nodes.find((n) => n.id === st.node); try { st.done = await api('/hazards', { method: 'POST', body: { type: st.type, lat: nd.lat, lng: nd.lng, note: st.note, photo: st.photo, voiceText: null } }); draw(); await window.pgBoot.loadCore(); } catch (x) { toast(x.message, 'error'); e.target.disabled = false; } } }, 'Send report'),
          h('a', { class: 'btn ghost', href: '#/' }, t('Cancel')))));
    }
  };
  draw();
}

// ---------------------------------------------------------------- assistant
export async function assistantPage(main) {
  const log = h('div', { class: 'chat', role: 'log', 'aria-live': 'polite', 'aria-label': 'Conversation' });
  const input = h('input', { id: 'msg', type: 'text', maxlength: 400, autocomplete: 'off', placeholder: 'e.g. Where should I go? My lift is broken.' });
  const add = (who, ...kids) => { const m = h('div', { class: `msg ${who}` }, ...kids); log.append(m); m.scrollIntoView({ block: 'nearest' }); return m; };
  const ask = async (text) => {
    if (!text.trim()) return; add('me', text); input.value = '';
    const wait = add('bot', 'Thinking…');
    try {
      const r = await api('/agent', { method: 'POST', body: { message: text, shelterId: S.plan?.target?.shelter.id, position: { node: S.node } } });
      wait.remove();
      const m = add('bot', h('p', null, r.answer), r.narration ? h('p', { class: 'small muted' }, 'Plain-language version: ', r.narration) : null,
        r.flags?.length ? h('p', { class: 'err small' }, '⚠ Instruction-like text in your message was ignored.') : null,
        h('details', null, h('summary', null, `How I decided (${r.trace.length} tool call${r.trace.length === 1 ? '' : 's'})`), h('ul', null, r.trace.map((tr) => h('li', { class: 'tool' }, h('span', { class: `tag ${tr.tag}` }, tr.tag), ` ${tr.tool}(${JSON.stringify(tr.args)}) → ${tr.error || (tr.awaitingConfirmation ? 'awaiting your confirmation' : 'ok' + (tr.ms != null ? ` ${tr.ms}ms` : ''))}`)), h('li', { class: 'small' }, `Answer built by deterministic engines${r.usedModel ? ' + language model wording' : ' (no language model used)'}.`))));
      if (r.confirm) m.append(h('div', { class: 'row' }, h('strong', null, r.confirm.prompt), h('button', { class: 'primary', onClick: async (e) => { const x = await api('/agent/confirm', { method: 'POST', body: { token: r.confirm.token, accept: true } }); add('bot', x.message); e.target.closest('.row').remove(); } }, 'Yes, do it'), h('button', { onClick: async (e) => { await api('/agent/confirm', { method: 'POST', body: { token: r.confirm.token, accept: false } }); add('bot', 'Okay, nothing was sent.'); e.target.closest('.row').remove(); } }, 'No')));
      if (S.speech) speak(r.answer);
      if (r.facts?.plan?.ok || r.facts?.reroute) computePlan().catch(() => {});
    } catch (e) { wait.remove(); add('bot', h('span', { class: 'err' }, e.offline ? 'You are offline. Your saved plan is on the Plan page.' : e.message)); }
  };
  main.append(h('h1', null, t('Assistant')), h('p', { class: 'muted' }, 'The assistant only calls PathGuard\'s safety engines; it cannot override route rules, change consent, delete data or publish alerts. Actions that contact people need your confirmation.'),
    h('div', { class: 'row' }, ['Where should I go?', 'The lift is broken, reroute me', 'What are the warnings?', 'Tell my caregiver', 'I need help'].map((q) => h('button', { class: 'ghost', onClick: () => ask(q) }, q))),
    log, h('form', { class: 'row', style: 'margin-top:1rem', onSubmit: (e) => { e.preventDefault(); ask(input.value); } }, h('label', { for: 'msg', class: 'sr' }, 'Message'), input, h('button', { class: 'primary', type: 'submit' }, 'Send')));
  add('bot', 'Hello. I can find a shelter and an accessible route, check warnings, replan, tell your caregiver or request help.');
}

// ---------------------------------------------------------------- weather
export async function weatherPage(main) {
  let w = S.weather; try { w = S.weather = await api('/weather'); } catch { /* cached */ }
  main.append(stale(), h('h1', null, t('Weather')));
  if (!w) { main.append(h('div', { class: 'stale-banner' }, 'No weather data available.')); return; }
  main.append(...warningCards(w, 10));
  main.append(h('div', { class: 'grid' },
    h('div', { class: 'card' }, h('h2', null, t('Rain in the past hour')), h('p', { style: 'font-size:2rem;margin:0' }, `${w.rainfall.mm ?? 'n/a'} mm`), h('p', null, `${w.rainfall.place} district`, ' ', w.rainfall.simulated ? SIM_BADGE() : h('span', { class: 'chip' }, 'HKO live'))),
    h('div', { class: 'card' }, h('h2', null, 'Compared with this month'), w.climate ? h('div', null, h('p', { style: 'font-size:1.2rem' }, w.climate.unusual ? '⚠ ' : '', w.climate.label), h('div', { class: 'bar', role: 'img', 'aria-label': `percentile ${w.climate.percentile}` }, h('i', { style: `width:${w.climate.percentile}%` })), h('p', { class: 'small muted' }, `≈ ${w.climate.percentile}th percentile. `, SIM_BADGE('DEMO STATS'), ' ', w.climate.note)) : h('p', null, 'Not available.')),
    h('div', { class: 'card' }, h('h2', null, 'Temperature'), w.temperature ? h('p', { style: 'font-size:2rem;margin:0' }, `${w.temperature.value}°${w.temperature.unit}`, h('span', { class: 'small muted' }, ` ${w.temperature.place}`)) : h('p', null, 'Not available.'))));
  if (w.tcTrack) main.append(h('div', { class: 'card' }, h('h2', null, 'Tropical cyclone track'), h('p', null, SIM_BADGE(), ' Simulated track shown on the map layer "Warnings".'), h('a', { class: 'btn', href: '#/map' }, 'Open map')));
  main.append(h('p', { class: 'small muted' }, `Source: ${w.source}. Status: ${w.status}${w.ageMin != null ? `, ${w.ageMin} min old` : ''}${w.error ? ` (${w.error})` : ''}. ${w.tcNote}`));
}

// ---------------------------------------------------------------- caregiver
export async function caregiverPage(main) {
  if (S.user.role !== 'caregiver') { main.append(h('h1', null, t('Caregiver')), h('p', null, 'This page is for caregiver accounts. To let a caregiver see your status, add them in Settings.'), h('a', { class: 'btn primary', href: '#/settings' }, 'Open settings')); return; }
  const root = h('div'); main.append(h('h1', null, t('Caregiver')), root);
  const draw = async () => {
    clear(root); let list = []; try { list = await api('/caregiver/dependants'); } catch (e) { root.append(h('p', { class: 'err' }, e.message)); return; }
    if (!list.length) root.append(h('p', null, 'Nobody has shared their status with you yet.'));
    for (const d of list) {
      root.append(h('div', { class: `card ${d.needsHelp ? 'rec' : ''}`, style: d.needsHelp ? 'border-color:var(--danger)' : '' }, h('h2', { style: 'margin-top:0' }, d.name),
        d.consent.status ? h('div', null, d.needsHelp ? h('section', { class: 'sev sev-4', role: 'alert' }, h('span', { class: 'ico', 'aria-hidden': 'true' }, '🆘'), h('div', { class: 'word' }, 'Needs help'), h('div', null, `Request opened ${ago(d.case.createdAt)} · escalation step ${d.case.step + 1} of 4`)) : h('p', null, '✔ No open help request'), h('p', { class: 'small muted' }, d.lastSeenAt ? `Last active ${ago(d.lastSeenAt)}` : 'Not seen recently'), d.sheltered ? h('p', null, `Heading to: ${d.sheltered.name}`) : null) : h('p', { class: 'muted' }, 'Status not shared.'),
        d.consent.location ? h('p', null, '📍 ', d.position?.node ? nodeName(d.position.node) : 'Position unknown') : h('p', { class: 'muted small' }, 'Location not shared.'),
        d.consent.alerts ? h('p', null, d.unackedAlerts?.length ? `Unacknowledged: ${d.unackedAlerts.map((a) => a.title).join(', ')}` : '✔ All alerts acknowledged') : null,
        d.checkins?.length ? h('p', { class: 'small' }, 'Check-ins: ', d.checkins.map((k) => `${k.status} (${ago(k.createdAt)})`).join(', ')) : null,
        h('button', { class: 'primary', onClick: async () => { await api('/checkins', { method: 'POST', body: { userId: d.id } }); toast('Check-in sent'); draw(); } }, 'Send check-in')));
    }
    let notes = []; try { notes = await api('/notifications'); } catch { /* */ }
    root.append(h('h2', null, 'Recent messages'), notes.length ? h('ul', null, notes.slice(0, 10).map((n) => h('li', null, h('span', { class: 'muted small' }, ago(n.at)), ' ', n.text))) : h('p', { class: 'muted' }, 'None.'));
  };
  await draw();
  const off = on((ev) => { if (['notify', 'case'].includes(ev)) draw(); });
  return off;
}

// ---------------------------------------------------------------- settings
export async function settingsPage(main) {
  const prefs = store('pg.prefs') || {};
  const save = () => { store('pg.prefs', prefs); window.pgApplyPrefs(); };
  const sel = (id, label, opts, key) => h('div', { class: 'field' }, h('label', { for: id }, label), h('select', { id, onChange: (e) => { prefs[key] = e.target.value; save(); } }, opts.map(([v, l]) => h('option', { value: v, selected: (prefs[key] || opts[0][0]) === v }, l))));
  main.append(h('h1', null, t('Settings')), h('div', { class: 'card' }, h('h2', null, 'Display'),
    sel('th', 'Theme', [['auto', 'Match my device'], ['light', 'Light'], ['dark', 'Dark']], 'theme'), sel('ct', 'Contrast', [['normal', 'Normal'], ['high', 'High contrast']], 'contrast'), sel('mo', 'Motion', [['auto', 'Match my device'], ['reduced', 'Reduce motion']], 'motion'),
    h('div', { class: 'field' }, h('label', { for: 'sc' }, `${t('Text size')} (this device)`), h('input', { id: 'sc', type: 'range', min: 1, max: 2, step: 0.1, value: prefs.textScale || 1, onInput: (e) => { prefs.textScale = +e.target.value; save(); } })),
    h('div', { class: 'field' }, h('label', { for: 'lg' }, t('Language')), h('select', { id: 'lg', onChange: (e) => { setLang(e.target.value); window.pgBoot.route(); } }, [['en', 'English'], ['zh-HK', '繁體中文 (partial)']].map(([v, l]) => h('option', { value: v, selected: S.lang === v }, l))))));
  main.append(h('div', { class: 'card' }, h('h2', null, 'Accessibility profile'), h('p', null, S.profileSaved ? 'Saved (encrypted).' : 'Not saved yet.'), h('a', { class: 'btn', href: '#/setup' }, 'Edit profile')));
  if (S.user.role === 'user') {
    const box = h('div', { class: 'card' }, h('h2', null, 'Caregivers and consent'), h('p', { class: 'muted' }, 'Choose exactly what each caregiver may see. You can change or remove access at any time.'));
    main.append(box);
    const drawC = async () => {
      box.querySelectorAll('.cg').forEach((e) => e.remove());
      let c = { links: [], history: [] }; try { c = await api('/consents'); } catch { return; }
      for (const l of c.links) {
        const f = { ...l.fields };
        const row = h('fieldset', { class: 'cg' }, h('legend', null, l.name),
          [['status', 'Safety status and help requests'], ['location', 'My location'], ['alerts', 'Which alerts I acknowledged'], ['profile', 'My accessibility profile']].map(([k, lab]) => h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: !!f[k], onChange: async (e) => { f[k] = e.target.checked; await api(`/links/${l.id}`, { method: 'PUT', body: { fields: f } }); toast('Consent updated'); } }), lab)),
          h('button', { class: 'danger', onClick: async () => { await api(`/links/${l.id}`, { method: 'DELETE' }); toast('Caregiver removed'); drawC(); } }, 'Remove caregiver'));
        box.append(row);
      }
      if (!c.links.length) box.append(h('p', { class: 'cg muted' }, 'No caregivers linked.'));
    };
    const un = h('input', { id: 'cgu', type: 'text', autocapitalize: 'none' });
    box.append(h('div', { class: 'field' }, h('label', { for: 'cgu' }, 'Add a caregiver by username (try: grace)'), h('div', { class: 'row' }, un, h('button', { onClick: async () => { try { await api('/links', { method: 'POST', body: { username: un.value, fields: { status: true, alerts: true } } }); un.value = ''; drawC(); toast('Caregiver added with status and alert sharing. Review the options below.'); } catch (e) { toast(e.message, 'error'); } } }, 'Add'))));
    await drawC();
  }
  const reg = await api('/sources', { quiet: true }).catch(() => null);
  if (reg) main.append(h('details', { class: 'card' }, h('summary', null, 'Data sources and what is simulated'), h('div', { class: 'tablewrap' }, h('table', null, h('thead', null, h('tr', null, ['Source', 'Use', 'Status'].map((x) => h('th', null, x)))), h('tbody', null, reg.register.map((r) => h('tr', null, h('td', null, r.name), h('td', null, r.use), h('td', null, r.status)))))), h('p', null, 'Simulated layers: ', reg.simulatedLayers.join(', '), '.')));
  main.append(h('div', { class: 'card' }, h('h2', null, 'Delete my account'), h('p', null, 'Permanently deletes your profile, consents, caregiver links, help cases and messages. Hazard reports are kept anonymously. This cannot be undone.'),
    h('button', { class: 'danger', onClick: () => { const dlg = h('dialog', null, h('h2', null, 'Delete account?'), h('p', null, 'All your data will be removed.'), h('div', { class: 'row' }, h('button', { class: 'danger primary', onClick: async () => { await api('/me', { method: 'DELETE' }); setToken(null); S.user = null; S.profile = null; dlg.close(); location.hash = '#/login'; window.pgBoot.renderChrome(); } }, 'Yes, delete everything'), h('button', { onClick: () => dlg.close() }, t('Cancel')))); document.body.append(dlg); dlg.addEventListener('close', () => dlg.remove()); dlg.showModal(); } }, t('Delete my account'))));
}

export async function notFound(main) { main.append(h('h1', null, 'Page not found'), h('a', { class: 'btn primary', href: '#/' }, 'Go home')); }
