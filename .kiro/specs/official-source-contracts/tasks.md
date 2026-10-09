# Implementation Tasks: Official Source Contracts

**Feature:** `official-source-contracts`  
**GitHub issue:** #10  
**Delivery shape:** one feature branch / one PR  
**Source of truth:** `requirements.md` and `design.md` in this directory  
**Implementation:** `backend/app/source_contracts/`

## Scope guardrails

This plan implements the shared backend contract boundary only. It includes typed contracts, validation, freshness, source registry and health, safe failures, publication identity, repository/persistence boundaries, CSDI route-result normalization, consumer endpoints, migration/seeding, tests, and documentation.

It does **not** implement CSDI, HKO, or Marine Department HTTP clients; provider authentication, endpoint selection, retries, or rate limits; provider-specific normalization rules; human-shelter catalogue creation; route ranking; hazard policy; frontend/browser provider calls; operator authorization; or changes to the existing database-health endpoint and baseline migration.

## Dependency map

- `1` is the foundation for all contract modules.
- `2` and `3` depend on `1`; `4` depends on `2`; `5` depends on `1` and `2`.
- `6` depends on `1`, `2`, and `3`; `7` depends on `2`, `4`, and `6`.
- `8` depends on `1`, `2`, `3`, `5`, and `6`; `9` depends on `1` and `8`.
- `10` depends on `1`, `8`, and `9`; `11` depends on `1`, `2`, `3`, `8`, and `10`.
- `12` depends on `1`, `8`, `9`, and `10`; `13` depends on `7`, `8`, `10`, and `12`.
- `14` depends on `11`, `12`, and `13`; `15` depends on `7`, `8`, `10`, `11`, `12`, and `13`.
- `16` depends on the completed implementation and test tasks.

Tasks are intentionally small enough to verify independently. A task may be implemented in the same PR as its dependency, but its tests and definition of done must be complete before the dependent task is considered complete.

## Tasks

### 1. Establish the source-contract package and shared version/enums

- **Dependencies:** none
- **Affected files/modules:**
  - `backend/app/source_contracts/__init__.py`
  - `backend/app/source_contracts/version.py`
  - `backend/app/source_contracts/enums.py`
  - `backend/app/source_contracts/values.py`
- **Implementation notes:**
  - Add the `official-source-contracts.v1` constant.
  - Define the controlled enums from the design: operating mode, freshness state, route contract status, validation classification, source key, record type, failure category, accessibility state, and publication status.
  - Implement the explicit `ValueState[T]` known/unknown/unavailable wrapper; forbid a known state without a value and prevent unknown/unavailable states from being serialized as fabricated false/zero values.
  - Use Pydantic v2, `ConfigDict(extra="forbid")`, and stable string values. Keep `human_shelter` distinct even though its catalogue is out of scope.
- **Tests:**
  - Verify every required enum value and serialized string.
  - Verify `ValueState` invariants and JSON serialization for known, unknown, and unavailable values.
  - Verify the shared contract version is independent of provider/source version fields.
- **Definition of done:**
  - Package imports expose the version and shared enums without importing persistence or provider clients.
  - Invalid enum values and invalid `ValueState` combinations fail deterministically.
  - Unit tests pass.

### 2. Implement provenance envelopes and mode-specific metadata

- **Dependencies:** 1
- **Affected files/modules:**
  - `backend/app/source_contracts/provenance.py`
  - `backend/app/source_contracts/version.py` (only if model serialization wiring is needed)
  - `backend/tests/test_source_contract_models.py`
- **Implementation notes:**
  - Add `ProvenanceEnvelope` with mode, source name, source record ID, fetched/issued/valid-until times, source version, freshness state, contract version, and discriminated mode metadata.
  - Add live, snapshot, replay, and offline metadata models with their required fields.
  - Require timezone-aware UTC boundary values; preserve provider-supplied names, IDs, versions, and timestamps exactly.
  - Do not derive `issued_at` or `valid_until` from `fetched_at`; preserve missing provider record IDs as absent/unknown.
  - Enforce live fetched time, snapshot version/time, replay fixture/event identifier, and offline cached age/non-live limitation requirements.
- **Tests:**
  - Cover all four modes and invalid/missing mode metadata.
  - Verify missing issued/valid-until/record-ID fields remain absent.
  - Verify provider values are not replaced by generated values.
  - Verify invalid timezones and invalid time ordering produce contract findings or model errors as specified.
