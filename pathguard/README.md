# PathGuard (demo build)

Accessible emergency navigation for Hong Kong. Zero-dependency Node 20+ backend and a vanilla-JS PWA frontend.

```
npm start        # http://localhost:3000
npm test         # 16 API/engine tests
```

Demo logins (password `demo`): `alex` (wheelchair user, saved profile), `grace` (caregiver for Alex), `kai` (shelter staff), `ops` (operator), `mei` (new user). Or use "Continue as guest".

## Real vs simulated
| Layer | Status |
|---|---|
| HKO warnings, rainfall, temperature (`warnsum`, `rhrread`) | **Live** when reachable; never invented when not |
| Pedestrian network, flood blackspots, shelters | **Synthetic** (not the Lands Dept / DSD / HAD datasets); `server/lib/demo-data.js` |
| Lift status, shelter capacity/features, hazards | **Simulated**, marked SIMULATION in the UI |
| Climate percentiles, cyclone track, replay timeline | **Demo values** (replace with HKO CSVs / history) [U] |
| Marine Dept typhoon shelters | Deliberately not used (vessels, not people) |

## Layout
- `server/lib/routing.js` hard blocks (stairs, width, slope, kerb, lift down/unknown, flood, verified hazards, unknown data) + Dijkstra, explanations, no-route/refuge.
- `server/lib/planner.js` shelter hard filters + weighted score, "why this one", rejected nearer shelters, reroute with stability rule.
- `server/lib/agent.js` tool registry tagged autonomous / confirm-first / forbidden, traces, injection guard; optional wording via `ANTHROPIC_API_KEY` (never changes decisions).
- `server/lib/escalation.js` help ladder, check-ins, per-field caregiver consent. `hazards.js` trust, corroboration, moderation, rate limits.
- `server/lib/world.js` simulation (lift/flood/shelter-full/warning/replay) pushed to clients over SSE; clients replan automatically.
- Profiles are AES-256-GCM encrypted at rest (set `PG_DATA_KEY`, `PG_SECRET` in real use). Data persists to `data/db.json` (swap for Postgres with RLS).

## Known gaps
No real data importers yet, no push notifications/SMS (in-app + SSE only), partial Traditional Chinese, only a manual position (no GPS), JSON-file store, in-process rate limiting. Not a replacement for official emergency services.
