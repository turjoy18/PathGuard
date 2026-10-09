import { h, $, clear, S, api, setToken, store, t, setLang, speak, vibrate, announce, toast, emit, on, SEV, SIM_BADGE } from './lib.js';
import * as P from './pages.js';
import { opsPage } from './ops.js';

const ROUTES = {
  '/': P.home, '/login': P.loginPage, '/setup': P.setupPage, '/plan': P.planPage, '/map': P.mapPage, '/alerts': P.alertsPage, '/report': P.reportPage,
  '/assistant': P.assistantPage, '/weather': P.weatherPage, '/caregiver': P.caregiverPage, '/settings': P.settingsPage, '/ops': opsPage,
};
const NAV = [['/', 'Home', '🏠'], ['/plan', 'Plan', '🧭'], ['/map', 'Map', '🗺'], ['/alerts', 'Alerts', '🔔'], ['/assistant', 'Assistant', '💬'], ['/weather', 'Weather', '🌧'], ['/report', 'Report', '⚠'], ['/caregiver', 'Caregiver', '👥'], ['/settings', 'Settings', '⚙']];
let cleanup = null, es = null, seenAlerts = new Set(store('pg.seen') || []);

// ---------- display preferences ----------
export function applyPrefs() {
  const p = store('pg.prefs') || {};
  const r = document.documentElement;
  const scale = Math.max(p.textScale || 1, S.profile?.textScale || 1);
  r.style.setProperty('--s', scale);
  p.theme && p.theme !== 'auto' ? r.setAttribute('data-theme', p.theme) : r.removeAttribute('data-theme');
  p.contrast === 'high' ? r.setAttribute('data-contrast', 'high') : r.removeAttribute('data-contrast');
  p.motion === 'reduced' ? r.setAttribute('data-motion', 'reduced') : r.removeAttribute('data-motion');
}
window.pgApplyPrefs = applyPrefs;

// ---------- core data ----------
export async function loadCore() {
  const tasks = [
    api('/map').then((m) => { S.map = m; store('pg.map', m); }).catch(() => { S.map = S.map || store('pg.map'); S.mapStale = true; }),
    api('/weather').then((w) => { S.weather = w; store('pg.weather', { w, at: Date.now() }); S.weatherStale = false; }).catch(() => { const c = store('pg.weather'); S.weather = c?.w || null; S.weatherStale = true; S.weatherAt = c?.at; }),
    api('/alerts').then((a) => { S.alerts = a; S.alertsStale = false; }).catch(() => { S.alertsStale = true; }),
  ];
  if (S.user && !S.user.guest) tasks.push(api('/profile').then((p) => { S.profile = p.profile; S.profileSaved = p.saved; }).catch(() => {}));
  else if (S.user) tasks.push(api('/profile').then((p) => { S.profile = p.profile; S.profileSaved = p.saved; }).catch(() => {}));
  await Promise.all(tasks);
  applyPrefs(); renderChrome();
  maybeAlertEffects();
}

