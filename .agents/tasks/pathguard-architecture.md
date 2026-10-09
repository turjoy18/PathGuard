# PathGuard MVP implementation architecture and handoff

## Scope locked by the plan

This handoff implements only the binding MVP in section 0.1 of `pathguard-plan.md`. The approved external sources are:

1. Hong Kong Observatory (HKO) open data: documented warning feeds, regional observations, rainfall, station reference data, climate CSVs, and approved tropical-cyclone data after task T-100 confirms each endpoint and licence.
2. Marine Department typhoon-shelter dataset/resource `fab4e8a7-148b-4827-a73d-5e3bc168d7ad` (CSDI dataset `mardep_rcd_1730971403590_9667`), after T-101 confirms its schema, CRS and licence.

A Marine Department typhoon shelter is marine context for boats, never a destination for people. The UI must use the confirmed wording `Shelter for boats (Marine Department)` and must not show capacity, accessibility, evacuation, route, or human-shelter claims for these records. Human evacuation shelters, shelter matching, pedestrian accessibility routing, dynamic rerouting, lift status, synthetic city maps, and flood/road-closure feeds are deferred and must not be represented as available capabilities. User-submitted reports may exist as app-generated advisory records only; they never alter routes or official weather data.

The MVP proves personalised HKO-driven warnings, acknowledgement and caregiver escalation, current weather/climate context, marine map context, and safe degradation when HKO is unavailable. Historical replay is based on stored HKO records. Any demo warning is isolated, labelled, and impossible to deliver to real users.

## Technology stack and system shape

Use a TypeScript React Vite PWA for the user, caregiver, and operator web clients. Use FastAPI with Python and Pydantic for the versioned API and background worker code. Use PostgreSQL with PostGIS for source records, station and marine geometries, events, profiles, delivery state, audit data, and replay metadata. Use Alembic migrations. Use MapLibre GL for the map and a configurable presentation-only basemap; the basemap is not treated as a PathGuard data source and its licensing decision (D-12) must be recorded before release. Use Server-Sent Events (SSE) for one-way live updates, with authenticated polling fallback. Use Web Push/VAPID where supported, with in-app fallback. Use object storage only if optional report photos are enabled.

Keep the application as a modular monorepo rather than separate deployable services. The API process owns synchronous validation and reads; a worker owns scheduled ingestion, climate import, source refresh, retention, event mapping, notification retries, and replay jobs. External connectors are adapters behind `SourceAdapter` interfaces. No LLM is required for MVP safety decisions; if an agent surface is retained, it may explain structured HKO events only and must fail to deterministic templates. Do not add pgRouting or graph tables in MVP migrations.

Suggested layout and ownership boundaries:

```text
apps/web/                 React routes, accessible UI, PWA, map
apps/api/app/api/         FastAPI routers and request/response schemas
apps/api/app/domain/      profile, event, alert, escalation, replay rules
apps/api/app/ingest/      HKO and Marine adapters, parsers, freshness
apps/api/app/db/          SQLAlchemy models, repositories, Alembic migrations
apps/api/app/workers/     schedules, retries, retention, push/email jobs
packages/contracts/       generated/shared API types and problem details
packages/ui/              tokens and accessible shared components
fixtures/hko/             redacted/recorded HKO JSON and CSV samples
fixtures/marine/          recorded Marine API responses and CRS examples
fixtures/replay/          historical HKO replay scenarios only
```

Keep source credentials and notification keys in environment/secrets management; never in fixtures or the repository. Pin dependencies and run secret/dependency scanning in CI.

## Routes and API boundaries

### User and caregiver web routes

- `/` — landing, scope/disclaimer, source credits, and entry points.
- `/start` — guest/session setup with temporary alert preferences; no persistent profile or caregiver linking.
- `/home` — current HKO status, active warning, last update age, nearest relevant HKO observation, and marine-layer status.
- `/alerts/:alertId` — warning detail, source link, original text, plain-language variant, `Read aloud`, acknowledge, and `I need help`.
- `/map` — HKO station observations, HKO cyclone tracks when approved, app-generated advisory reports if enabled, and Marine Department boat-shelter context. A list view must replace map-only access for assistive technology.
- `/history` — alert and acknowledgement history; source age and simulation labels are retained.
- `/profile` — accessibility-relevant alert preferences, language, text size, consent, and deletion. Do not imply routing or shelter matching fields are active.
- `/caregivers` — verified caregiver links, field-level sharing permissions, pause sharing, escalation order, and test notification.
- `/replay` — only for an authenticated operator/demo session, never a public real-user route; persistent `SIMULATION` banner.
- `/about` and `/accessibility` — source attribution, data limitations, privacy, official-warning disclaimer, and deferred-capability statement.

