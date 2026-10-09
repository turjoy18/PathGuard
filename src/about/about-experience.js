const sourceRegister = [
  {
    name: 'Weather warnings and warning summaries',
    publisher: 'Hong Kong Observatory (HKO)',
    use: 'Personalised warning context; original HKO wording is retained.',
    freshness: 'As and when warnings change. Show source time and age.',
    attribution: 'HKO attribution and licence terms: confirm before release.',
    href: 'https://www.hko.gov.hk/en/open-data/open-data-info.htm',
    linkLabel: 'HKO open-data information',
  },
  {
    name: 'Regional observations and rainfall',
    publisher: 'Hong Kong Observatory (HKO)',
    use: 'Local weather context, including provisional station observations.',
    freshness: 'Regional observations about every 10 minutes; rainfall past hour about every 15 minutes.',
    attribution: 'HKO attribution and licence terms: confirm before release.',
    href: 'https://data.weather.gov.hk/weatherAPI/opendata/weather.php',
    linkLabel: 'HKO weather API',
  },
  {
    name: 'Climate history and tropical cyclone records',
    publisher: 'Hong Kong Observatory (HKO)',
    use: 'Historical comparison and replay only. Never presented as a forecast.',
    freshness: 'Daily series are updated monthly; best-track data is updated yearly.',
    attribution: 'HKO attribution and licence terms: confirm before release.',
    href: 'https://www.hko.gov.hk/en/open-data/open-data-info.htm',
    linkLabel: 'HKO open-data information',
  },
  {
    name: 'Typhoon shelters',
    publisher: 'Marine Department · data.gov.hk',
    use: 'Marine map context for boats. Never a destination for people.',
    freshness: 'As and when there is an update; latest listed source update: 24 Jun 2025.',
    attribution: 'Marine Department attribution and licence terms: confirm before release.',
    href: 'https://data.gov.hk/en-data/dataset/hydro-hk-md-typhoon-shelters',
    linkLabel: 'Marine Department dataset',
  },
];

function externalLink(source, label) {
  return `<a href="${source}" target="_blank" rel="noreferrer">${label} <span aria-hidden="true">↗</span></a>`;
}

function renderSourceRows() {
  return sourceRegister.map((entry) => `
    <tr>
      <th scope="row"><strong>${entry.name}</strong><span>${entry.publisher}</span>${externalLink(entry.href, entry.linkLabel)}</th>
      <td>${entry.use}</td>
      <td>${entry.freshness}</td>
      <td>${entry.attribution}</td>
    </tr>
  `).join('');
}

