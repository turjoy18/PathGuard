// Staff and operator consoles.
import { h, clear, S, api, toast, on, ago, SIM_BADGE, store } from './lib.js';
import { HAZ } from './map.js';

export async function opsPage(main) {
  const isOp = S.user.role === 'operator';
  const tabs = [['overview', 'Overview', true], ['cases', 'Escalation queue', isOp], ['hazards', 'Hazard moderation', true], ['shelters', 'Shelters', true], ['sim', 'Simulation', isOp], ['publish', 'Publish notice', isOp], ['audit', 'Audit log', isOp], ['agent', 'Agent traces', isOp]].filter((x) => x[2]);
  let tab = store('pg.opstab') || 'overview'; if (!tabs.find((x) => x[0] === tab)) tab = 'overview';
  const body = h('div', { role: 'tabpanel', id: 'panel' });
  const bar = h('div', { class: 'tabs', role: 'tablist', 'aria-label': 'Console sections' });
  main.append(h('h1', null, isOp ? 'Operator console' : 'Staff console'), bar, body);
  const render = async () => {
    clear(bar); tabs.forEach(([k, l]) => bar.append(h('button', { role: 'tab', 'aria-selected': k === tab ? 'true' : 'false', 'aria-controls': 'panel', onClick: () => { tab = k; store('pg.opstab', k); render(); } }, l)));
    clear(body);
    try { await VIEWS[tab](body, render); } catch (e) { body.append(h('p', { class: 'err' }, e.message)); }
  };
  await render();
  const off = on((ev) => { if (['case', 'world'].includes(ev) && ['cases', 'hazards', 'overview', 'shelters'].includes(tab)) render(); });
  return off;
}

const tbl = (head, rows) => h('div', { class: 'tablewrap' }, h('table', null, h('thead', null, h('tr', null, head.map((x) => h('th', { scope: 'col' }, x)))), h('tbody', null, rows.map((r) => h('tr', null, r.map((c) => h('td', null, c)))))));