function renderChrome() {
  // nav
  const hash = (location.hash.slice(1) || '/').split('?')[0];
  const nav = clear($('#nav')); if (!S.user) { clear($('#header-tools')); $('#header-tools').append(h('button', { class: 'ghost', onClick: () => { setLang(S.lang === 'en' ? 'zh-HK' : 'en'); route(); } }, S.lang === 'en' ? '中文' : 'EN')); return renderAlertBanner(); }
  const items = [...NAV]; if (S.user && ['staff', 'operator'].includes(S.user.role)) items.push(['/ops', S.user.role === 'operator' ? 'Operator' : 'Staff', '🛠']);
  const act = S.alerts?.active?.filter((a) => !a.acknowledged).length || 0;
  for (const [href, label, icon] of items) {
    if (href === '/caregiver' && S.user && S.user.role !== 'caregiver') continue;
    nav.append(h('a', { href: `#${href}`, 'aria-current': hash === href ? 'page' : null }, h('span', { 'aria-hidden': 'true' }, icon), ' ', t(label), href === '/alerts' && act ? h('span', { class: 'chip', style: 'margin-left:.3rem' }, String(act)) : null));
  }
  // header tools
  const tools = clear($('#header-tools'));
  tools.append(
    h('button', { class: 'ghost', 'aria-pressed': S.speech ? 'true' : 'false', title: 'Speak alerts aloud', onClick: () => { S.speech = !S.speech; store('pg.speech', S.speech ? 1 : 0); try { localStorage.setItem('pg.speech', S.speech ? '1' : '0'); } catch { /* */ } if (S.speech) speak('Voice alerts on'); renderChrome(); } }, S.speech ? '🔊' : '🔈', h('span', { class: 'sr' }, 'Voice alerts')),
    h('button', { class: 'ghost', 'aria-label': S.lang === 'en' ? 'Switch to Traditional Chinese' : 'Switch to English', onClick: () => { setLang(S.lang === 'en' ? 'zh-HK' : 'en'); renderChrome(); route(); } }, S.lang === 'en' ? '中文' : 'EN'),
    S.user ? h('button', { class: 'ghost', onClick: () => { setToken(null); S.user = null; S.profile = null; es?.close(); location.hash = '#/login'; route(); } }, `${S.user.name.split(' ')[0]} · ${t('Sign out')}`) : h('a', { class: 'btn', href: '#/login' }, t('Sign in')),
  );
  // simulation banner
  const sb = $('#sim-banner'); const sim = S.weather?.simulationActive;
  sb.classList.toggle('show', !!sim); clear(sb);
  if (sim) sb.append(SIM_BADGE(), 'SIMULATION ACTIVE: warnings, lifts, floods or shelter capacity shown may be simulated, not real conditions.');
  // help button
  const hs = clear($('#help-slot'));
  if (S.user) hs.append(h('button', { class: 'help-fab', onClick: openHelp }, '🆘 ', t('I need help')));
  renderAlertBanner();
}

// ---------- alert banner & effects ----------
function renderAlertBanner() {
  const slot = clear($('#alert-slot'));
  const list = (S.alerts?.active || []).filter((a) => a.level >= 2 && !a.acknowledged).sort((a, b) => b.level - a.level);
  if (!list.length) return;
  const a = list[0], sv = SEV[a.severity], simple = S.profile?.simpleLanguage;
  const big = (S.profile?.textScale || 1) >= 1.4 || simple || a.level >= 3;
  const text = S.lang === 'zh-HK' ? a.zh : simple ? a.simple : a.text;
  slot.append(h('section', { class: `sev ${sv.cls} pulse ${big ? 'big' : ''}`, style: `--pulse:${(1 / a.pulseHz).toFixed(2)}s; margin:0; border-radius:0`, role: 'alert', 'aria-label': `${sv.word} alert` },
    h('span', { class: 'ico', 'aria-hidden': 'true' }, sv.icon),
    h('div', null, h('div', { class: 'word' }, t(sv.word), ' · ', a.title, ' ', a.simulated ? SIM_BADGE() : null, list.length > 1 ? h('span', { class: 'chip' }, `+${list.length - 1} more`) : null)),
    h('div', { class: 'body' }, text, h('div', { class: 'row', style: 'margin-top:.5rem' },
      h('button', { class: 'primary', onClick: () => ack(a.id) }, t('Acknowledge')),
      h('button', { onClick: () => speak(`${sv.word}. ${a.title}. ${text}`) }, '🔊 ', t('Read aloud')),
      h('a', { class: 'btn', href: '#/plan' }, t('Plan'))))));
}
async function ack(id) { try { await api(`/alerts/${id}/ack`, { method: 'POST' }); S.alerts = await api('/alerts'); renderChrome(); emit('alerts'); announce('Alert acknowledged'); } catch (e) { toast(e.message, 'error'); } }
function maybeAlertEffects() {
  const fresh = (S.alerts?.active || []).filter((a) => !seenAlerts.has(a.id) && a.level >= 2);
  if (!fresh.length) return;
  const top = fresh.sort((a, b) => b.level - a.level)[0];
  const deaf = S.profile?.hearing?.level && S.profile.hearing.level !== 'none';
  vibrate(top.vibration); // vibration is useful to everyone; strongest default for deaf/hard of hearing
  const blind = S.profile?.vision?.level && S.profile.vision.level !== 'none';
  if (S.speech || blind) speak(`${SEV[top.severity].word}. ${top.title}. ${S.profile?.simpleLanguage ? top.simple : top.text}`);
  announce(`${SEV[top.severity].word} alert: ${top.title}`);
  void deaf;
  fresh.forEach((a) => seenAlerts.add(a.id)); store('pg.seen', [...seenAlerts].slice(-50));
}

