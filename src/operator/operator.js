import './operator.css';

const SOURCE_LINKS = {
  hko: 'https://www.hko.gov.hk/en/open-data/open-data-info.htm',
  api: 'https://data.weather.gov.hk/weatherAPI/opendata/weather.php',
  marine: 'https://data.gov.hk/en-data/dataset/hydro-hk-md-typhoon-shelters',
};

const reports = [
  { id: 'RPT-184', type: 'Blocked pavement', area: 'North Point waterfront', age: '8 min ago', trust: 'Unverified', severity: 'Advisory' },
  { id: 'RPT-181', type: 'Surface flooding', area: 'Chai Wan Road', age: '22 min ago', trust: 'Pending review', severity: 'High' },
  { id: 'RPT-176', type: 'Fallen tree', area: 'Aberdeen Praya', age: '41 min ago', trust: 'Staff verified', severity: 'Medium' },
];

const timeline = [
  ['14:32', 'HKO warning snapshot ingested', 'Warning summary available; no operator event created.', 'HKO warning summary', 'warning'],
  ['14:15', 'Regional observations refreshed', 'Station-level readings are provisional and 10-minute data is visible.', 'HKO regional observations', 'info'],
  ['13:50', 'Marine layer version recorded', 'Typhoon shelter geometry is coastal context for boats only.', 'Marine Department', 'success'],
  ['13:04', 'Acknowledgement escalated', 'No response after the configured delay; operator review requested.', 'PathGuard app event', 'watch'],
];

export function renderOperator(target, announce, initialView = 'overview') {
  let activeView = initialView;
  let replayPosition = 42;
  let replayTimer = null;
  let replayPlaying = false;
  let simulationEnabled = false;
  let demoWarningEnabled = false;

  const render = () => {
    target.innerHTML = activeView === 'replay'
      ? replayMarkup({ replayPosition, replayPlaying, simulationEnabled, demoWarningEnabled })
      : overviewMarkup();
    bind();
  };

  const bind = () => {
    target.querySelectorAll('[data-operator-view]').forEach((button) => {
      button.addEventListener('click', () => {
        activeView = button.dataset.operatorView;
        if (activeView === 'replay') {
          window.location.hash = '#replay';
          return;
        }
        if (activeView === 'hazards') {
          window.location.hash = '#operator-hazards';
          return;
        }
        if (activeView === 'escalations') {
          window.location.hash = '#operator-escalations';
          return;
        }
        if (activeView === 'audit') {
          window.location.hash = '#operator-audit';
          return;
        }
        if (activeView === 'overview') {
          window.location.hash = '#operator';
          return;
        }
        render();
      });
    });

    target.querySelectorAll('[data-replay-toggle]').forEach((button) => button.addEventListener('click', () => {
      simulationEnabled = !simulationEnabled;
      if (!simulationEnabled) stopReplay();
      render();
      announce(simulationEnabled ? 'Simulation mode enabled. Replay controls are isolated from real users.' : 'Simulation mode disabled.');
    }));

    const range = target.querySelector('[data-replay-position]');
    if (range) range.addEventListener('input', () => {
      replayPosition = Number(range.value);
      const readout = target.querySelector('[data-replay-readout]');
      const date = target.querySelector('[data-replay-date]');
      if (readout) readout.textContent = replayLabel(replayPosition);
      if (date) date.textContent = replayDate(replayPosition);
      target.querySelectorAll('[data-checkpoint]').forEach((item) => item.classList.toggle('is-active', item.dataset.checkpoint === checkpointFor(replayPosition)));
    });

    target.querySelectorAll('[data-replay-play]').forEach((button) => button.addEventListener('click', () => {
      if (!simulationEnabled) return;
      replayPlaying = !replayPlaying;
      if (replayPlaying) startReplay(); else stopReplay();
      render();
      announce(replayPlaying ? 'Historical replay started.' : 'Historical replay paused.');
    }));

    target.querySelectorAll('[data-replay-reset]').forEach((button) => button.addEventListener('click', () => {
      replayPosition = 0;
      replayPlaying = false;
      stopReplay();
      render();
      announce('Replay reset to the first historical checkpoint.');
    }));

    const toggle = target.querySelector('[data-demo-toggle]');
    if (toggle) toggle.addEventListener('change', () => {
      demoWarningEnabled = toggle.checked;
      render();
      announce(demoWarningEnabled ? 'Labelled demo warning control enabled for the simulated workspace only.' : 'Demo warning control disabled.');
    });

    target.querySelectorAll('[data-stage-demo]').forEach((button) => button.addEventListener('click', () => announce('Demo warning staged in the simulated workspace only. It cannot reach real users, caregivers, or official channels.')));

    target.querySelectorAll('[data-report-filter]').forEach((select) => select.addEventListener('change', () => {
      const value = select.value;
      const table = target.querySelector('[data-report-table]');
      if (table) table.innerHTML = reportRows(value);
    }));
  };

  const startReplay = () => {
    stopReplay();
    replayTimer = window.setInterval(() => {
      replayPosition = replayPosition >= 100 ? 0 : replayPosition + 1;
      const range = target.querySelector('[data-replay-position]');
      const readout = target.querySelector('[data-replay-readout]');
      const date = target.querySelector('[data-replay-date]');
      if (range) range.value = String(replayPosition);
      if (readout) readout.textContent = replayLabel(replayPosition);
      if (date) date.textContent = replayDate(replayPosition);
      target.querySelectorAll('[data-checkpoint]').forEach((item) => item.classList.toggle('is-active', item.dataset.checkpoint === checkpointFor(replayPosition)));
    }, 900);
  };

  const stopReplay = () => {
    if (replayTimer !== null) window.clearInterval(replayTimer);
    replayTimer = null;
  };

  render();
  return () => stopReplay();
}