const VIEWS = {
  async overview(b) {
    const o = S.user.role === 'operator' ? await api('/ops/stats') : null; const q = await api('/staff/hazards');
    b.append(h('div', { class: 'grid' }, ...(o ? [['Open cases', o.openCases], ['Active alerts', o.activeAlerts], ['Pending hazard reports', o.pendingHazards], ['Registered users', o.users]] : [['Pending hazard reports', q.length]])
      .map(([l, v]) => h('div', { class: 'card' }, h('div', { class: 'muted' }, l), h('div', { style: 'font-size:2.2rem;font-weight:800' }, v)))),
    h('p', null, 'Weather: ', S.weather?.status, S.weather?.simulationActive ? ' · ' : '', S.weather?.simulationActive ? SIM_BADGE() : null));
  },
  async cases(b, rerender) {
    const cs = await api('/ops/cases');
    if (!cs.length) { b.append(h('p', null, 'No cases. The queue fills when someone asks for help, a critical alert is not acknowledged, or a check-in is missed.')); return; }
    b.append(h('p', { class: 'muted' }, 'Escalation ladder: ', cs[0].ladder.map((l) => `${l.afterSec}s ${l.action}`).join(' → ')));
    b.append(tbl(['Priority', 'Person', 'Type', 'Message', 'Opened', 'Step', 'Status', 'Actions'], cs.map((c) => [c.priority ? '🔴 HIGH' : '', c.userName, c.kind, c.message || '–', ago(c.createdAt), `${c.step + 1}/4`, c.status + (c.assignee ? ` · ${c.assignee}` : ''),
      h('div', { class: 'row' }, c.status === 'open' ? h('button', { onClick: async () => { await api(`/ops/cases/${c.id}/ack`, { method: 'POST', body: {} }); rerender(); } }, 'Acknowledge') : null,
        c.status !== 'resolved' ? h('button', { onClick: async () => { await api(`/ops/cases/${c.id}/assign`, { method: 'POST', body: {} }); rerender(); } }, 'Take') : null,
        c.status !== 'resolved' ? h('button', { class: 'primary', onClick: async () => { await api(`/ops/cases/${c.id}/resolve`, { method: 'POST', body: { note: 'Contacted and safe' } }); rerender(); } }, 'Resolve') : null)])));
  },
  async hazards(b, rerender) {
    const q = await api('/staff/hazards');
    if (!q.length) { b.append(h('p', null, 'The moderation queue is empty.')); return; }
    b.append(h('p', { class: 'muted' }, 'Verified blocking hazards close the path in routing. Unverified reports only add a small risk penalty. Rejecting lowers the reporter\'s trust; low trust pauses reporting.'));
    for (const x of q) b.append(h('div', { class: 'card' }, h('strong', null, HAZ[x.type]), ` · trust ${x.trust} · ${x.corroborations} corroboration(s) · reporter ${x.reporter} · ${ago(x.createdAt)}`, h('p', null, x.note || '(no note)'), x.photo ? h('img', { src: x.photo, alt: 'Reporter photo', style: 'max-width:240px;border-radius:8px' }) : null,
      h('div', { class: 'row' }, h('button', { class: 'primary', onClick: async () => { await api(`/staff/hazards/${x.id}/verify`, { method: 'POST', body: {} }); toast('Verified'); rerender(); } }, 'Verify'), h('button', { class: 'danger', onClick: async () => { await api(`/staff/hazards/${x.id}/reject`, { method: 'POST', body: {} }); toast('Rejected'); rerender(); } }, 'Reject'))));
  },
  async shelters(b, rerender) {
    const list = await api('/shelters');
    b.append(h('p', { class: 'muted' }, 'Edits are recorded in the audit log and take effect in routing immediately. ', SIM_BADGE('SIMULATED DATA')));
    for (const s of list) {
      const occ = h('input', { id: `o-${s.id}`, type: 'number', min: 0, value: s.occupancy, style: 'max-width:8rem' });
      const flags = { ...Object.fromEntries(['open', 'stepFree', 'lift', 'accessibleToilet', 'power', 'quiet', 'signLanguage', 'animals'].map((k) => [k, s[k]])) };
      b.append(h('fieldset', null, h('legend', null, s.name), h('div', { class: 'row' }, Object.keys(flags).map((k) => h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: flags[k], onChange: (e) => { flags[k] = e.target.checked; } }), k))),
        h('div', { class: 'row' }, h('label', { for: `o-${s.id}` }, `Occupancy (capacity ${s.capacity})`), occ, h('button', { class: 'primary', onClick: async () => { await api(`/staff/shelters/${s.id}`, { method: 'PUT', body: { ...flags, occupancy: +occ.value } }); toast(`${s.name} updated`); rerender(); } }, 'Save'))));
    }
  },
  async sim(b, rerender) {
    const [st, map] = await Promise.all([api('/sim'), api('/map')]);
    const act = async (action, arg) => { try { await api('/sim', { method: 'POST', body: { action, arg } }); rerender(); } catch (e) { toast(e.message, 'error'); } };
    b.append(h('section', { class: 'sev sev-3' }, h('span', { class: 'ico', 'aria-hidden': 'true' }, '🧪'), h('div', null, h('div', { class: 'word' }, 'Simulation control'), 'Everything injected here is labelled SIMULATION for every user. Connected users replan automatically.')));
    b.append(h('div', { class: 'row' }, h('button', { class: 'danger primary', onClick: () => act('reset') }, 'Reset simulation'), st.replay.running ? h('button', { onClick: () => act('replay-stop') }, 'Stop replay') : null));
    b.append(h('h2', null, 'Lifts'), h('div', { class: 'row' }, map.lifts.map((l) => h('div', { class: 'card' }, h('strong', null, `${l.id} ${l.name}`), h('p', null, l.status === 'working' ? '✓ working' : `✕ ${l.status}`), h('div', { class: 'row' }, h('button', { onClick: () => act('lift-fail', l.id) }, 'Fail'), h('button', { onClick: () => act('lift-unknown', l.id) }, 'Unknown'), h('button', { onClick: () => act('lift-fix', l.id) }, 'Restore'))))));
    b.append(h('h2', null, 'Flooding'), h('div', { class: 'row' }, map.blackspots.map((s) => h('div', { class: 'card' }, h('strong', null, s.id), h('p', null, s.name, s.floodedNow ? ' · 🌊 FLOODED' : ''), h('div', { class: 'row' }, h('button', { onClick: () => act('flood', s.id) }, 'Flood'), h('button', { onClick: () => act('flood-clear', s.id) }, 'Clear'))))));
    b.append(h('h2', null, 'Shelter capacity'), h('div', { class: 'row' }, map.shelters.map((s) => h('div', { class: 'card' }, h('strong', null, s.name), h('p', null, `${s.occupancy}/${s.capacity}`), h('div', { class: 'row' }, h('button', { onClick: () => act('shelter-full', s.id) }, 'Mark full'), h('button', { onClick: () => act('shelter-free', s.id) }, 'Free up'))))));
    b.append(h('h2', null, 'Warning override'), h('div', { class: 'row' }, [['WRAINA', 'Amber Rainstorm Warning', 2], ['WRAINR', 'Red Rainstorm Warning', 3], ['WRAINB', 'Black Rainstorm Warning', 4], ['TC8NE', 'No. 8 Northeast Gale or Storm Signal (Typhoon)', 3]].map(([code, name, level]) => h('button', { onClick: () => act('warning', { code, name, level }) }, name.replace(' Warning', ''))), h('button', { onClick: () => act('warning', null) }, 'Clear warning')));
    b.append(h('h2', null, 'Replay a past typhoon / rainstorm'), h('p', { class: 'muted' }, st.replayScript.title, '. Timeline is a scripted demo; verify against HKO history before real use.'),
      h('ol', null, st.replayScript.steps.map((s, i) => h('li', { 'aria-current': st.replay.step === i ? 'step' : null, style: st.replay.step === i ? 'font-weight:800' : '' }, s.label))),
      h('div', { class: 'row' }, h('button', { class: 'primary', onClick: () => act('replay-start', 8) }, '▶ Play (8 s per step)'), h('button', { onClick: () => act('replay-start', 20) }, 'Play slowly (20 s)')));
    b.append(h('h2', null, 'Simulation log'), h('ul', null, st.log.map((l) => h('li', null, `${new Date(l.at).toLocaleTimeString()} · ${l.actor}: ${l.text}`))));
  },
  async publish(b) {
    const text = h('textarea', { id: 'pt', rows: 3, maxlength: 280 }), lv = h('select', { id: 'pl' }, [[1, 'Advisory'], [2, 'Alert'], [3, 'Severe'], [4, 'Critical']].map(([v, l]) => h('option', { value: v, selected: v === 2 }, l)));
    const a = await api('/alerts');
    b.append(h('p', { class: 'muted' }, 'Operator notices are labelled as operator messages, never as official Observatory warnings.'),
      h('div', { class: 'field' }, h('label', { for: 'pt' }, 'Notice text (max 280 characters)'), text), h('div', { class: 'field' }, h('label', { for: 'pl' }, 'Severity'), lv),
      h('button', { class: 'primary', onClick: async () => { try { await api('/ops/publish', { method: 'POST', body: { text: text.value, level: +lv.value } }); toast('Published'); text.value = ''; window.pgBoot.loadCore(); } catch (e) { toast(e.message, 'error'); } } }, 'Publish'),
      h('h2', null, 'Manual notices in force'), ...a.active.filter((x) => x.manual).map((x) => h('div', { class: 'card' }, x.text, h('div', null, h('button', { onClick: async () => { await api(`/ops/alerts/${x.id}/clear`, { method: 'POST', body: {} }); toast('Cleared'); window.pgBoot.loadCore(); } }, 'Clear')))));
  },
  async audit(b) {
    const log = await api('/ops/audit');
    b.append(tbl(['Time', 'Actor', 'Role', 'Action', 'Target'], log.map((l) => [new Date(l.at).toLocaleTimeString(), l.actor, l.role || '', l.action, l.target])));
  },
  async agent(b) {
    const [tools, traces] = await Promise.all([api('/agent/tools'), api('/ops/traces')]);
    b.append(h('h2', null, 'Tool registry'), tbl(['Tool', 'Action tag', 'Purpose'], tools.map((t) => [t.name, h('span', { class: `tag ${t.tag}` }, t.tag), t.desc || 'Never available to the agent'])),
      h('h2', null, 'Recent traces'), tbl(['When', 'Message', 'Calls', 'Flags'], traces.map((t) => [ago(t.at), t.message, t.trace.map((x) => `${x.tool}${x.error ? ' ✕' : ''}`).join(', '), (t.flags || []).join(', ')])));
  },
};