- **Definition of done:**
  - Every provenance model serializes the shared contract version and mode metadata without leaking provider payloads.
  - A missing or unsupported mode cannot produce a publishable provenance envelope.
  - Tests cover requirements 1 and 2.1–2.5 at the model boundary.

### 3. Add deterministic validation metadata and validator interfaces

- **Dependencies:** 1
- **Affected files/modules:**
  - `backend/app/source_contracts/validation.py`
  - `backend/tests/test_source_contract_models.py`
- **Implementation notes:**
  - Implement `ValidationFinding`, `ValidationMetadata`, and the `ContractValidator` protocol.
  - Include stable code, field path, classification, safe detail, provider request/response IDs, and correlation ID.
  - Support exactly `error`, `warning`, `unknown_value`, and `unavailable_result` classifications.
  - Define deterministic finding ordering by path and code; do not include raw provider responses, credentials, or unsafe exception text.
  - Provide reusable checks for required fields, enum values, time relationships, provenance completeness, and unknown/unavailable handling; route-specific checks may be added in task 7.
- **Tests:**
  - Assert stable code/path/order for repeated validation of the same invalid input.
  - Cover all four classifications and preservation of available identifiers.
  - Verify validation does not silently classify indeterminate values as valid.
- **Definition of done:**
  - Validation metadata is serializable, safe for consumer responses, and usable by the service without relying on exceptions for expected data failures.
  - Stable validation tests pass.

### 4. Implement geometry models and deterministic geometry validation

- **Dependencies:** 2, 3
- **Affected files/modules:**
  - `backend/app/source_contracts/geometry.py`
  - `backend/app/source_contracts/validation.py`
  - `backend/tests/test_source_contract_models.py`
  - `backend/tests/test_source_contract_geometry.py` (create if preferred)
- **Implementation notes:**
  - Add geometry type, CRS, dimensionality, coordinate structure, and validation-result models.
  - Implement the `GeometryValidator` protocol and a pure deterministic validator for supported point/line/multiline/polygon/multipolygon structures.
  - Require declared supported CRS, finite coordinates, declared dimensionality, CRS-specific ranges, sufficient line coordinates, closed rings, and non-empty geometry.
  - Preserve source CRS and coordinates; do not swap coordinates, silently transform CRS, create straight-line fallbacks, or publish invalid geometry. Leave PostGIS spatial validity integration to the persistence path.
  - Return stable geometry codes and paths, including provider response ID when available.
- **Tests:**
  - Cover valid 2D/3D points and lines plus invalid CRS, dimensions, ranges, nesting, empty geometry, short lines, and unclosed rings.
  - Verify repeated failures use the same code/path.
  - Verify invalid geometry can be omitted from rejected route output.
- **Definition of done:**
  - Geometry validation is deterministic and independent of provider HTTP code.
  - Invalid geometry cannot pass the shared validator or be represented as trusted published geometry.
  - Unit tests pass.

### 5. Implement the injected-clock freshness policy

- **Dependencies:** 1, 2
- **Affected files/modules:**
  - `backend/app/source_contracts/freshness.py`
  - `backend/tests/test_source_contract_freshness.py`
- **Implementation notes:**
  - Add `RefreshPolicy`, `FreshnessPolicy`, and deterministic policy implementation with an injected `now` value.
  - Support configured time bases (`fetched_at`, `issued_at`, `valid_until`, `cached_age`) and threshold validation.
  - Return exactly fresh, stale, expired, unavailable, or unknown. Missing/invalid required timing is unknown; negative age is a validation error; source-provided freshness is accepted only when policy allows it.
  - Model offline cached age and health-derived unavailable/unknown semantics without treating offline data as live.
  - Keep read-time health evaluation separate from mutation of publication provenance.
- **Tests:**
  - Test exact threshold boundaries and just-before/after values.
  - Test future timestamps, missing/invalid timing, timezone handling, offline cache age, allowed/disallowed source-provided state, and no-expiration policies.
  - Verify identical inputs and injected time always produce identical output and no real wall-clock calls occur.
- **Definition of done:**
  - Freshness calculations are pure, timezone-safe, and policy-driven.
  - Consumer-visible stale, expired, unknown, and unavailable states are never downgraded to fresh.
  - Freshness tests pass.