// ---------- help dialog ----------
function openHelp() {
  const dlg = h('dialog', { 'aria-labelledby': 'hd' },
    h('h2', { id: 'hd' }, 'Ask for help?'),
    h('p', null, 'An operator and the caregivers you have given consent to will be told you need help, with your last known position if you allow it. If life is in danger call ', h('strong', null, '999'), ' now.'),
    h('div', { class: 'row' },
      h('button', { class: 'danger primary', onClick: async () => { try { await api('/position', { method: 'POST', body: { node: S.node } }); const c = await api('/help', { method: 'POST', body: { message: 'Help requested from app' } }); dlg.close(); toast(c.duplicate ? 'You already have an open help request.' : 'Help request sent. Stay where you are if safe.'); } catch (e) { toast(e.offline ? 'You are offline. Call 999 if life is in danger.' : e.message, 'error'); } } }, 'Yes, send help request'),
      h('button', { onClick: () => dlg.close() }, t('Cancel'))));
  document.body.append(dlg); dlg.addEventListener('close', () => dlg.remove()); dlg.showModal();
}

// ---------- realtime ----------
function connectEvents() {
  es?.close();
  if (!S.token || typeof EventSource === 'undefined') return;
  es = new EventSource(`/api/events?token=${encodeURIComponent(S.token)}`);
  es.addEventListener('world', () => worldChanged('Conditions changed'));
  es.addEventListener('alerts', async () => { try { S.alerts = await api('/alerts', { quiet: true }); S.weather = await api('/weather', { quiet: true }); maybeAlertEffects(); renderChrome(); emit('alerts'); } catch { /* */ } });
  es.addEventListener('notify', (ev) => { const n = JSON.parse(ev.data); toast(n.text, n.urgent ? 'error' : 'info'); vibrate(n.urgent ? [400, 150, 400] : [150]); emit('notify', n); });
  es.addEventListener('case', () => emit('case'));
}
let worldTimer = null;
function worldChanged() {
  clearTimeout(worldTimer);
  worldTimer = setTimeout(async () => {
    try {
      const [m, w, a] = await Promise.all([api('/map', { quiet: true }), api('/weather', { quiet: true }), api('/alerts', { quiet: true })]);
      S.map = m; S.weather = w; S.alerts = a; store('pg.map', m); maybeAlertEffects(); renderChrome(); emit('world');
      if (S.plan) await P.autoReroute('Conditions changed');
    } catch { /* offline */ }
  }, 150);
}

// ---------- router ----------
async function route() {
  cleanup?.(); cleanup = null;
  const hash = (location.hash.slice(1) || '/');
  const path = hash.split('?')[0];
  if (!S.token && path !== '/login') { location.hash = '#/login'; return; }
  const main = clear($('#main'));
  const page = ROUTES[path] || P.notFound;
  renderChrome();
  try { cleanup = await page(main); } catch (e) { main.append(h('div', { class: 'card' }, h('h1', null, 'Something went wrong'), h('p', { class: 'err' }, e.message), h('button', { onClick: route }, 'Try again'))); }
  document.title = `${path === '/' ? 'Home' : path.slice(1)} – PathGuard`;
  main.focus({ preventScroll: true }); window.scrollTo(0, 0);
}
window.addEventListener('hashchange', route);
on((ev) => { if (ev === 'online') renderChrome(); });

async function boot() {
  applyPrefs(); document.documentElement.lang = S.lang === 'zh-HK' ? 'zh-Hant-HK' : 'en';
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
  if (S.token) {
    try { const me = await api('/me', { quiet: true }); S.user = me.user; await loadCore(); connectEvents(); }
    catch (e) { if (!e.offline) setToken(null); else { S.user = store('pg.user'); S.map = store('pg.map'); renderChrome(); } }
  } else S.weather = null;
  if (S.user) store('pg.user', S.user);
  window.pgBoot = { loadCore, connectEvents, renderChrome, route };
  await route();
}
export { loadCore as reload, connectEvents, renderChrome, route };
boot();
