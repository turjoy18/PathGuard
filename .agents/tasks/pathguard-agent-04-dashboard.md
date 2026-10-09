# PathGuard agent 04 — primary dashboard

## Scope
Implemented the primary dashboard/home experience described by the revised MVP in `pathguard-plan.md`. The workspace did not contain an existing app shell, package manifest, source tree, or Git repository; only the planning document was present. A small dependency-free browser shell was therefore added rather than replacing unrelated work.

## Changed files
- `index.html` — accessible PathGuard shell with desktop sidebar, mobile navigation, workspace links, skip link, and dashboard mount point.
- `src/app.js` — hash-based shell navigation, dashboard integration, placeholder view states for Replay, Live map, Alerts, Operator, Caregiver, and Settings, plus accessible action announcements.
- `src/dashboard.js` — dedicated dashboard module with clearly labelled fixture data for current weather status, source/freshness, explicit HKO outage/stale state, active alerts, quick actions, marine typhoon shelter context for boats only, historical climate risk, profile readiness, and caregiver status.
- `styles.css` — responsive visual system, accessible focus states, reduced-motion handling, mobile layout, alert/status cards, source/freshness treatments, and responsive reflow.

## Fixture/data notes
- All visible operational values are marked `Fixture data · not live`.
- Weather cards identify Hong Kong Observatory as the source and expose the update time and age.
- The outage state explicitly says the last known snapshot is shown and no new alert is invented while HKO is unreachable.
- The Marine Department typhoon-shelter layer is labelled `For boats only` and is never presented as a destination for people.
- Climate values are labelled historical and not a forecast.

## Validation
- `node --check src/app.js` passed.
- `node --check src/dashboard.js` passed.
- A one-shot local Python HTTP server smoke test returned HTTP 200 for `/` and verified the expected PathGuard shell and module entrypoint.
- No project build/typecheck/test command was available because the workspace had no package manifest or existing application tooling.
- No Git commit was made, as requested.