function overviewMarkup() {
  return `<div class="operator-console">
    ${consoleHeader('Operations overview', 'Weather inputs, ingestion health and app activity')}
    <div class="operator-subnav" role="group" aria-label="Operator workspace views">
      ${tab('overview', 'Overview', true)}${tab('replay', 'Replay & simulation')}${tab('hazards', 'Report queue')}${tab('escalations', 'Acknowledgements')}${tab('audit', 'Audit log')}
    </div>
    <section class="op-boundary" aria-label="Data boundary"><span class="op-info-icon" aria-hidden="true">i</span><p><strong>Data boundary:</strong> only Hong Kong Observatory open data and the Marine Department typhoon-shelter dataset are approved sources. Marine shelters are sheltered water for boats, not destinations for people. Reports below are advisory and app-generated.</p><a href="#sources">Source register</a></section>
    <div class="op-metrics">
      ${metric('Current warning state', 'WATCH', 'No active evacuation event', 'amber', 'HKO')}
      ${metric('Last successful pull', '14:32', '4 min ago · freshness target', 'green', 'Healthy')}
      ${metric('Reports awaiting review', '12', '3 high-priority · oldest 41 min', 'coral', 'Queue')}
      ${metric('Acknowledgements', '96.4%', '2 escalations open · last 24 h', 'blue', 'App')}
    </div>
    <div class="op-grid">
      <section class="op-panel" aria-labelledby="op-feed-title"><div class="op-panel-heading"><div><h2 id="op-feed-title">Feed status</h2><p>Operational weather and marine ingestion</p></div><span class="op-small-label">As of 14:36 HKT</span></div><div class="op-feed-list">${feedRow('HKO warning summary', 'Weather warning information', '14:32 HKT', '4 min', 'Healthy')}${feedRow('Regional observations', 'Station-level, provisional', '14:15 HKT', '21 min', 'Review')}${feedRow('Climate history', 'Daily rainfall CSV · 25 stations', '18 Jun 2024', 'Monthly', 'Healthy')}${feedRow('Marine typhoon shelters', 'Marine Department CSDI layer', '24 Jun 2025', 'Versioned', 'Healthy')}</div><p class="op-footnote">Freshness is the last successful ingestion, not a forecast. If HKO is unreachable, retain the last good record with an outdated label and invent no alert.</p></section>
      <section class="op-panel" aria-labelledby="op-timeline-title"><div class="op-panel-heading"><div><h2 id="op-timeline-title">Alert & event timeline</h2><p>Source records and app activity</p></div><button class="op-text-button" type="button" data-operator-view="audit">Full audit →</button></div><ol class="op-timeline">${timeline.map((item) => timelineItem(item)).join('')}</ol></section>
    </div>
    <div class="op-grid op-lower-grid">
      <section class="op-panel" aria-labelledby="op-reports-title"><div class="op-panel-heading"><div><h2 id="op-reports-title">App-generated report queue</h2><p>Advisory only · staff review required</p></div><button class="op-text-button" type="button" data-operator-view="hazards">Open queue →</button></div><div class="op-queue-summary"><strong>12<small>pending</small></strong><div>${queueBar('High priority', 3, 'coral')}${queueBar('Needs verification', 6, 'amber')}${queueBar('Low priority', 3, 'blue')}</div></div><div class="op-mini-list">${reports.slice(0, 2).map((report) => `<div class="op-mini-row"><span class="op-hazard-mark" aria-hidden="true">!</span><div><strong>${report.type}</strong><span>${report.area} · ${report.age}</span></div><span class="op-pill op-pill--amber">${report.severity}</span></div>`).join('')}</div></section>
      <section class="op-panel" aria-labelledby="op-ack-title"><div class="op-panel-heading"><div><h2 id="op-ack-title">Acknowledgement & escalation</h2><p>Consent-aware operator view</p></div><button class="op-text-button" type="button" data-operator-view="escalations">Review queue →</button></div><div class="op-ack-number"><strong>96.4%</strong><span>acknowledged in the last 24 hours</span></div><div class="op-progress" role="progressbar" aria-label="Acknowledgements in the last 24 hours" aria-valuenow="96.4" aria-valuemin="0" aria-valuemax="100"><span style="width: 96.4%"></span></div><div class="op-escalation-callout"><span aria-hidden="true">!</span><div><strong>2 open escalations</strong><p>Only coarse location and consented contact state are shown.</p></div></div></section>
    </div>
    ${sourceRegister()}
  </div>`;
}

