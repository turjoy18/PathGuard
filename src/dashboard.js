const fixture = {
  user: {
    firstName: 'Alex',
    profileLabel: 'Wheelchair user · Deaf',
    readiness: 82,
    completed: ['Mobility needs', 'Alert channels', 'Text size'],
    missing: ['Caregiver consent renewal'],
  },
  weather: {
    status: 'Watch',
    title: 'Heavy rain is possible in your area',
    detail: 'Rain bands may affect Hong Kong Island this afternoon. Review your alert plan before travelling.',
    source: 'Hong Kong Observatory (HKO)',
    updated: 'Today, 14:20 HKT',
    age: '18 min old',
    isStale: true,
    outage: true,
  },
  alerts: [
    {
      severity: 'Watch',
      title: 'Heavy Rain Warning',
      instruction: 'Avoid low-lying paths and check conditions before you leave.',
      area: 'Hong Kong Island and Kowloon',
      source: 'HKO warning summary',
      updated: 'Today, 14:20 HKT',
      state: 'Active · last known update',
    },
    {
      severity: 'Information',
      title: 'Typhoon Signal No. 1',
      instruction: 'Stay aware of updates from official sources. No evacuation action is advised by this signal.',
      area: 'Hong Kong Observatory area',
      source: 'HKO warning information',
      updated: 'Today, 13:55 HKT',
      state: 'Active · last known update',
    },
  ],
  marineShelters: [
    { name: 'Causeway Bay Typhoon Shelter', context: 'Sheltered water · 1.8 km away', updated: 'Source version 2025-06-24' },
    { name: 'Aberdeen South Typhoon Shelter', context: 'Sheltered water · 4.6 km away', updated: 'Source version 2025-06-24' },
  ],
  climate: [
    { label: 'Rainfall today', value: '84 mm', comparison: '92nd percentile for October', tone: 'high' },
    { label: 'Wind at Waglan Island', value: '38 km/h', comparison: '76th percentile for October', tone: 'medium' },
    { label: 'Temperature', value: '29.4°C', comparison: '64th percentile for October', tone: 'low' },
  ],
  caregiver: {
    name: 'Grace Chen',
    relationship: 'Primary caregiver',
    status: 'Connected',
    lastCheckIn: '8 minutes ago',
    sharing: 'Status only · location paused',
  },
};

