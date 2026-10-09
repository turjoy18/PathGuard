import {
  HKO_SOURCE,
  ageLabel,
  formatUpdatedAt,
  freshnessState,
  sourceLine,
} from './weather-data.js';

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function number(value, suffix = '') {
  return Number.isFinite(Number(value)) ? `${Number(value)}${suffix}` : '—';
}

function sourceMarkup(snapshot, label = 'Source') {
  const line = sourceLine(snapshot);
  return `<div class="weather-source" data-freshness="${line.state}">
    <span>${escapeHtml(label)}: ${escapeHtml(HKO_SOURCE.shortName)}</span>
    <span aria-hidden="true">·</span>
    <time datetime="${escapeHtml(snapshot.fetchedAt ?? '')}">${escapeHtml(line.updated)}</time>
    <span class="weather-age">${escapeHtml(line.freshness)}</span>
  </div>`;
}

function warningSummary(snapshot) {
  if (!snapshot.warningDataAvailable) {
    return `<div class="weather-state weather-state--caution" role="status">
      <strong>HKO warning status is unavailable.</strong>
      <span>Check the Hong Kong Observatory directly. PathGuard is not inferring an alert.</span>
    </div>`;
  }
  if (!snapshot.warnings?.length) {
    return `<div class="weather-state weather-state--quiet" role="status">
      <strong>No current warning items were returned by HKO.</strong>
      <span>This is not an all-clear notice. Follow official HKO instructions.</span>
    </div>`;
  }
  return `<div class="weather-warning-list" role="list">
    ${snapshot.warnings.map((warning) => `<article class="weather-warning" role="listitem">
      <div class="weather-warning__heading">
        <span class="weather-warning__icon" aria-hidden="true">!</span>
        <div><p class="weather-eyebrow">${escapeHtml(warning.severity ?? 'HKO warning')}</p>
        <h3>${escapeHtml(warning.title)}</h3></div>
      </div>
      ${warning.instruction ? `<p>${escapeHtml(warning.instruction)}</p>` : ''}
      ${warning.issuedAt ? `<p class="weather-muted">Issued ${escapeHtml(formatUpdatedAt(warning.issuedAt))}</p>` : ''}
      <a href="${escapeHtml(warning.sourceUrl)}" target="_blank" rel="noreferrer">View raw HKO warning<span class="sr-only"> for ${escapeHtml(warning.title)}</span></a>
    </article>`).join('')}
  </div>`;
}

function currentConditions(snapshot) {
  const current = snapshot.current;
  if (!current) {
    return `<div class="weather-state" role="status">Current conditions are unavailable. The last known reading is not being presented as current.</div>`;
  }
  return `<div class="weather-current__grid">
    <div class="weather-reading weather-reading--primary"><span>Temperature</span><strong>${number(current.temperature, '°C')}</strong></div>
    <div class="weather-reading"><span>Humidity</span><strong>${number(current.humidity, '%')}</strong></div>
    <div class="weather-reading"><span>Feels like</span><strong>${number(current.feelsLike, '°C')}</strong></div>
    <div class="weather-reading"><span>Wind</span><strong>${escapeHtml(current.wind ?? '—')}</strong></div>
  </div>
  <p class="weather-condition">${escapeHtml(current.condition ?? 'Condition unavailable')}</p>
  <p class="weather-muted">Station: ${escapeHtml(current.location ?? 'HKO station not specified')}</p>`;
}

function regionalCards(snapshot) {
  if (!snapshot.regional?.length) {
    return `<div class="weather-state" role="status">Regional observations are unavailable.</div>`;
  }
  return `<div class="weather-card-grid">
    ${snapshot.regional.map((station) => `<article class="weather-region-card">
      <h3>${escapeHtml(station.name ?? 'HKO station')}</h3>
      <dl>
        <div><dt>Temperature</dt><dd>${number(station.temperature, '°C')}</dd></div>
        <div><dt>Humidity</dt><dd>${number(station.humidity, '%')}</dd></div>
        <div><dt>Rain, past hour</dt><dd>${number(station.rainfall, ' mm')}</dd></div>
      </dl>
    </article>`).join('')}
  </div>`;
}

function rainfallCard(snapshot) {
  const rainfall = snapshot.rainfall;
  if (!rainfall) return `<div class="weather-state" role="status">Rainfall observation is unavailable.</div>`;
  return `<div class="weather-rainfall">
    <div><span class="weather-eyebrow">${escapeHtml(rainfall.period ?? 'Recent rainfall')}</span><strong>${number(rainfall.amount, ` ${rainfall.unit ?? 'mm'}`)}</strong></div>
    <p>Station: ${escapeHtml(rainfall.station ?? 'HKO station not specified')}</p>
  </div>`;
}