function replayMarkup(state) {
  const checkpoint = checkpointFor(state.replayPosition);
  return `<div class="operator-console">
    ${consoleHeader('Historical replay', 'Replay real HKO history without touching live delivery')}
    <div class="operator-subnav" role="group" aria-label="Operator workspace views">${tab('overview', 'Overview')}${tab('replay', 'Replay & simulation', true)}${tab('hazards', 'Report queue')}${tab('escalations', 'Acknowledgements')}${tab('audit', 'Audit log')}</div>
    <section class="op-simulation-banner" role="status"><span class="op-simulation-mark" aria-hidden="true">▶</span><div><strong>SIMULATION · HISTORICAL REPLAY</strong><span>Nothing in this workspace is sent to real users or official channels.</span></div><button class="op-banner-toggle" type="button" data-replay-toggle>${state.simulationEnabled ? 'Simulation enabled' : 'Enable replay mode'}</button></section>
    ${state.simulationEnabled ? '' : '<div class="op-replay-gate" role="alert"><strong>Replay mode is off.</strong><span>Enable it above before playing records or creating a demo warning.</span></div>'}
    <section class="op-intro"><div><p class="op-kicker">FR-DAT-06 · real historical records</p><h2>Replay a documented weather event</h2><p>Use HKO best-track and climate records to review changing conditions. Historical context is not a forecast and this view makes no human shelter or accessibility-routing claim.</p></div><span class="op-source-chip">HKO open data</span></section>
    <section class="op-panel op-replay-panel" aria-labelledby="replay-controls-title"><div class="op-panel-heading"><div><h2 id="replay-controls-title">Typhoon Mangkhut · 2018</h2><p>Historical record · 14–17 September 2018 · original timestamps retained</p></div><span class="op-record-state"><span class="op-status-dot"></span>Fixture loaded</span></div><div class="op-replay-display"><div class="op-storm-orb" aria-hidden="true"><span></span><span></span><span></span></div><div><p class="op-kicker">Current replay position</p><strong data-replay-readout>${replayLabel(state.replayPosition)}</strong><p data-replay-date>${replayDate(state.replayPosition)}</p></div><div class="op-playback"><span>Playback</span><strong>1×</strong></div></div><label class="sr-only" for="operator-replay-range">Historical replay position</label><input id="operator-replay-range" class="op-range" data-replay-position type="range" min="0" max="100" value="${state.replayPosition}" ${state.simulationEnabled ? '' : 'disabled'}><div class="op-range-labels"><span>14 Sep · first signal</span><span>16 Sep · closest approach</span><span>17 Sep · recovery</span></div><div class="op-replay-controls"><button class="button button-primary" type="button" data-replay-play ${state.simulationEnabled ? '' : 'disabled'}>${state.replayPlaying ? 'Ⅱ Pause replay' : '▶ Play replay'}</button><button class="button" type="button" data-replay-reset ${state.simulationEnabled ? '' : 'disabled'}>Reset position</button><span class="op-control-note">Use the slider or play controls. Replay events are deterministic fixtures.</span></div></section>
    <div class="op-grid op-replay-lower"><section class="op-panel" aria-labelledby="checkpoint-title"><div class="op-panel-heading"><div><h2 id="checkpoint-title">Record checkpoints</h2><p>Original HKO timestamps retained for audit</p></div></div><div class="op-checkpoints"><div class="op-checkpoint ${checkpoint === 'start' ? 'is-active' : ''}" data-checkpoint="start"><span></span><div><small>14 Sep 2018 · 06:00</small><strong>Best track begins</strong><em>Tropical cyclone track point</em></div></div><div class="op-checkpoint ${checkpoint === 'closest' ? 'is-active' : ''}" data-checkpoint="closest"><span></span><div><small>16 Sep 2018 · 12:00</small><strong>Closest approach</strong><em>Track and warning records aligned</em></div></div><div class="op-checkpoint ${checkpoint === 'recovery' ? 'is-active' : ''}" data-checkpoint="recovery"><span></span><div><small>17 Sep 2018 · 18:00</small><strong>Rainfall recovery</strong><em>Daily climate context available</em></div></div></div><p class="op-footnote">Historical records are labelled historical, not a forecast. Store source payload and mapping version with each run.</p></section><section class="op-panel op-demo-panel" aria-labelledby="demo-title"><div class="op-panel-heading"><div><h2 id="demo-title">Demo warning</h2><p>Separated from real users and real delivery</p></div><span class="op-demo-badge">SAFE DEMO</span></div><label class="op-toggle"><input type="checkbox" data-demo-toggle ${state.demoWarningEnabled ? 'checked' : ''} ${state.simulationEnabled ? '' : 'disabled'}><span aria-hidden="true"></span><strong>Allow labelled demo warning</strong></label><p>This control can stage a warning in the simulated workspace only. It cannot fan out, notify caregivers, change live HKO status, or dispatch emergency services.</p><button class="button op-demo-button" type="button" data-stage-demo ${state.simulationEnabled && state.demoWarningEnabled ? '' : 'disabled'}>Stage demo warning</button></section></div>
    <aside class="op-audit-note"><span aria-hidden="true">✓</span><div><h2>Audit-oriented replay</h2><p>Retain the source record, original timestamp, fixture version, operator, playback speed and staged events. A replay never becomes an official warning.</p></div></aside>
    ${sourceRegister()}
  </div>`;
}