Do not create `/shelters`, `/route`, `/navigate`, `/reroute`, human shelter detail pages, or UI copy describing a nearest reachable shelter. Marine features belong only to `/map` and must be non-actionable.

### Operator/API routes

Expose JSON under `/api/v1`, with a common problem response `{type, code, message, field_errors, request_id}` and cursor pagination where lists can grow.

- `GET /healthz`, `GET /readyz` — process/readiness checks; no private data.
- `GET /api/v1/weather/status` — current warnings, observations, source timestamps, age, and freshness state.
- `GET /api/v1/weather/stations/nearest?lat&lng` — nearest approved HKO station, with bounded WGS84 coordinates.
- `GET /api/v1/climate/context?station_code&date&metric` — percentile/context from imported historical HKO data, explicitly labelled historical and not a forecast.
- `GET /api/v1/marine/typhoon-shelters?bbox` — Marine records and source version; response includes `boat_context: true`.
- `GET /api/v1/events/active` — HKO-derived internal events only; original source text and source link remain available.
- `GET /api/v1/me/alerts`, `POST /api/v1/alerts/{id}/acknowledge`, `GET /api/v1/me/stream` — alert history, acknowledgement, and SSE updates.
- `POST /api/v1/me/help` — records a help request and starts configured caregiver/operator escalation; it does not dispatch emergency services.
- `GET/PUT /api/v1/me/profile`, `POST /api/v1/me/consents`, `DELETE /api/v1/me` — profile, consent, and deletion.
- `POST/PATCH /api/v1/me/caregivers` — invite, verify, permission, pause, and escalation settings.
- `GET /api/v1/ops/ingestion`, `POST /api/v1/ops/replay`, `POST /api/v1/ops/replay/{id}/stop`, `GET /api/v1/ops/escalations` — operator-only source health, isolated replay, and escalation queue.
- `GET /api/v1/about/sources` — source register, attribution, licence text, last successful import, and data age.

All lat/lng inputs are required when used, numeric WGS84 values with latitude `[-90,90]`, longitude `[-180,180]`; reject NaN, infinities, oversized bbox/radius, and coordinates outside the configured Hong Kong bounds. Station codes, metric names, language, cursor, IDs, and replay IDs are allow-listed. Text fields have explicit maximum lengths and are encoded on output. Every state-changing POST requires an idempotency key and authorization; duplicate keys return the original result.

## Data model and ingestion

Create only these MVP tables from the plan: `ingestion_runs`, `hko_warning_snapshots`, `hko_stations`, `hko_regional_observations`, `hko_climate_daily`, `tc_track_points`, `marine_typhoon_shelters`, `emergency_events`, plus the minimum product tables for users/profiles/consents/devices, alerts/deliveries/acknowledgements, caregiver links/escalations, audit records, and isolated replay runs. Use UUIDs except stable HKO station codes. Use PostGIS geometry SRID 4326 after validating and transforming the Marine source CRS. Add GIST indexes to station, cyclone, and marine geometries; descending station/observation indexes; unique `(data_type, content_hash)` for warning snapshots and source-version uniqueness for marine imports.

Every adapter writes an `ingestion_runs` record before work and completes it with status, HTTP status, record count, source version, timestamps, and a sanitised error. Parsing is schema-validated before a transaction promotes records. Raw HKO warning JSON is retained in `hko_warning_snapshots`; raw untrusted text is never interpreted as instructions. Source content hashes make retries idempotent. A timeout, DNS/TLS failure, non-2xx response, malformed JSON/CSV, unsupported CRS, or missing required field marks the run failed and leaves the last good records unchanged. Retry transient network/5xx failures with bounded exponential backoff; do not retry deterministic schema/licence failures without operator action. Log connector failure at warning/error with request ID and source, but never log credentials or profile data.

The HKO worker polls only data types confirmed by T-100 and at a documented interval within HKO limits. It preserves original warning text, maps each supported warning to a versioned internal event `{type, severity, title, instruction, onset, expiry, source, source_ref}`, and emits an alert only on a new/changed active event. Unknown warning types are stored and surfaced as `unmapped`, not silently classified. If HKO is unreachable, screens show the last successful values with `OUTDATED` and age; no new warning or escalation is invented. Marine imports refresh only on source-version/content change and record source version; importer errors preserve the prior layer. Climate CSV import validates station, dates, metric, units, and numeric ranges, deduplicates by primary key, and computes percentile context from stored history with `historical, not a forecast` text.

## Core components and integration points

