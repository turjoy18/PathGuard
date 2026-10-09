# Official source contracts

Shared backend boundary for CSDI, Hong Kong Observatory, and Marine Department records. Server-side adapters call `SourceContractService.submit`. Browser clients call PathGuard only.

Contract version: `official-source-contracts.v1`. It is independent of any provider or source version.

## Modes and freshness

Each publication has one mode: `live`, `snapshot`, `replay`, or `offline`. Offline records carry a cached age and a non-live limitation. Freshness is `fresh`, `stale`, `expired`, `unavailable`, or `unknown`. Missing policy timing stays `unknown`. A source-provided freshness value is used only when that source's refresh policy allows it. Read-time source health is recalculated for the health view and does not rewrite stored provenance.

## Safe failures

Timeouts, rate limits, transport errors, malformed responses, invalid geometry, no-route results, unknown route status, and storage outages are typed `SafeFailure` values with `success: false`. They do not invent geometry, distance, duration, steps, warning text, timestamps, or freshness. A CSDI pedestrian route is never an accessibility approval. Missing accessibility and safety facts stay `unknown` or `unavailable`.

## Sources

The registry has three entries: `csdi`, `hko`, and `marine_department`. Marine Department records use `typhoon_shelter_reference` and are excluded from human-shelter candidates. Registry URLs and attribution are metadata, not provider clients. Credentials are not stored.

## API

Register the router with an explicit prefix. The registry does not add `/api/v1` by itself.

- `GET /api/v1/source-contracts/sources`
- `GET /api/v1/source-contracts/sources/{source_key}/health`
- `GET /api/v1/source-contracts/publications/{publication_id}`
- `GET /api/v1/source-contracts/routes/csdi/{publication_id}`

There is no public ingestion route. Unknown identities return 404. Database storage failures return 503. Domain non-success results return 200 and must be read from `outcome_code` or `contract_status`. `/api/v1/health` remains database readiness only.

## Persistence

Alembic revision `0002_official_source_contracts` adds `source_registry`, `source_health`, `source_publications`, and `publication_receipts`. Seed inserts the three sources with `ON CONFLICT DO NOTHING`, so later operator changes to enabled state or refresh policy are kept. Publication identity is source, record identity, version identity, and publication key. The same payload replays; a different payload conflicts and does not change the stored row.

## Adapter follow-up

CSDI, HKO, and Marine Department HTTP clients, authentication, endpoint selection, retries, and rate limits stay in later adapter tasks. Those adapters should submit `AdapterSubmission` to `SourceContractService.submit`.

Fixture payloads live in `fixtures/`.