function consoleHeader(title, subtitle) { return `<header class="op-header"><div><p class="op-kicker">PathGuard operations</p><h1>${title}</h1><p>${subtitle}</p></div><span class="op-live"><span class="op-status-dot" aria-hidden="true"></span>Live data monitor</span></header>`; }
function tab(id, label, active = false) { return `<button class="op-tab ${active ? 'is-active' : ''}" type="button" aria-pressed="${active}"${active ? ' aria-current="page"' : ''} data-operator-view="${id}">${label}</button>`; }
function metric(label, value, detail, tone, badge) { return `<article class="op-metric"><div><h3>${label}</h3><b class="op-metric-badge op-metric-badge--${tone}">${badge}</b></div><strong>${value}</strong><p>${detail}</p></article>`; }
function feedRow(label, source, time, age, status) { return `<div class="op-feed-row"><span class="op-feed-dot ${status === 'Review' ? 'is-review' : ''}" aria-hidden="true"></span><div><strong>${label}</strong><span>${source}</span></div><time><strong>${time}</strong><span>${age}</span></time><span class="op-pill ${status === 'Review' ? 'op-pill--amber' : 'op-pill--green'}">${status}</span></div>`; }
function timelineItem(item) { return `<li class="op-timeline-item"><span class="op-timeline-dot op-timeline-dot--${item[4]}" aria-hidden="true"></span><div><div><strong>${item[0]}</strong><span>${item[3]}</span></div><strong>${item[1]}</strong><p>${item[2]}</p></div></li>`; }
function queueBar(label, value, tone) { return `<div class="op-queue-bar"><div><span>${label}</span><strong>${value}</strong></div><span><i class="op-bar--${tone}" style="width:${value / 12 * 100}%"></i></span></div>`; }
function sourceRegister() { return `<section id="sources" class="op-source-register" aria-labelledby="source-register-title"><div><p class="op-kicker">Source register</p><h2 id="source-register-title">Limits and attribution</h2></div><div><a href="${SOURCE_LINKS.hko}" target="_blank" rel="noreferrer">HKO open data ↗</a><a href="${SOURCE_LINKS.marine}" target="_blank" rel="noreferrer">Marine Department typhoon shelters ↗</a><a href="${SOURCE_LINKS.api}" target="_blank" rel="noreferrer">HKO weather API ↗</a></div><p>Verify current licence, attribution, update cadence and rate limits before release. HKO records drive weather context; the Marine Department layer is marine context only. Historical replay is not a forecast.</p></section>`; }
function reportRows(filter) { return reports.filter((report) => filter === 'High priority' ? report.severity === 'High' : filter === 'Unverified' ? report.trust === 'Unverified' : true).map((report) => `<tr><td><strong>${report.type}</strong><small>${report.id}</small></td><td>${report.area}</td><td>${report.age}</td><td><span class="op-pill op-pill--${report.trust === 'Staff verified' ? 'green' : report.trust === 'Unverified' ? 'amber' : 'blue'}">${report.trust}</span></td><td>${report.severity}</td><td><button class="button op-small-button" type="button">Review</button></td></tr>`).join(''); }
function getReplaySegment(position) { return position < 35 ? 'early' : position < 70 ? 'closest' : 'recovery'; }
function checkpointFor(position) { return getReplaySegment(position); }
function replayLabel(position) { return position < 35 ? 'Tropical cyclone · early signal' : position < 70 ? 'Tropical cyclone · closest approach' : 'Rainfall recovery observations'; }
function replayDate(position) { return position < 35 ? '14 Sep 2018 · 06:00 HKT' : position < 70 ? '16 Sep 2018 · 12:00 HKT' : '17 Sep 2018 · 18:00 HKT'; }