### 6. Add safe-failure and handoff contract models

- **Dependencies:** 1, 2, 3
- **Affected files/modules:**
  - `backend/app/source_contracts/failures.py`
  - `backend/app/source_contracts/handoff.py`
  - `backend/tests/test_source_contract_models.py`
- **Implementation notes:**
  - Implement `SafeFailure`, `FetchMetadata`, `PublicationOutcome`, `AdapterSubmission`, and `ProviderAdapterHandoff`.
  - Include source, failure category, stable outcome code, observed time, safe message, validation metadata, last-known provenance, retryability, provider identifiers, attempted/completed times, transport outcome, latency, status class, and optional raw-response hash.
  - Forbid credentials, authorization headers, cookies, full sensitive URLs, raw response bodies, and unsafe exception text.
  - Ensure publication outcomes distinguish published, idempotent replay, rejected, and conflict, and that safe failures are always non-success results.
- **Tests:**
  - Cover transport, timeout, rate-limit, malformed, validation, geometry, no-route, unknown-status, source-unavailable, conflict, and database failure categories.
  - Verify safe failures preserve last-known provenance without presenting it as current success.
  - Verify required identifiers and safe metadata survive serialization.
- **Definition of done:**
  - Expected provider/contract failures have typed, consumer-safe representations.
  - Adapter handoff models contain all required handoff sections without implementing an adapter.
  - Unit tests pass.

### 7. Add typed SourceRecord and CSDI route-result models

- **Dependencies:** 2, 4, 6
- **Affected files/modules:**
  - `backend/app/source_contracts/models.py`
  - `backend/app/source_contracts/__init__.py`
  - `backend/tests/test_source_contract_models.py`
- **Implementation notes:**
  - Implement typed `SourceRecord`, `CSDIRouteResult`, provider identity, point values, route steps, vertical transitions, accessibility checks, and consumer-result envelope fields.
  - Require contract status to be exactly one of route_returned, route_rejected, route_unavailable, or route_unknown.
  - For a returned route, require origin, destination, valid geometry, steps, distance, duration, provider identity, and provenance. For rejected routes, retain validation metadata and omit invalid geometry.
  - Preserve provider request/response/network identifiers and vertical information exactly where supplied.
  - Keep route contract status separate from `AccessibilityCheck`; missing accessibility attributes are unknown or not evaluated, never passed.
  - Normalize Marine Department records to `typhoon_shelter_reference`; keep it distinct from `human_shelter` and expose safety-relevant absent facts as unknown.
- **Tests:**
  - Cover complete returned route, missing required route fields, no-route, unknown route status, and rejected geometry.
  - Verify route return does not imply accessibility approval.
  - Verify vertical fields and provider IDs are preserved.
  - Verify typhoon-shelter references cannot be classified as human shelters.
- **Definition of done:**
  - Typed models meet the provider-neutral contract without exposing provider schemas.
  - All route and source-type invariants are enforced and tested.

### 8. Implement source registry, refresh policy records, and source health semantics

- **Dependencies:** 1, 2, 3, 5, 6
- **Affected files/modules:**
  - `backend/app/source_contracts/registry.py` (create)
  - `backend/app/source_contracts/health.py` (create)
  - `backend/app/source_contracts/freshness.py`
  - `backend/tests/test_source_contract_health.py` (create)
- **Implementation notes:**
  - Add `SourceRegistryEntry`, configured source validation, and `SourceHealth` models.
  - Define exactly three distinct configured keys: `csdi`, `hko`, and `marine_department`, with non-empty source identity, authority, base URL, terms URL, attribution, refresh policy, and enabled state.
  - Implement health retention rules: success updates only the selected source; failed attempts update attempt/failure fields while preserving last successful fetch and valid snapshot/publication information.
  - Expose unavailable after a failed attempt with no success/snapshot; expose unknown before any attempt.
  - Keep source URLs and attribution as metadata only; do not add credentials or endpoint clients.
- **Tests:**
  - Verify registry uniqueness and source separation.
  - Verify success/failure retention and per-source isolation.
  - Verify unknown/unavailable health transitions and freshness calculations.
  - Verify absent capacity/accessibility/opening/facility/safety facts serialize as unknown.
