import './about.css'
import { aboutSourceLinks, sourceRegister } from './about-data'

function ExternalLink({ href, children }: { href: string; children: string }) {
  return <a href={href} target="_blank" rel="noreferrer">{children} <span aria-hidden="true">↗</span></a>
}

function AboutPage() {
  return (
    <div className="about-page">
      <section className="about-hero" aria-labelledby="about-intro-heading">
        <div className="about-hero-copy">
          <p className="about-kicker">About PathGuard · revised MVP</p>
          <h2 id="about-intro-heading">Clear warning context, with honest boundaries.</h2>
          <p className="about-lede">PathGuard helps people perceive, understand and acknowledge typhoon and rainstorm warnings from the Hong Kong Observatory. It adds local weather context, consent-based support, and a traceable view of the data behind each status.</p>
          <p className="about-promise"><strong>Our promise:</strong> make the next information step clearer without pretending that a weather feed is a safe route or a human shelter.</p>
          <div className="about-hero-actions">
            <a className="about-button about-button-primary" href="#about-sources">Read the source register <span aria-hidden="true">↓</span></a>
            <a className="about-button about-button-secondary" href="#about-help">Contact and help</a>
          </div>
        </div>
        <aside className="about-status-card" aria-label="PathGuard MVP status">
          <span className="about-status-icon" aria-hidden="true">✓</span>
          <p className="about-card-kicker">MVP scope</p>
          <h3>Warnings and context</h3>
          <p>Built around two approved external data sources. Historical records are clearly labelled, and stale data is never silently treated as current.</p>
          <span className="about-scope-tag">No synthetic city map</span>
        </aside>
      </section>

      <section className="about-section" aria-labelledby="about-capabilities-heading">
        <div className="about-section-heading">
          <div><p className="about-kicker">What PathGuard provides</p><h2 id="about-capabilities-heading">Useful signals without overclaiming</h2></div>
          <p>These capabilities are the revised MVP promise. Shelter matching and accessibility-aware routing remain future interfaces.</p>
        </div>
        <div className="about-capability-grid">
          <article className="about-info-card"><span className="about-card-icon" aria-hidden="true">!</span><h3>Personalised warnings</h3><p>Visual, text, spoken-on-demand and vibration channels can be adapted to a user profile. An alert must remain understandable without relying on colour, sound or vibration alone.</p></article>
          <article className="about-info-card"><span className="about-card-icon" aria-hidden="true">◌</span><h3>Local weather context</h3><p>HKO warnings, station observations, rainfall and historical comparisons show what the source says, when it said it, and whether the record is current.</p></article>
          <article className="about-info-card"><span className="about-card-icon" aria-hidden="true">♡</span><h3>Acknowledgement and support</h3><p>Users can acknowledge an alert or request help. Caregiver escalation follows consent and configured settings; it does not dispatch emergency services.</p></article>
        </div>
      </section>

      <section className="about-trust-callout" aria-labelledby="about-trust-heading">
        <span className="about-trust-icon" aria-hidden="true">i</span>
        <div><p className="about-kicker">Trust rule</p><h2 id="about-trust-heading">Official instructions always take priority.</h2><p>PathGuard presents source information and app state. It does not issue official warnings, evacuation orders or emergency instructions, and it cannot guarantee a person’s physical safety. Follow HKO and local authority guidance.</p></div>
      </section>

      <section className="about-section" id="about-sources" aria-labelledby="about-sources-heading">
        <div className="about-section-heading about-section-heading-stack"><div><p className="about-kicker">Traceability</p><h2 id="about-sources-heading">Data-source register</h2></div><p>Only the Marine Department typhoon-shelter dataset and HKO open data are approved external sources in this MVP. App-generated reports are advisory records, not a third source.</p></div>
        <div className="about-table-wrap"><table className="about-table"><caption className="about-visually-hidden">PathGuard approved data sources, freshness and attribution status</caption><thead><tr><th scope="col">Source and publisher</th><th scope="col">Use in PathGuard</th><th scope="col">Freshness</th><th scope="col">Attribution and licence</th></tr></thead><tbody>{sourceRegister.map((entry) => <tr key={entry.name}><th scope="row"><strong>{entry.name}</strong><span>{entry.publisher}</span><ExternalLink href={entry.href}>{entry.linkLabel}</ExternalLink></th><td>{entry.use}</td><td>{entry.freshness}</td><td>{entry.attribution}</td></tr>)}</tbody></table></div>
        <div className="about-source-notes"><p><strong>HKO:</strong> <ExternalLink href={aboutSourceLinks.hkoOpenData}>Hong Kong Observatory open data</ExternalLink> is the source for warnings, observations, climate context and historical replay.</p><p><strong>Marine Department:</strong> <ExternalLink href={aboutSourceLinks.marineDataset}>Typhoon Shelters (CSDI Portal)</ExternalLink> is shown as marine context and must be labelled “Shelter for boats (Marine Department)”.</p><p><strong>Release placeholder:</strong> the plan marks current licence, attribution and rate-limit terms as items to verify against publisher terms before release. This page intentionally does not claim they are confirmed.</p></div>
      </section>

      <section className="about-section about-limits-section" aria-labelledby="about-limits-heading">
        <div className="about-section-heading about-section-heading-stack"><div><p className="about-kicker">Honest limits</p><h2 id="about-limits-heading">What PathGuard does not yet do</h2></div><p>The approved sources do not support these people-focused capabilities. They are deferred, not quietly simulated.</p></div>
        <div className="about-limits-grid">
          <article className="about-limit-card"><span aria-hidden="true">01</span><div><h3>Human shelters</h3><p>We do not provide locations, capacity, opening status or accessibility features for shelters for people. A Marine Department typhoon shelter is not a human evacuation shelter.</p></div></article>
          <article className="about-limit-card"><span aria-hidden="true">02</span><div><h3>Pedestrian accessibility routing</h3><p>We do not calculate a step-free or profile-aware pedestrian route. There is no approved pedestrian network for stairs, ramps, slope, width, crossings or kerbs.</p></div></article>
          <article className="about-limit-card"><span aria-hidden="true">03</span><div><h3>Lift status</h3><p>We do not know whether a lift or escalator is working, and we do not reroute around one that has failed.</p></div></article>
          <article className="about-limit-card"><span aria-hidden="true">04</span><div><h3>Flood depth or blocked paths</h3><p>Weather indicators and app reports do not provide verified flood depth, road closures or a safe path. Reports are advisory and need review.</p></div></article>
          <article className="about-limit-card"><span aria-hidden="true">05</span><div><h3>Official emergency replacement</h3><p>PathGuard is not an emergency service, official warning channel or evacuation authority. It cannot dispatch responders or guarantee safety.</p></div></article>
        </div>
      </section>

      <section className="about-section about-safety-grid" aria-labelledby="about-safety-heading">
        <div className="about-safety-card"><p className="about-kicker">Privacy and safety</p><h2 id="about-safety-heading">Use only what is needed, with consent.</h2><ul className="about-check-list"><li><span aria-hidden="true">✓</span><span>Accessibility needs and health-related details are sensitive. Collect only what the selected experience needs, explain why, and provide deletion controls.</span></li><li><span aria-hidden="true">✓</span><span>Location sharing and caregiver links require explicit consent. A caregiver sees only the fields the user permits, and sharing can be paused.</span></li><li><span aria-hidden="true">✓</span><span>Stale or unavailable source data is labelled. PathGuard shows the last good record and does not invent a warning during an outage.</span></li></ul></div>
        <div className="about-safety-card about-safety-card-warning"><p className="about-kicker">Before relying on a status</p><h2>Check the source and age.</h2><p>Weather observations can be provisional. Historical comparisons are not forecasts. Marine shelter geometry is context for boats. In an emergency, follow current official instructions and seek local help through the appropriate emergency channel.</p><span className="about-safety-label">Informational support · not a safety guarantee</span></div>
      </section>

      <section className="about-help-panel" id="about-help" aria-labelledby="about-help-heading">
        <div><p className="about-kicker">Need help or want to correct something?</p><h2 id="about-help-heading">Tell us what is unclear.</h2><p>For accessibility feedback, a source-attribution correction, or a question about this prototype, contact the PathGuard team. Please do not send sensitive health or location details by email.</p></div>
        <div className="about-help-actions"><a className="about-button about-button-primary" href="mailto:help@pathguard.example">Email PathGuard</a><p><strong>Urgent situation?</strong><br />PathGuard has no emergency dispatch. Contact local emergency services and follow official instructions.</p></div>
      </section>

      <section className="about-glossary" aria-labelledby="about-glossary-heading">
        <div><p className="about-kicker">Small glossary</p><h2 id="about-glossary-heading">Terms we use</h2></div>
        <dl><div><dt>HKO</dt><dd>Hong Kong Observatory, the approved source for PathGuard weather data.</dd></div><div><dt>Freshness</dt><dd>How recently a source record was updated or successfully received; it is not a forecast.</dd></div><div><dt>Marine typhoon shelter</dt><dd>A sheltered-water location for vessels in this MVP, never a destination for people.</dd></div><div><dt>Advisory report</dt><dd>An app-generated observation that may need review. It does not change an official warning or create a route.</dd></div></dl>
      </section>
    </div>
  )
}

export default AboutPage