export function renderOperatorQueue(target, announce) {
  target.innerHTML = `<div class="operator-console"><header class="op-header"><div><p class="op-kicker">PathGuard operations</p><h2>App-generated report queue</h2><p>Advisory reports require staff review and remain separate from source feeds.</p></div><span class="op-count-badge">12 pending</span></header><div class="operator-subnav" role="group" aria-label="Operator workspace views">${tab('overview', 'Overview')}${tab('replay', 'Replay & simulation')}${tab('hazards', 'Report queue', true)}${tab('escalations', 'Acknowledgements')}${tab('audit', 'Audit log')}</div><div class="op-toolbar"><label>Show <select data-report-filter><option>All reports</option><option>High priority</option><option>Unverified</option></select></label><button class="button" type="button" data-report-export>Export review list</button></div><section class="op-panel op-table-panel"><div class="op-table-wrap"><table><caption class="sr-only">Pending app-generated hazard reports</caption><thead><tr><th scope="col">Report</th><th scope="col">Location</th><th scope="col">Age</th><th scope="col">Trust state</th><th scope="col">Severity</th><th scope="col">Action</th></tr></thead><tbody data-report-table>${reportRows('All reports')}</tbody></table></div><p class="op-footnote">Review actions are recorded with actor, timestamp, reason and source report. Reports are advisory only and cannot make a route or warning claim.</p></section></div>`;
  bindQueue(target, announce);
}