- **Definition of done:**
  - Registry and health contracts are provider-independent and satisfy requirements 3 and 9.
  - Tests prove a failed source cannot erase another source or its last known success.

### 9. Define repository ports, canonical hashing, and in-memory test repositories

- **Dependencies:** 1, 8
- **Affected files/modules:**
  - `backend/app/source_contracts/repository.py`
  - `backend/app/source_contracts/canonical.py` (create)
  - `backend/tests/fakes/source_contract_repositories.py` (create)
  - `backend/tests/test_source_contract_repository.py` (create)
- **Implementation notes:**
  - Define registry, publication, and health repository protocols with transaction/result boundaries owned by the service.
  - Add versioned canonical serialization and SHA-256 hashing of normalized Pydantic JSON: sorted object keys, compact separators, explicit UTC timestamps, and explicit unknown/unavailable states.
  - Define publication identity from source, source record identity, source version identity, and Publication_Key, using reserved internal identities for absent IDs without exposing those as provider values.
  - Build in-memory fakes for deterministic service tests, including receipt storage for accepted, rejected, replay, and conflict outcomes.
- **Tests:**
  - Verify canonical hashes are stable for equivalent normalized payloads and change for meaningful payload changes.
  - Verify unknown and unavailable states participate explicitly in the hash.
  - Verify repository fakes enforce one identity and preserve prior records.
- **Definition of done:**
  - Service code can be tested without SQLAlchemy or a live database.
  - Publication identity and hashing behavior is deterministic and versioned.

### 10. Implement SourceContractService orchestration and idempotent publication

- **Dependencies:** 1, 8, 9
- **Affected files/modules:**
  - `backend/app/source_contracts/service.py`
  - `backend/tests/test_source_contract_service.py`
- **Implementation notes:**
  - Implement `submit`, `validate`, `publish`, `record_failure`, `get_source_health`, `get_registry`, and publication lookup operations.
  - Orchestrate validation, freshness, source-type handling, canonical hashing, repository publication, and health updates with an injected clock/repositories.
  - Implement receipt-first idempotency: same identity and hash returns the previous outcome; same identity and different hash returns conflict without mutation; invalid submissions create no trusted publication or trusted version.
  - Make successful publication and health success atomic at the repository boundary; make failed attempts retain prior success fields.
  - Produce safe failures for transport/timeout/rate-limit, malformed/invalid responses, no-route, unknown route status, unknown freshness, and persistence failure. Never fabricate geometry, distance, duration, steps, warnings, timestamps, or freshness.
- **Tests:**
  - Verify successful publication, per-source health updates, and failed-attempt retention.
  - Verify identical retries create one logical publication and return the prior outcome.
  - Verify payload conflicts, new source versions/record IDs, validation failures, and safe failures.
  - Verify route unavailable and route unknown outcomes contain no fabricated route fields.
- **Definition of done:**
  - The service is usable directly by future server-side adapters and has no provider HTTP implementation.
  - Requirements 5–7 and core handoff behavior are covered by passing service tests.

### 11. Add the Alembic migration and idempotent registry seeding

- **Dependencies:** 1, 2, 3, 8, 10
- **Affected files/modules:**
  - `backend/migrations/versions/0002_official_source_contracts.py`
  - `backend/tests/test_source_contract_migration.py`
- **Implementation notes:**
  - Create `source_registry`, `source_health`, `source_publications`, and `publication_receipts` with the keys, foreign keys, JSONB fields, timestamps, checks, indexes, and uniqueness constraints in `design.md`.
  - Store identity columns separately from normalized payload JSON; include payload hash, optional raw-response hash, contract version, validation, provenance, and optional geometry metadata/PostGIS geometry as designed.
  - Seed exactly CSDI, HKO, and Marine Department entries idempotently without overwriting operator-managed enabled state or refresh policies after initial installation.
  - Add reversible downgrade in dependency order. Do not edit `0001_backend_baseline.py`, health behavior, or provider configuration.
  - Use explicit Alembic operations because metadata autogeneration is not configured.
- **Tests:**
  - Verify upgrade creates all tables, constraints, indexes, and three distinct seeded sources.
  - Verify rerunning seed logic is idempotent and preserves operator-managed values.
  - Verify publication identity uniqueness, non-negative age/state checks, foreign keys, geometry columns where enabled, and downgrade.
  - Run against PostgreSQL/PostGIS when available; retain unit-level migration inspection when unavailable.
