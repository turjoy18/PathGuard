# PathGuard agent 06 — HKO weather/data experience

## Scope
Implemented isolated, dependency-free weather modules for the revised MVP. The modules use Hong Kong Observatory (HKO) as the only weather source, preserve HKO raw-source links, and keep fixture data visibly separate from live data.

## Changed files
- `src/weather/weather-data.js` — HKO source constants, endpoint builder, age/freshness helpers, warning normalization, live JSON fetch adapter, explicit demo fixture, and stale/outage snapshot behavior.
- `src/weather/weather-experience.js` — accessible renderer for warning summary, current conditions, regional station observations, rainfall, climate percentile/trend context, source/age labels, attribution, and safe stale/outage states.
- `src/weather/weather.css` — responsive cards and status presentation, mobile reflow, reduced-motion and forced-colors support.
- `src/weather/index.js` — public module exports for mounting/integration into the app shell.
- `src/app.js` — mounts the weather experience on the existing `#weather` hash route and imports the weather stylesheet.
- `index.html` — adds Weather to the existing desktop and mobile navigation.

## Safety and data decisions
- A failed HKO request never falls back silently to fixture data. Callers can explicitly select `DEMO_WEATHER_FIXTURE` for demos.
- A stale last-good snapshot is marked `stale` and shown with an outdated message; no warning is inferred during outage.
- An unavailable warning feed states that HKO warning status is unavailable and explicitly says PathGuard is not inferring an alert.
- An empty warning list is presented as data returned by HKO, not as a PathGuard all-clear notice.
- Climate context is labelled “Historical context, not a forecast.”
- Every weather-driven section includes HKO and its update time/age; the footer preserves the raw HKO open-data link.
- Fixture content is labelled “Demo / fixture data — this display is not live HKO status.”

## Integration
Import `src/weather/index.js`, import `src/weather/weather.css`, and mount with:

```js
import { DEMO_WEATHER_FIXTURE, mountWeatherExperience } from './weather/index.js';
import './weather/weather.css';

mountWeatherExperience('#weather', DEMO_WEATHER_FIXTURE);
```

For live data, call `fetchHkoJson(dataType, language)`, normalize the response with `normalizeSnapshot`, and retain the last successful snapshot for `staleSnapshot(lastGoodSnapshot)` on failure. Do not use the fixture as an implicit live fallback.

## Validation
- `node --check src/app.js` — passed.
- `node --check src/weather/weather-data.js` — passed.
- `node --check src/weather/weather-experience.js` — passed.
- `node --check src/weather/index.js` — passed.
- Fixture/stale/outage/HKO URL smoke checks — passed.
- `npm run build` — passed; TypeScript and Vite production build completed, including `dist/index.html` and the bundled weather route.
- No commit was made, per instruction. The workspace is not a Git repository.