function escapeHTML(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function renderStatusBanner(weather) {
  return `
    <section class="status-panel" aria-labelledby="status-title">
      <div class="status-panel-topline">
        <span class="status-label"><span class="status-symbol" aria-hidden="true">!</span>Area status</span>
        <span class="status-word">${escapeHTML(weather.status)}</span>
      </div>
      <div class="status-panel-content">
        <div>
          <h2 id="status-title">${escapeHTML(weather.title)}</h2>
          <p>${escapeHTML(weather.detail)}</p>
        </div>
        <button class="button button-light" type="button" data-action="check-area">Check my area <span aria-hidden="true">→</span></button>
      </div>
      <div class="status-source" aria-label="Weather data source and freshness">
        <span class="source-icon" aria-hidden="true">◌</span>
        <span><strong>Source:</strong> ${escapeHTML(weather.source)} · <strong>Updated:</strong> ${escapeHTML(weather.updated)} · ${escapeHTML(weather.age)}</span>
        <span class="stale-pill">Stale</span>
      </div>
    </section>
  `;
}

function renderOutageNotice(weather) {
  return `
    <aside class="outage-notice" role="status" aria-live="polite" aria-labelledby="outage-title">
      <span class="outage-icon" aria-hidden="true">↯</span>
      <div>
        <h2 id="outage-title">Weather feed unavailable</h2>
        <p>Showing the last known HKO snapshot from <strong>${escapeHTML(weather.updated)}</strong>. PathGuard will not invent a new alert while the source is unreachable.</p>
      </div>
      <span class="outage-state">Last known data</span>
    </aside>
  `;
}

function renderAlert(alert) {
  const severityClass = alert.severity.toLowerCase();
  return `
    <article class="alert-card ${severityClass}">
      <div class="alert-card-icon" aria-hidden="true">${alert.severity === 'Watch' ? '!' : 'i'}</div>
      <div class="alert-card-main">
        <div class="alert-card-heading">
          <div>
            <span class="severity-tag">${escapeHTML(alert.severity)}</span>
            <h3>${escapeHTML(alert.title)}</h3>
          </div>
          <span class="alert-state">${escapeHTML(alert.state)}</span>
        </div>
        <p class="alert-instruction">${escapeHTML(alert.instruction)}</p>
        <div class="alert-meta">
          <span><strong>Area</strong> ${escapeHTML(alert.area)}</span>
          <span><strong>Source</strong> ${escapeHTML(alert.source)}</span>
          <span><strong>Updated</strong> ${escapeHTML(alert.updated)}</span>
        </div>
      </div>
      <button class="text-button" type="button" data-action="read-alert">Read aloud <span aria-hidden="true">↗</span></button>
    </article>
  `;
}

function renderClimateCard(item) {
  return `
    <li class="climate-item">
      <div class="climate-item-heading"><span>${escapeHTML(item.label)}</span><span class="climate-dot ${escapeHTML(item.tone)}" aria-hidden="true"></span></div>
      <strong>${escapeHTML(item.value)}</strong>
      <span>${escapeHTML(item.comparison)}</span>
    </li>
  `;
}

function renderDashboard(target, announce) {
  target.innerHTML = `
    <div class="page-heading">
      <div>
        <div class="eyebrow">Thursday · 09 October 2025 · Hong Kong</div>
        <h1>Good afternoon, ${escapeHTML(fixture.user.firstName)}</h1>
        <p class="page-intro">Your safety picture, in one place.</p>
      </div>
      <div class="fixture-label"><span class="fixture-dot" aria-hidden="true"></span>Fixture data · not live</div>
    </div>

    ${renderStatusBanner(fixture.weather)}
    ${renderOutageNotice(fixture.weather)}

    <section class="quick-actions" aria-labelledby="quick-actions-title">
      <div class="section-heading compact-heading">
        <div><span class="eyebrow">Ready when you are</span><h2 id="quick-actions-title">Quick actions</h2></div>
      </div>
      <div class="action-grid">
        <a class="action-card action-card-primary" href="#map" data-view="map">
          <span class="action-icon" aria-hidden="true">⌖</span>
          <span><strong>Open live map</strong><small>See weather context and hazards</small></span>
          <span class="action-arrow" aria-hidden="true">↗</span>
        </a>
        <a class="action-card" href="#replay" data-view="replay">
          <span class="action-icon" aria-hidden="true">↻</span>
          <span><strong>Replay an event</strong><small>Practice with historical HKO data</small></span>
          <span class="action-arrow" aria-hidden="true">↗</span>
        </a>
        <a class="action-card" href="#alerts" data-view="alerts">
          <span class="action-icon" aria-hidden="true">!</span>
          <span><strong>Review alerts</strong><small>${fixture.alerts.length} active fixture warnings</small></span>
          <span class="action-arrow" aria-hidden="true">↗</span>
        </a>
        <button class="action-card action-card-help" type="button" data-action="help">
          <span class="action-icon" aria-hidden="true">♡</span>
          <span><strong>I need help</strong><small>Notify my caregiver and operator</small></span>
          <span class="action-arrow" aria-hidden="true">→</span>
        </button>
      </div>
    </section>

    <div class="content-grid">
      <section class="panel alerts-panel" aria-labelledby="alerts-title">
        <div class="section-heading">
          <div><span class="eyebrow">Official updates</span><h2 id="alerts-title">Active alerts <span class="heading-count">${fixture.alerts.length}</span></h2></div>
          <a class="text-link" href="#alerts" data-view="alerts">View all <span aria-hidden="true">→</span></a>
        </div>
        <div class="alert-list">${fixture.alerts.map(renderAlert).join('')}</div>
        <p class="panel-footnote"><span class="footnote-icon" aria-hidden="true">i</span> These are weather warnings from HKO, not PathGuard-issued emergency orders. Follow official instructions.</p>
      </section>

      <section class="panel readiness-panel" aria-labelledby="readiness-title">
        <div class="section-heading">
          <div><span class="eyebrow">Personal setup</span><h2 id="readiness-title">Profile readiness</h2></div>
          <a class="text-link" href="#settings" data-view="settings">Edit <span aria-hidden="true">→</span></a>
        </div>
        <div class="readiness-score"><strong>${fixture.user.readiness}%</strong><span>ready for personalised alerts</span></div>
        <div class="progress-track" role="progressbar" aria-label="Profile readiness" aria-valuenow="${fixture.user.readiness}" aria-valuemin="0" aria-valuemax="100"><span style="width: ${fixture.user.readiness}%"></span></div>
        <p class="profile-description">${escapeHTML(fixture.user.profileLabel)} · visual alerts and vibration are enabled.</p>
        <div class="missing-item"><span class="warning-mark" aria-hidden="true">!</span><span><strong>One item needs attention</strong><small>${escapeHTML(fixture.user.missing[0])}</small></span><a href="#caregiver" data-view="caregiver" class="small-link">Review</a></div>
      </section>
    </div>

    <div class="content-grid lower-grid">
      <section class="panel marine-panel" aria-labelledby="marine-title">
        <div class="section-heading">
          <div><span class="eyebrow">Coastal context</span><h2 id="marine-title">Typhoon shelters</h2></div>
          <a class="text-link" href="#map" data-view="map">Open map <span aria-hidden="true">→</span></a>
        </div>
        <div class="marine-callout"><span class="boat-icon" aria-hidden="true">⌁</span><p><strong>For boats only.</strong> These are Marine Department sheltered-water locations, not places for people to evacuate to.</p></div>
        <ul class="shelter-list">
          ${fixture.marineShelters.map((shelter) => `<li><span class="shelter-marker" aria-hidden="true">⌂</span><span><strong>${escapeHTML(shelter.name)}</strong><small>${escapeHTML(shelter.context)}</small></span><span class="source-version">${escapeHTML(shelter.updated)}</span></li>`).join('')}
        </ul>
        <div class="source-line"><span aria-hidden="true">◌</span> Source: Marine Department · refreshed as available · <a href="#map" data-view="map">See layer details</a></div>
      </section>

      <section class="panel climate-panel" aria-labelledby="climate-title">
        <div class="section-heading">
          <div><span class="eyebrow">Historical context</span><h2 id="climate-title">Climate risk snapshot</h2></div>
          <span class="historical-badge">Not a forecast</span>
        </div>
        <p class="panel-description">Today compared with daily HKO history for October at the nearest available station.</p>
        <ul class="climate-list">${fixture.climate.map(renderClimateCard).join('')}</ul>
        <div class="source-line"><span aria-hidden="true">◌</span> Source: HKO climate daily series · station: Waglan Island · updated monthly</div>
      </section>
    </div>

    <section class="panel caregiver-panel" aria-labelledby="caregiver-title">
      <div class="caregiver-main">
        <div class="caregiver-avatar" aria-hidden="true">GC</div>
        <div><span class="eyebrow">Support network</span><h2 id="caregiver-title">Caregiver status</h2><p><strong>${escapeHTML(fixture.caregiver.name)}</strong> · ${escapeHTML(fixture.caregiver.relationship)}</p></div>
      </div>
      <div class="caregiver-status"><span class="connected-dot" aria-hidden="true"></span><strong>${escapeHTML(fixture.caregiver.status)}</strong><span>Last check-in ${escapeHTML(fixture.caregiver.lastCheckIn)}</span></div>
      <div class="sharing-note"><span aria-hidden="true">◷</span><span><strong>Sharing:</strong> ${escapeHTML(fixture.caregiver.sharing)}</span></div>
      <a class="text-link" href="#caregiver" data-view="caregiver">Manage caregiver <span aria-hidden="true">→</span></a>
    </section>

    <section class="next-steps" aria-labelledby="next-title">
      <div><span class="eyebrow">Keep prepared</span><h2 id="next-title">Three useful next steps</h2></div>
      <ol>
        <li><span>1</span><strong>Confirm your alert test</strong><small>Make sure visual and vibration cues work.</small></li>
        <li><span>2</span><strong>Renew caregiver consent</strong><small>Keep your support network informed.</small></li>
        <li><span>3</span><strong>Explore replay mode</strong><small>Practice without affecting live users.</small></li>
      </ol>
    </section>

    <footer class="dashboard-footer"><span>PathGuard MVP · status information is informational only.</span><span>Data sources: HKO open data · Marine Department dataset</span></footer>
  `;

  target.querySelectorAll('[data-action="help"]').forEach((button) => {
    button.addEventListener('click', () => announce('Help request is a fixture action. In production it will notify the configured caregiver and operator.'));
  });
}

export { renderDashboard };