- **Definition of done:**
  - Migration is reversible, isolated to this feature, and compatible with the existing baseline.
  - A clean database has the three source entries and no provider credentials/raw response archive.

### 12. Implement SQLAlchemy/psycopg persistence behind repository protocols

- **Dependencies:** 1, 8, 9, 10
- **Affected files/modules:**
  - `backend/app/db/session.py` (create if needed)
  - `backend/app/db/source_contract_models.py` (create if using ORM mappings)
  - `backend/app/source_contracts/persistence.py`
  - `backend/tests/test_source_contract_persistence.py` (create)
- **Implementation notes:**
  - Add the minimal engine/session and repository implementation without leaking ORM models into contract models.
  - Implement transactional publication receipts, conflict/replay lookup, source publication lookup, source health retention, and registry reads.
  - Use parameterized SQL/SQLAlchemy expressions and bounded JSON/geometry inputs.
  - Preserve source provenance and prior valid publication on failed attempts; commit valid publication plus health success atomically.
  - Keep database readiness semantics separate from official-source health and return typed database-safe failures to the service.
- **Tests:**
  - Use repository integration tests against PostgreSQL/PostGIS when available.
  - Verify concurrent/duplicate publication behavior, receipt replay, payload conflict, new-version publication, and failed-attempt retention.
  - Verify invalid publications do not create trusted rows.
- **Definition of done:**
  - Production persistence satisfies the repository protocols and the service can run without in-memory fakes.
  - No changes are made to `app/db/health.py` or the existing readiness endpoint.

### 13. Add the consumer-facing source-contract API and composition wiring

- **Dependencies:** 7, 8, 10, 12
- **Affected files/modules:**
  - `backend/app/source_contracts/api.py`
  - `backend/app/source_contracts/__init__.py`
  - `backend/app/registry.py` or the feature registration integration point
  - `backend/tests/test_source_contract_api.py`
- **Implementation notes:**
  - Register an explicit `/api/v1/source-contracts` router through the existing feature registry; do not assume the registry adds `/api/v1`.
  - Implement `GET /sources`, `GET /sources/{source_key}/health`, `GET /publications/{publication_id}`, and `GET /routes/csdi/{publication_id}`.
  - Return normalized records, health, typed safe failures, attribution, terms reference, provenance, freshness, validation metadata, contract version, outcome code, explanation, and request ID where available.
  - Map missing identities to safe 404s, conflicts to 409 where exposed, malformed request shapes to existing 422 handling, database unavailability to safe 503, and valid domain non-success results to 200 typed outcomes.
  - Never expose provider payloads or require a browser to call an external provider. Preserve unknown/unavailable values through serialization.
- **Tests:**
  - Verify route prefixes, request-ID propagation, source list/health payloads, publication and CSDI views, unknown source/publication 404s, safe 503s, and normalized-only responses.
  - Verify stale/unknown/unavailable and route rejected/unavailable/unknown states remain explicit.
  - Verify existing `/api/v1/health` behavior remains unchanged.
- **Definition of done:**
  - Consumers have a provider-neutral backend interface with no adapter ingestion route.
  - API tests pass with fake service/repositories and the existing app factory.

### 14. Complete CSDI route-contract boundary and source-type safety tests

- **Dependencies:** 7, 8, 10, 11, 12, 13
- **Affected files/modules:**
  - `backend/app/source_contracts/models.py`
  - `backend/app/source_contracts/service.py`
  - `backend/app/source_contracts/api.py`
  - `backend/tests/test_source_contract_csdi.py` (create)
  - `backend/tests/test_source_contract_source_types.py` (create)
- **Implementation notes:**
  - Consolidate CSDI-specific required-field validation and result-state mapping at the shared contract boundary, not in a provider client.
  - Ensure a valid no-route signal becomes `route_unavailable`; indeterminate information becomes `route_unknown`; malformed/incomplete data becomes `route_rejected` with invalid geometry omitted.
  - Preserve route steps, distance, duration, geometry, provider identity, request/response/network IDs, vertical information, provenance, and validation metadata.
  - Keep `AccessibilityCheck` separate and mark absent accessibility facts unknown/not evaluated.
  - Ensure Marine Department normalization remains `typhoon_shelter_reference`, and future human-shelter candidate filtering excludes it.