export function renderEscalationQueue(target, announce) {
  target.innerHTML = `<div class="operator-console"><header class="op-header"><div><p class="op-kicker">FR-ALR-04 · FR-CGV-02</p><h1>Acknowledgement & escalation queue</h1><p>Consent-aware app state. Contact and location details stay hidden without explicit permission.</p></div><span class="op-count-badge op-count-badge--coral">2 open</span></header><div class="operator-subnav" role="group" aria-label="Operator workspace views">${tab('overview', 'Overview')}${tab('replay', 'Replay & simulation')}${tab('hazards', 'Report queue')}${tab('escalations', 'Acknowledgements', true)}${tab('audit', 'Audit log')}</div><div class="op-escalation-stats"><div><small>Acknowledged</small><strong>96.4%</strong><span>last 24 hours</span></div><div><small>Needs help</small><strong>1</strong><span>operator review</span></div><div><small>Caregiver notified</small><strong>1</strong><span>awaiting response</span></div></div><section class="op-panel op-table-panel"><div class="op-table-wrap"><table><caption class="sr-only">Open acknowledgement escalations</caption><thead><tr><th scope="col">State</th><th scope="col">Subject</th><th scope="col">Reason</th><th scope="col">Last seen</th><th scope="col">Action</th></tr></thead><tbody><tr><td><span class="op-pill op-pill--coral">Needs operator review</span><small>ESC-029</small></td><td><strong>Demo profile · wheelchair user</strong></td><td>No acknowledgement after 3 min</td><td>13:04 · consented coarse area</td><td><button class="button op-small-button" type="button">Open</button></td></tr><tr><td><span class="op-pill op-pill--blue">Caregiver notified</span><small>ESC-027</small></td><td><strong>Demo profile · hard of hearing</strong></td><td>User tapped “I need help”</td><td>12:48 · consented coarse area</td><td><button class="button op-small-button" type="button">Open</button></td></tr></tbody></table></div><p class="op-footnote">Demo profiles are synthetic. This console does not dispatch emergency services or assert physical safety.</p></section></div>`;
  bindRouteTabs(target, announce);
}

export function renderAuditLog(target, announce) {
  const entries = [['14:32:08', 'ingestion-worker', 'Recorded HKO warning snapshot', 'hko_warning_snapshots / 8f31', 'success'], ['14:15:44', 'ingestion-worker', 'Imported regional observations', 'hko_regional_observations / batch-104', 'success'], ['14:04:13', 'operator.as', 'Opened escalation queue', 'escalation / ESC-029', 'view'], ['13:50:02', 'ingestion-worker', 'Recorded marine layer version', 'marine_typhoon_shelters / 2025-06-24', 'success']];
  target.innerHTML = `<div class="operator-console"><header class="op-header"><div><p class="op-kicker">FR-DAT-02 · audit trail</p><h1>Source and operator audit log</h1><p>Append-oriented activity view for source pulls, mappings and operator actions.</p></div><button class="button" type="button" data-audit-export>Export audit CSV</button></header><div class="operator-subnav" role="group" aria-label="Operator workspace views">${tab('overview', 'Overview')}${tab('replay', 'Replay & simulation')}${tab('hazards', 'Report queue')}${tab('escalations', 'Acknowledgements')}${tab('audit', 'Audit log', true)}</div><div class="op-toolbar"><label class="op-search">Search <input type="search" placeholder="Actor, entity or action"></label><label>Source <select><option>All sources</option><option>HKO</option><option>Marine Department</option><option>PathGuard app</option></select></label></div><section class="op-panel op-table-panel"><div class="op-table-wrap"><table><caption class="sr-only">PathGuard audit entries</caption><thead><tr><th scope="col">Time (HKT)</th><th scope="col">Actor</th><th scope="col">Action</th><th scope="col">Entity</th><th scope="col">Result</th></tr></thead><tbody>${entries.map((entry) => `<tr><td><strong>${entry[0]}</strong></td><td>${entry[1]}</td><td>${entry[2]}</td><td class="op-mono">${entry[3]}</td><td><span class="op-pill op-pill--${entry[4] === 'view' ? 'blue' : 'green'}">${entry[4]}</span></td></tr>`).join('')}</tbody></table></div><p class="op-footnote">Before release, confirm source terms, retention, access controls and rate limits with the publishers.</p></section></div>`;
  bindRouteTabs(target, announce);
}

function bindRouteTabs(target, announce) {
  target.querySelectorAll('[data-operator-view]').forEach((button) => button.addEventListener('click', () => {
    const view = button.dataset.operatorView;
    if (view === 'overview' || view === 'replay') window.location.hash = view === 'overview' ? '#operator' : '#replay';
    else if (view === 'hazards') window.location.hash = '#operator-hazards';
    else if (view === 'escalations') window.location.hash = '#operator-escalations';
    else window.location.hash = '#operator-audit';
    announce(`Opening ${button.textContent}.`);
  }));
}
function bindQueue(target, announce) { bindRouteTabs(target, announce); target.querySelector('[data-report-export]')?.addEventListener('click', () => announce('Review list export is staged for the operator audit trail.')); }