function renderAbout(target) {
  target.innerHTML = `
    <div class="about-page">
      <section class="about-hero" aria-labelledby="about-intro-heading">
        <div class="about-hero-copy">
          <p class="about-kicker">About PathGuard · revised MVP</p>
          <h2 id="about-intro-heading">Clear warning context, with honest boundaries.</h2>
          <p class="about-lede">PathGuard helps people perceive, understand and acknowledge typhoon and rainstorm warnings from the Hong Kong Observatory. It adds local weather context, consent-based support, and a traceable view of the data behind each status.</p>
          <p class="about-promise"><strong>Our promise:</strong> make the next information step clearer without pretending that a weather feed is a safe route or a human shelter.</p>
          <div class="about-hero-actions"><a class="about-button about-button-primary" href="#about-sources">Read the source register <span aria-hidden="true">↓</span></a><a class="about-button about-button-secondary" href="#about-help">Contact and help</a></div>
        </div>
        <aside class="about-status-card" aria-label="PathGuard MVP status"><span class="about-status-icon" aria-hidden="true">✓</span><p class="about-card-kicker">MVP scope</p><h3>Warnings and context</h3><p>Built around two approved external data sources. Historical records are clearly labelled, and stale data is never silently treated as current.</p><span class="about-scope-tag">No synthetic city map</span></aside>
      </section>

      <section class="about-section" aria-labelledby="about-capabilities-heading"><div class="about-section-heading"><div><p class="about-kicker">What PathGuard provides</p><h2 id="about-capabilities-heading">Useful signals without overclaiming</h2></div><p>These capabilities are the revised MVP promise. Shelter matching and accessibility-aware routing remain future interfaces.</p></div><div class="about-capability-grid">
        <article class="about-info-card"><span class="about-card-icon" aria-hidden="true">!</span><h3>Personalised warnings</h3><p>Visual, text, spoken-on-demand and vibration channels can be adapted to a user profile. An alert must remain understandable without relying on colour, sound or vibration alone.</p></article>
        <article class="about-info-card"><span class="about-card-icon" aria-hidden="true">◌</span><h3>Local weather context</h3><p>HKO warnings, station observations, rainfall and historical comparisons show what the source says, when it said it, and whether the record is current.</p></article>
        <article class="about-info-card"><span class="about-card-icon" aria-hidden="true">♡</span><h3>Acknowledgement and support</h3><p>Users can acknowledge an alert or request help. Caregiver escalation follows consent and configured settings; it does not dispatch emergency services.</p></article>
      </div></section>

      <section class="about-trust-callout" aria-labelledby="about-trust-heading"><span class="about-trust-icon" aria-hidden="true">i</span><div><p class="about-kicker">Trust rule</p><h2 id="about-trust-heading">Official instructions always take priority.</h2><p>PathGuard presents source information and app state. It does not issue official warnings, evacuation orders or emergency instructions, and it cannot guarantee a person’s physical safety. Follow HKO and local authority guidance.</p></div></section>

      <section class="about-section" id="about-sources" aria-labelledby="about-sources-heading"><div class="about-section-heading about-section-heading-stack"><div><p class="about-kicker">Traceability</p><h2 id="about-sources-heading">Data-source register</h2></div><p>Only the Marine Department typhoon-shelter dataset and HKO open data are approved external sources in this MVP. App-generated reports are advisory records, not a third source.</p></div><div class="about-table-wrap"><table class="about-table"><caption class="about-visually-hidden">PathGuard approved data sources, freshness and attribution status</caption><thead><tr><th scope="col">Source and publisher</th><th scope="col">Use in PathGuard</th><th scope="col">Freshness</th><th scope="col">Attribution and licence</th></tr></thead><tbody>${renderSourceRows()}</tbody></table></div><div class="about-source-notes"><p><strong>HKO:</strong> ${externalLink('https://www.hko.gov.hk/en/open-data/open-data-info.htm', 'Hong Kong Observatory open data')} is the source for warnings, observations, climate context and historical replay.</p><p><strong>Marine Department:</strong> ${externalLink('https://data.gov.hk/en-data/dataset/hydro-hk-md-typhoon-shelters', 'Typhoon Shelters (CSDI Portal)')} is shown as marine context and must be labelled “Shelter for boats (Marine Department)”.</p><p><strong>Release placeholder:</strong> the plan marks current licence, attribution and rate-limit terms as items to verify against publisher terms before release. This page intentionally does not claim they are confirmed.</p></div></section>

      <section class="about-section about-limits-section" aria-labelledby="about-limits-heading"><div class="about-section-heading about-section-heading-stack"><div><p class="about-kicker">Honest limits</p><h2 id="about-limits-heading">What PathGuard does not yet do</h2></div><p>The approved sources do not support these people-focused capabilities. They are deferred, not quietly simulated.</p></div><div class="about-limits-grid">
        <article class="about-limit-card"><span aria-hidden="true">01</span><div><h3>Human shelters</h3><p>We do not provide locations, capacity, opening status or accessibility features for shelters for people. A Marine Department typhoon shelter is not a human evacuation shelter.</p></div></article>
        <article class="about-limit-card"><span aria-hidden="true">02</span><div><h3>Pedestrian accessibility routing</h3><p>We do not calculate a step-free or profile-aware pedestrian route. There is no approved pedestrian network for stairs, ramps, slope, width, crossings or kerbs.</p></div></article>
        <article class="about-limit-card"><span aria-hidden="true">03</span><div><h3>Lift status</h3><p>We do not know whether a lift or escalator is working, and we do not reroute around one that has failed.</p></div></article>
        <article class="about-limit-card"><span aria-hidden="true">04</span><div><h3>Flood depth or blocked paths</h3><p>Weather indicators and app reports do not provide verified flood depth, road closures or a safe path. Reports are advisory and need review.</p></div></article>
        <article class="about-limit-card"><span aria-hidden="true">05</span><div><h3>Official emergency replacement</h3><p>PathGuard is not an emergency service, official warning channel or evacuation authority. It cannot dispatch responders or guarantee safety.</p></div></article>
      </div></section>

      <section class="about-section about-safety-grid" aria-labelledby="about-safety-heading"><div class="about-safety-card"><p class="about-kicker">Privacy and safety</p><h2 id="about-safety-heading">Use only what is needed, with consent.</h2><ul class="about-check-list"><li><span aria-hidden="true">✓</span><span>Accessibility needs and health-related details are sensitive. Collect only what the selected experience needs, explain why, and provide deletion controls.</span></li><li><span aria-hidden="true">✓</span><span>Location sharing and caregiver links require explicit consent. A caregiver sees only the fields the user permits, and sharing can be paused.</span></li><li><span aria-hidden="true">✓</span><span>Stale or unavailable source data is labelled. PathGuard shows the last good record and does not invent a warning during an outage.</span></li></ul></div><div class="about-safety-card about-safety-card-warning"><p class="about-kicker">Before relying on a status</p><h2>Check the source and age.</h2><p>Weather observations can be provisional. Historical comparisons are not forecasts. Marine shelter geometry is context for boats. In an emergency, follow current official instructions and seek local help through the appropriate emergency channel.</p><span class="about-safety-label">Informational support · not a safety guarantee</span></div></section>

      <section class="about-help-panel" id="about-help" aria-labelledby="about-help-heading"><div><p class="about-kicker">Need help or want to correct something?</p><h2 id="about-help-heading">Tell us what is unclear.</h2><p>For accessibility feedback, a source-attribution correction, or a question about this prototype, contact the PathGuard team. Please do not send sensitive health or location details by email.</p></div><div class="about-help-actions"><a class="about-button about-button-primary" href="mailto:help@pathguard.example">Email PathGuard</a><p><strong>Urgent situation?</strong><br>PathGuard has no emergency dispatch. Contact local emergency services and follow official instructions.</p></div></section>

      <section class="about-glossary" aria-labelledby="about-glossary-heading"><div><p class="about-kicker">Small glossary</p><h2 id="about-glossary-heading">Terms we use</h2></div><dl><div><dt>HKO</dt><dd>Hong Kong Observatory, the approved source for PathGuard weather data.</dd></div><div><dt>Freshness</dt><dd>How recently a source record was updated or successfully received; it is not a forecast.</dd></div><div><dt>Marine typhoon shelter</dt><dd>A sheltered-water location for vessels in this MVP, never a destination for people.</dd></div><div><dt>Advisory report</dt><dd>An app-generated observation that may need review. It does not change an official warning or create a route.</dd></div></dl></section>
    </div>
  `;
}

export { renderAbout };