function climateCard(snapshot) {
  const climate = snapshot.climate;
  if (!climate) {
    return `<div class="weather-state" role="status">Historical climate context is unavailable.</div>`;
  }
  return `<div class="weather-climate">
    <div class="weather-climate__headline"><strong>${number(climate.percentile, 'th percentile')}</strong><span>of historical ${escapeHtml(climate.metric ?? 'observations')} for ${escapeHtml(climate.month ?? 'this month')}</span></div>
    <p>${escapeHtml(climate.trend ?? 'Historical comparison is available.')}</p>
    <p class="weather-muted">${escapeHtml(climate.station ?? 'HKO station not specified')} · ${number(climate.value, ` ${climate.unit ?? 'mm'}`)}</p>
    <p class="weather-note">Historical context, not a forecast.</p>
  </div>`;
}

export function renderWeatherExperience(container, snapshot) {
  if (!container) throw new Error('A container is required');
  const state = freshnessState(snapshot);
  const staleNotice = state === 'stale' || snapshot?.stale
    ? `<div class="weather-outage" role="status"><strong>Weather data is outdated.</strong> HKO could not be reached for a fresh reading. No new alert has been inferred.</div>`
    : '';
  const fixtureNotice = snapshot?.demo
    ? `<div class="weather-fixture" role="note"><strong>Demo / fixture data</strong> — this display is not live HKO status.</div>`
    : '';

  container.innerHTML = `<div class="weather-experience" data-freshness="${escapeHtml(state)}">
    ${fixtureNotice}
    ${staleNotice}
    <header class="weather-header">
      <div><p class="weather-eyebrow">Local weather context</p><h2 id="weather-title">Hong Kong weather</h2></div>
      <a class="weather-raw-link" href="${HKO_SOURCE.openDataUrl}" target="_blank" rel="noreferrer">Open HKO source</a>
    </header>
    <section class="weather-section weather-section--warning" aria-labelledby="weather-warning-title">
      <div class="weather-section__heading"><div><p class="weather-eyebrow">Official status</p><h2 id="weather-warning-title">Warning summary</h2></div>${sourceMarkup(snapshot, 'Warning data')}</div>
      ${warningSummary(snapshot)}
    </section>
    <section class="weather-section" aria-labelledby="weather-current-title">
      <div class="weather-section__heading"><div><p class="weather-eyebrow">At the HKO reference station</p><h2 id="weather-current-title">Current conditions</h2></div>${sourceMarkup(snapshot, 'Observation')}</div>
      ${currentConditions(snapshot)}
    </section>
    <section class="weather-section" aria-labelledby="weather-regional-title">
      <div class="weather-section__heading"><div><p class="weather-eyebrow">Station-level observations</p><h2 id="weather-regional-title">Regional conditions</h2></div>${sourceMarkup(snapshot, 'Regional data')}</div>
      ${regionalCards(snapshot)}
    </section>
    <section class="weather-section" aria-labelledby="weather-rain-title">
      <div class="weather-section__heading"><div><p class="weather-eyebrow">Automatic weather stations</p><h2 id="weather-rain-title">Rainfall</h2></div>${sourceMarkup(snapshot, 'Rainfall data')}</div>
      ${rainfallCard(snapshot)}
    </section>
    <section class="weather-section" aria-labelledby="weather-climate-title">
      <div class="weather-section__heading"><div><p class="weather-eyebrow">Climate context</p><h2 id="weather-climate-title">How unusual is it?</h2></div>${sourceMarkup(snapshot, 'Climate data')}</div>
      ${climateCard(snapshot)}
    </section>
    <footer class="weather-attribution">
      <p>${escapeHtml(HKO_SOURCE.attribution)}</p>
      <p>Weather-driven status last checked: ${escapeHtml(formatUpdatedAt(snapshot?.fetchedAt))} (${escapeHtml(ageLabel(snapshot?.fetchedAt))}).</p>
      <a href="${HKO_SOURCE.openDataUrl}" target="_blank" rel="noreferrer">Raw-source links and HKO open-data information</a>
    </footer>
  </div>`;
  return container.firstElementChild;
}

export function mountWeatherExperience(selector, snapshot) {
  const container = typeof selector === 'string' ? document.querySelector(selector) : selector;
  return renderWeatherExperience(container, snapshot);
}
