// Shared helpers: DOM builder (no innerHTML), API client, i18n, speech, vibration, state.
const SVG = new Set(['svg', 'g', 'path', 'circle', 'line', 'polyline', 'rect', 'text', 'title', 'desc', 'defs', 'pattern', 'use', 'polygon']);
export function h(tag, props, ...kids) {
  const el = SVG.has(tag) ? document.createElementNS('http://www.w3.org/2000/svg', tag) : document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.setAttribute('class', v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (['value', 'checked', 'disabled', 'selected'].includes(k) && !SVG.has(tag)) el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  const add = (c) => { if (c == null || c === false) return; if (Array.isArray(c)) c.forEach(add); else el.append(c instanceof Node ? c : document.createTextNode(String(c))); };
  kids.forEach(add);
  return el;
}
export const $ = (s, r = document) => r.querySelector(s);
export const clear = (el) => { while (el.firstChild) el.firstChild.remove(); return el; };

// ---------- state ----------
export const S = {
  token: localStorage.getItem('pg.token') || null, user: null, profile: null, map: null, weather: null,
  node: localStorage.getItem('pg.node') || 'n1_5', plan: null, navigating: false, stepIndex: 0, lang: localStorage.getItem('pg.lang') || 'en',
  speech: localStorage.getItem('pg.speech') === '1', online: true, listeners: new Set(),
};
export const on = (fn) => { S.listeners.add(fn); return () => S.listeners.delete(fn); };
export const emit = (...a) => S.listeners.forEach((f) => f(...a));

// ---------- API ----------
export async function api(path, { method = 'GET', body, quiet } = {}) {
  let res;
  try {
    res = await fetch(`/api${path}`, { method, headers: { 'content-type': 'application/json', ...(S.token ? { authorization: `Bearer ${S.token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  } catch (e) { S.online = false; emit('online'); const err = new Error('You appear to be offline'); err.offline = true; throw err; }
  S.online = true;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && !quiet) { setToken(null); location.hash = '#/login'; }
    const err = new Error(data.error || `Request failed (${res.status})`); err.status = res.status; throw err;
  }
  return data;
}
export function setToken(t) { S.token = t; try { t ? localStorage.setItem('pg.token', t) : localStorage.removeItem('pg.token'); } catch { /* storage blocked */ } }
export function store(key, val) { try { if (val === undefined) return JSON.parse(localStorage.getItem(key)); localStorage.setItem(key, JSON.stringify(val)); } catch { return null; } }

// ---------- i18n (English strings are the keys) ----------
const ZH = {
  Home: '主頁', Plan: '路線', Map: '地圖', Alerts: '警報', Assistant: '助手', Weather: '天氣', Report: '報告', Caregiver: '照顧者', Settings: '設定', Operator: '操作員', Staff: '職員',
  'I need help': '我需要協助', 'Get me to safety': '帶我去安全地方', 'Why this one': '點解揀呢個', 'Read aloud': '朗讀', Acknowledge: '確認收到', 'Sign in': '登入', 'Sign out': '登出',
  'Start navigating': '開始導航', Next: '下一步', Back: '返回', Save: '儲存', Cancel: '取消', 'Simulation': '模擬', 'Active warnings': '生效警告', 'No warning in force': '現時沒有警告',
  'Step-by-step directions': '逐步指示', 'Rain in the past hour': '過去一小時雨量', 'Your accessibility profile': '你的無障礙設定', 'Continue as guest': '以訪客繼續', 'Delete my account': '刪除我的帳戶',
  Critical: '危急', Severe: '嚴重', Alert: '警示', Advisory: '提示', Language: '語言', 'Text size': '字體大小', 'Report a hazard': '報告危險', 'Skip to main content': '跳至主要內容',
};
export const t = (s) => (S.lang === 'zh-HK' && ZH[s]) || s;
export function setLang(l) { S.lang = l; try { localStorage.setItem('pg.lang', l); } catch { /* ignore */ } document.documentElement.lang = l === 'zh-HK' ? 'zh-Hant-HK' : 'en'; emit('lang'); }

// ---------- speech & vibration ----------
export function speak(text) {
  if (!('speechSynthesis' in window)) return false;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text); u.lang = S.lang === 'zh-HK' ? 'zh-HK' : 'en-GB'; u.rate = 0.95;
  speechSynthesis.speak(u); return true;
}
export const vibrate = (p) => { try { return navigator.vibrate ? navigator.vibrate(p) : false; } catch { return false; } };
export function announce(text) { const el = $('#live'); if (el) { el.textContent = ''; setTimeout(() => { el.textContent = text; }, 30); } }
export function toast(text, kind = 'info') {
  const el = h('div', { class: `toast ${kind}`, role: kind === 'error' ? 'alert' : 'status' }, text);
  $('#toasts').append(el); announce(text); setTimeout(() => el.remove(), 6000);
}

// ---------- formatting ----------
export const mins = (sec) => `${Math.max(1, Math.round(sec / 60))} min`;
export const ago = (ts) => { const m = Math.round((Date.now() - ts) / 60000); return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`; };
export const SEV = {
  advisory: { icon: 'ℹ', word: 'Advisory', cls: 'sev-1' }, alert: { icon: '⚠', word: 'Alert', cls: 'sev-2' },
  severe: { icon: '⛈', word: 'Severe', cls: 'sev-3' }, critical: { icon: '⛔', word: 'Critical', cls: 'sev-4' },
};
export const SIM_BADGE = (label = 'SIMULATION') => h('span', { class: 'sim-badge', title: 'This value is simulated demo data' }, label);

// Make append()/prepend() ignore null, undefined and false so conditional children never render as the text "null".
for (const m of ['append', 'prepend']) {
  const orig = Element.prototype[m];
  Element.prototype[m] = function (...nodes) { return orig.apply(this, nodes.filter((n) => n != null && n !== false)); };
}