- **Source adapters:** `HkoWarningAdapter`, `HkoObservationAdapter`, `HkoClimateCsvAdapter`, `HkoStationAdapter`, `HkoCycloneAdapter`, and `MarineTyphoonShelterAdapter`; all return typed normalized records plus provenance.
- **Freshness/cache service:** serves last-good source data and age, with per-source freshness policy. It owns the outage state; UI never infers freshness from a missing field.
- **Warning mapper:** deterministic, versioned mapping from HKO type to internal event. It owns severity/event identity and retains the source payload.
- **Alert service:** selects users by saved consent/location policy, creates profile-specific visual/text/speech/haptic variants, records delivery attempts, and starts acknowledgement timers. It cannot publish official events itself.
- **Escalation worker:** retries notification channels, re-alerts after the configured delay, then notifies verified caregivers and queues operators. Acknowledgement cancels pending escalation idempotently. Help requests are immediately queued; no emergency dispatch integration exists.
- **Marine layer service:** returns only boat-context features and provenance. It must reject any request to turn a marine feature into a destination.
- **Climate/station service:** chooses the nearest approved HKO station, reports station identity and distance, and computes historical percentile context.
- **Replay service:** copies selected recorded HKO fixtures/history into a namespace/run ID, advances a deterministic clock, and routes all replay events through the same mapper/UI. A replay event has `simulation_run_id`; production audience selection excludes that field. Demo warning creation is disabled by default and, if enabled, can target only the replay namespace.
- **Attribution service/component:** renders publisher, dataset/resource, licence, source link, fetched time, source version, and age on every weather-driven screen and the About page.

Failure behavior is explicit: unavailable notification delivery is retryable and falls back to SSE/polling/in-app state; exhausted retries become a visible failed delivery and operator metric. SSE disconnects reconnect with backoff and then poll. Database transaction/constraint failures roll back and return a request ID to the caller; callers may retry idempotent operations. Unauthorized or cross-user access is fatal to that request and returns `403`/`404` without entity disclosure, with a security audit entry. Invalid input returns `400` with field errors and no state change. Account deletion is asynchronous but immediately confirms receipt; deletion worker retries and audits completion/failure without exposing sensitive fields.

## Shared UI components and states

Build in `packages/ui` with semantic HTML and design tokens: `StatusBanner`, `AlertCard`, `AlertActionBar`, `FreshnessBadge`, `SourceAttribution`, `SimulationBanner`, `LargeActionButton`, `ConsentControl`, `CaregiverCard`, `EscalationStatus`, `WeatherMetricCard`, `StationCard`, `ClimateContextCard`, `MarineLayerLegend`, `AccessibleMapList`, `OfflineBanner`, `InlineError`, `LoadingSkeleton`, and `EmptyState`. `MarineLayerLegend` and every feature card must say boats, not people. Do not create shelter recommendation, route step, reroute, capacity, lift, or accessibility-facility components for this MVP.

Required states include loading, no location permission, no current warning, active warning, outdated data, source unavailable, offline cached data, unmapped warning, replay, empty caregiver list, pending/failed delivery, acknowledgement success, and deletion pending. State changes must be announced through a polite/assertive live region appropriate to severity, with text alternatives for all visual, audio, and vibration signals.

## Fixtures and deterministic test data

Commit only provider-approved, minimal recorded fixtures with provenance and capture date:

- `fixtures/hko/warnings/*.json`: one fixture per documented warning type, an update, expiry, unknown type, malformed response, and empty response.
- `fixtures/hko/observations/*.json`: nearest-station, tied-distance, missing metric, stale reading, and regional observation samples.
- `fixtures/hko/climate/*.csv`: small samples with valid rows, duplicate rows, invalid dates/units, quality flags, and known percentile results.
- `fixtures/hko/cyclones/*.json`: approved current/best-track geometry and no-track/invalid-point cases.
- `fixtures/marine/typhoon-shelters/*`: confirmed API payloads in source CRS, transformed geometry, missing optional fields, duplicate IDs, changed source version, and malformed CRS cases.
- `fixtures/replay/typhoon-history.json`: historical HKO-only warning/track/climate sequence with a deterministic clock and no live audience.
- `fixtures/profiles/`: deaf, hard-of-hearing, blind, low-vision, older/simplified-mode, and default profiles using synthetic identities only.

Fixture assertions must cover source provenance, original text preservation, content-hash idempotency, polling freshness, outage behavior, nearest-station selection, percentile calculation, marine boat-only labeling, alert adaptation, acknowledgement/escalation timing, replay isolation, and no human-shelter/routing API surface.

## Accessibility and safety requirements