- **Tests:**
  - Use provider-neutral fixture payloads supplied directly to the service; do not add HTTP calls.
  - Cover all four route statuses, missing required fields, invalid geometry, absent vertical/accessibility fields, and source-type exclusion.
- **Definition of done:**
  - CSDI consumer behavior meets requirement 4 without claiming route accessibility.
  - Source-type safety is enforced at both model/service and consumer-facing boundaries.

### 15. Run end-to-end contract, migration, and regression verification

- **Dependencies:** 7, 8, 10, 11, 12, 13, 14
- **Affected files/modules:**
  - `backend/tests/test_source_contract_integration.py` (create)
  - `backend/tests/test_health.py` (read-only regression coverage; do not change unless a narrowly scoped assertion is required)
  - `backend/tests/` contract test fixtures
- **Implementation notes:**
  - Exercise adapter handoff → service validation/freshness → repository publication → source health → consumer API using fake provider-neutral submissions and, where available, PostgreSQL/PostGIS.
  - Verify safe failure is observable as non-success and cannot be confused with a successful SourceRecord.
  - Verify source attribution, terms, name, record ID, mode, times, freshness, contract version, and validation metadata survive the full handoff.
  - Verify browser-facing API contains no provider-specific payload or direct-provider operation and no existing health endpoint regression.
  - Keep provider-specific HTTP adapter implementations out of all fixtures and tests.
- **Tests/commands:**
  - Run the backend unit suite, contract API suite, and migration tests.
  - Run PostgreSQL/PostGIS integration tests when the project’s Docker/database environment is available.
  - Run formatting/type/lint checks configured by `pyproject.toml`.
- **Definition of done:**
  - End-to-end tests demonstrate requirements 8–10 and the safety invariants.
  - All available validation commands pass, or any unavailable external database check is documented with the reason and next check.

### 16. Document the contract boundary and implementation handoff

- **Dependencies:** 15
- **Affected files/modules:**
  - `backend/app/source_contracts/README.md` (create)
  - `.kiro/specs/official-source-contracts/tasks.md` (this plan, only if implementation notes need final links)
  - Existing backend README only if a concise route/ migration reference is necessary; do not rewrite unrelated documentation
- **Implementation notes:**
  - Document module responsibilities, contract versioning, mode/freshness semantics, safe failure vocabulary, source registry entries, CSDI route/accessibility distinction, Marine Department type separation, repository boundary, API endpoints, migration order, and explicit provider-adapter follow-up scope.
  - Include examples of successful, stale/unknown, rejected, unavailable, and offline/replay consumer results without real credentials or provider payloads.
  - Document that browser clients use PathGuard endpoints and that future adapters call `SourceContractService.submit` server-side.
- **Tests/verification:**
  - Check every public module/endpoint named in the documentation exists.
  - Verify examples serialize using the implemented models and do not claim unavailable values are successful null/false/zero data.
  - Review documentation against requirements and design for scope drift.
- **Definition of done:**
  - A future CSDI/HKO/Marine Department adapter implementer can use the handoff and consumer contracts without reverse-engineering persistence or provider-specific behavior.
  - Documentation contains no credentials, direct provider implementation, or unsupported safety claim.

## Cross-task definition of done

The issue #10 PR is complete when all task checkboxes above are complete and:

1. The shared Pydantic contract package validates provenance, operating modes, freshness, time relationships, geometry, CSDI route results, safe failures, source types, and explicit unknown/unavailable states.
2. CSDI, HKO, and Marine Department remain three distinct registry entries with durable, source-isolated health semantics.
3. Publication identity, canonical hashing, receipts, idempotent replay, conflict handling, and validation-failure non-publication work in both fakes and PostgreSQL/PostGIS persistence.
4. Consumers receive only normalized contract results or typed Safe_Failure outcomes through `/api/v1/source-contracts`; browsers never call official providers directly.
5. The Alembic migration is additive and reversible; `0001_backend_baseline.py`, `/api/v1/health`, and provider-specific HTTP adapter code remain unchanged.
6. Unit, API, migration, persistence, and integration tests cover the safety invariants and the requirements/design behavior, with unavailable environment checks explicitly documented.
7. The final PR description links issue #10, lists the implemented task IDs, states provider HTTP adapters are intentionally out of scope, and reports validation commands/results.