Meet WCAG 2.2 AA on all pages, with critical emergency text targeting 7:1 contrast where practical. Test keyboard, switch/voice control, NVDA, VoiceOver, TalkBack, 200% text scaling, high contrast, dark mode, reduced motion, and mobile widths. Use semantic landmarks, ordered headings, visible focus, skip links, 48px minimum touch targets (56px primary emergency actions), logical focus management, and no gesture-only or colour-only meaning. The map always has a keyboard/screen-reader list alternative and equivalent source/time text.

Alert UI uses an icon, severity word, high-contrast text, and optional slow visual pulse; no strobe and no more than three flashes per second. Reduced-motion mode is static. Audio and vibration are optional enhancements, never the only signal. `Read aloud` is user-invoked. The screen must state that HKO/official information remains authoritative and PathGuard does not issue emergency orders. Outdated data must be visually and textually explicit. SIMULATION is persistent and announced in every replay view.

## Work ownership for 12 build agents

Agents must stay inside their assigned paths and expose changes through `packages/contracts`; shared migrations and route names require the foundation owner’s review. No agent may add deferred shelter/routing tables or claim a third official data source.

1. **Foundation/CI:** repository setup, Docker, environment templates, CI, Alembic baseline, lint/type/test configuration; owns root configs and `apps/api/alembic/`.
2. **API contracts:** Pydantic schemas, problem-details errors, OpenAPI generation, shared TypeScript contracts; owns `packages/contracts/` and API schema modules.
3. **Web shell/design system:** Vite/React routing shell, tokens, layouts, navigation, `packages/ui/`; no domain data logic.
4. **Accessibility QA:** axe/Playwright accessibility harness, screen-reader/manual test scripts, reduced-motion/high-contrast verification; owns `tests/accessibility/` and docs test matrix.
5. **HKO warning ingestion:** warning adapters, snapshots, freshness, hashing, `apps/api/app/ingest/hko_warnings.py`, warning fixtures.
6. **HKO observation/climate:** station import, observations, CSV importer, nearest station, percentile context, related fixtures.
7. **Marine data/map:** Marine adapter, CRS validation, versioned layer endpoint, MapLibre layer and boat-only legend; owns marine fixtures and map integration.
8. **Event/alert domain:** warning-to-event mapping, alert variants, source links, acknowledgement, delivery records, and HKO-driven home/alert screens.
9. **Notifications/escalation:** Web Push capability registration, SSE/poll fallback, retries, caregiver escalation, help queue, and caregiver UI.
10. **Profile/privacy:** guest/session profile, consent, alert preferences, deletion, retention jobs, and profile UI; owns sensitive access tests.
11. **Replay/operator:** isolated replay engine, operator ingestion/replay/escalation views, simulation banner, reset and audience-isolation tests.
12. **Integration/validation:** end-to-end fixtures and demo flow, fault injection, load checks for ingestion/delivery, attribution/licence verification, and final deferred-capability audit.

Integration order is foundation/contracts, ingestion schemas, HKO connectors, profile/alert domain, web shell, marine map, notifications/escalation, replay, then cross-cutting accessibility and validation. Agents should use fixture-backed APIs until their dependencies land.

## Acceptance gates for this handoff

1. A fresh database creates only MVP tables and indexes; no network graph, human shelter, route, lift, or deferred table exists.
2. Every weather-driven view visibly and programmatically exposes publisher/source, source link where required, last update, age, and outdated state.
3. A changed supported HKO warning creates one versioned event with original text; repeated identical payloads are idempotent.
4. HKO outage preserves last-good data, marks it outdated, and creates no new alert.
5. A profile receives an alert in visual/text form without relying on audio; acknowledgement cancels escalation, while timeout reaches verified caregivers according to consent.
6. Climate context identifies the station and says historical, not a forecast; nearest-station edge cases are deterministic.
7. Marine features render only on the map/list context, are labelled for boats, preserve source version, and cannot be selected as a human destination.
8. Replay shows `SIMULATION`, cannot select live users or send production notifications, and reproduces the fixture sequence deterministically.
9. All user-facing pages pass automated accessibility checks and the defined keyboard/screen-reader/reduced-motion/text-scaling checks.
10. Public copy, route names, API schemas, fixtures, and demo script contain no claim of human shelter matching, accessible routing, dynamic rerouting, or a synthetic city map.

## Deferred items and open decisions

Resolve T-100 (HKO data types, polling limits, terms/licence, climate schema) and T-101 (Marine schema, CRS, licence, and boat-purpose wording) before production-like ingestion. Record D-12 for the presentation basemap and D-13 for whether a labelled demo warning is permitted. Confirm D-11 whether all HKO categories are approved; until confirmed, adapters may be implemented behind feature flags but only confirmed categories may run. Confirm jurisdiction, languages, supported devices, retention, and caregiver channels before real users. These decisions do not permit adding human shelter or route data to the MVP.
