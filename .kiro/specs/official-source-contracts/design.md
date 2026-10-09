# Technical Design: Official Source Contracts

## 1. Purpose and scope

This feature adds the shared backend contract boundary between future server-side official-source adapters and PathGuard consumers. It defines typed provenance, operating modes, freshness, source registry and health, validation, geometry, safe failures, CSDI route results, publication identity, and consumer-facing API shapes.

The design is deliberately additive to the current backend scaffold:

- `app.main:create_app` remains the application factory and continues to own request IDs, middleware, generic exception handling, and the database readiness probe.
- `FeatureRegistry` remains the router registration boundary. The feature supplies an explicit versioned prefix because the registry does not add `/api/v1` automatically.
- The existing `/api/v1/health` endpoint continues to mean PostgreSQL/PostGIS process readiness only. Official-source availability is exposed separately as source health.
- Alembic revision `0001_backend_baseline` remains unchanged. A new hand-authored revision adds only the source-contract persistence boundary.
- No provider-specific HTTP client, endpoint selection, authentication, retry/rate-limit implementation, source-specific normalization, human-shelter catalogue, route ranking, hazard policy, frontend, or operator workflow is implemented by this feature.

The design uses Pydantic models for the public/domain contract and isolates persistence behind ports. This keeps contract behavior testable without a live database and leaves provider adapters free to evolve independently.

## 2. Existing scaffold constraints

The implementation must fit these current behaviors:

1. `Settings` is a frozen, slotted, environment-backed dataclass. It currently contains database, CORS, trusted-host, timeout, and request-size settings, but no provider credentials or endpoint configuration. This feature should not add provider secrets to configuration.
2. `create_app` stores settings and the injectable `DatabaseProbe` on `application.state`, installs the existing safe error handlers, mounts health under an `APIRouter(prefix="/api/v1")`, and invokes an optional `register_features` callback.
3. `FeatureRegistry.include_in` includes registered routers directly on the application. The source-contract router therefore registers with an explicit prefix such as `/api/v1/source-contracts`.
4. Request middleware supplies `request.state.request_id` and the `X-Request-ID` response header. Domain responses and API errors should preserve this correlation ID where an HTTP request exists.
5. The current database probe executes `SELECT PostGIS_Full_Version()` and deliberately does not check provider health, migrations, or source tables. The source service must not overload that probe.
6. Alembic currently uses `target_metadata=None`, and the baseline migration is empty. The first source-contract migration is therefore explicit rather than autogenerating from ORM metadata.
7. SQLAlchemy is pinned but no session factory, ORM model package, or repository exists. A minimal database session/repository boundary is part of the implementation design, not an assumption about existing code.

## 3. Architecture

### 3.1 Runtime flow

```text
Provider Adapter (future, server-side only)
    -> AdapterSubmission / ProviderAdapterHandoff
    -> SourceContractService
       1. validate mode, provenance, times, types, and geometry
       2. calculate freshness using the source policy and injected clock
       3. create normalized result or SafeFailure
       4. calculate canonical payload hash and publication identity
       5. atomically publish or return idempotent/conflict outcome
       6. update only the affected source's health
    -> SourceContractRepository
       - source_registry
       - source_health
       - publication_receipts
       - source_publications
    -> Consumer API / downstream backend feature
```

An adapter is expected to perform provider request construction and provider-schema normalization. It hands the service a validated provider payload, a normalized candidate, fetch metadata, and provenance. The service is the final authority for shared-contract validation and publication. A consumer receives only normalized models or explicit safe failures and never needs to parse a provider response.

The first implementation should make the service usable directly from Python. A future adapter can call it in-process; it does not need a public ingestion endpoint. If an internal ingestion endpoint is later required, it must use the same input model and service, not duplicate publication logic.

### 3.2 Boundaries

| Boundary | Responsibility | Explicit non-responsibility |
|---|---|---|
| Adapter boundary | Fetch one provider, authenticate, select endpoint, apply transport policy, validate provider payload, normalize provider fields | Shared publication identity, consumer API shapes, source-health persistence |
| Contract service | Apply shared validation, preserve provenance, calculate freshness, create safe failures, publish idempotently, update health | Provider HTTP behavior, route ranking, accessibility approval |
| Persistence boundary | Transactions, uniqueness, JSON/geometry storage, source-health retention | Provider-specific schema parsing |
| Consumer API | Expose source-independent registry, health, and normalized result envelopes | Calling CSDI/HKO/Marine Department directly |
| Existing health boundary | Report PostgreSQL/PostGIS readiness | Reporting official-source availability |

## 4. Contract versioning

Every consumer-facing result carries `contract_version`, separate from `provenance.source_version` and any provider payload version. The initial value is `official-source-contracts.v1` (a stable string, not a provider version). The implementation should keep a single constant in `app/source_contracts/version.py` and set it on all serialized results and persisted publications.

Versioning rules:

- `contract_version` changes only when a shared field meaning, requiredness, enumeration, validation rule, or serialization shape changes incompatibly.
- `source_version` is copied from the provider, official snapshot, replay fixture, or source dataset and is never replaced by the contract version.
- A provider changing its payload version does not require a contract version change when the normalized result remains compatible.
- API responses include the contract version in the top-level result envelope. A future route can negotiate supported contract versions, but version negotiation is not required for the first implementation.
- Persisted rows retain the contract version used to validate them, so re-reading an old publication does not silently reinterpret it under a newer contract.

## 5. Shared domain schemas

Use Pydantic v2 models with `ConfigDict(extra="forbid")` for contract-owned input/output models. Provider payloads remain an adapter-owned `dict[str, Any]` or provider model and are never exposed as the consumer contract.

### 5.1 Controlled enumerations

Define string enums in `app/source_contracts/enums.py`:

- `OperatingMode`: `live`, `snapshot`, `replay`, `offline`.
- `FreshnessState`: `fresh`, `stale`, `expired`, `unavailable`, `unknown`.
- `ContractStatus`: `route_returned`, `route_rejected`, `route_unavailable`, `route_unknown` for CSDI results.
- `ValidationClassification`: `error`, `warning`, `unknown_value`, `unavailable_result`.
- `SourceKey`: `csdi`, `hko`, `marine_department`.
- `RecordType`: `csdi_route_result`, `official_source_record`, `typhoon_shelter_reference`; reserve `human_shelter` as a distinct value owned by the future shelter catalogue rather than this feature.
- `FailureCategory`: `transport`, `timeout`, `rate_limited`, `malformed_response`, `validation_failed`, `geometry_invalid`, `no_route`, `unknown_status`, `source_unavailable`, `publication_conflict`, `contract_invalid`, `database_unavailable`.
- `AccessibilityState`: `passed`, `failed`, `unknown`, `not_evaluated`.

Do not use a boolean, zero, empty string, or ordinary nullable field as a substitute for `unknown` or `unavailable` in consumer-facing status fields.

### 5.2 Provenance and mode metadata

`ProvenanceEnvelope` is required on every published `SourceRecord` and `CSDIRouteResult`:

```text
contract_version: str
mode: OperatingMode
source_name: non-empty str
source_record_id: str | None
fetched_at: datetime | None
issued_at: datetime | None
valid_until: datetime | None
source_version: str | None
freshness_state: FreshnessState
mode_metadata: LiveMetadata | SnapshotMetadata | ReplayMetadata | OfflineMetadata
```

All datetimes are timezone-aware UTC values at the contract boundary. The service preserves provider-supplied values rather than replacing them with local values. `fetched_at` is the time the adapter successfully obtained the data, not automatically the time the service accepted it. `issued_at` and `valid_until` remain `None` when the provider did not supply them; neither is derived from `fetched_at`. A missing provider record identifier remains absent/unknown.

Mode metadata is a discriminated union keyed by `mode`:

- `LiveMetadata`: requires a non-null `fetched_at`; may include provider request/response identifiers.
- `SnapshotMetadata`: requires a non-empty `snapshot_version` and non-null `snapshot_at`; the snapshot version is also preserved as `source_version` when that is how the provider identifies it, but the two fields are not conflated.
- `ReplayMetadata`: requires a non-empty `fixture_id` or `event_sequence_id` and explicitly marks the data as demo/test data.
- `OfflineMetadata`: requires `cached_age_seconds` and a non-empty `non_live_limitation`; it cannot be represented as live and carries the cached-data limitation to consumers.

Pydantic model validators enforce mode-specific requirements before the service can publish. An invalid or missing mode is a contract error and cannot overwrite an existing publication.

### 5.3 Explicit unknown and unavailable values

For attributes where absence has safety meaning, use a small typed wrapper rather than overloading `None`:

```text
ValueState[T]:
  state: known | unknown | unavailable
  value: T | None
  explanation: str | None
```

`known` requires `value`; `unknown` and `unavailable` require no fabricated value and may carry an explanation. This is used for accessibility-relevant route attributes and Marine Department facts such as capacity, accessibility, opening status, facility availability, and safety evidence. Optional provenance timestamps and provider identifiers remain nullable because their absence is explicitly represented by the provenance contract and validation metadata.

### 5.4 Validation metadata

`ValidationMetadata` contains:

```text
valid: bool
findings: list[ValidationFinding]
provider_request_id: str | None
provider_response_id: str | None
correlation_id: str | None
```

Each `ValidationFinding` contains:

```text
code: stable snake_case error/warning code
path: JSON/Pydantic-style field path
classification: ValidationClassification
detail: safe, human-readable rule explanation
```

Examples of stable codes include `mode_invalid`, `live_fetched_at_required`, `time_order_invalid`, `geometry_crs_missing`, `geometry_coordinate_out_of_range`, `geometry_structure_invalid`, `required_route_field_missing`, `source_record_id_unknown`, and `publication_payload_conflict`. Provider response bodies and credentials are never copied into detail text.

Repeated validation of the same invalid input under the same contract version produces the same code and path. Ordering of findings is deterministic: field path, then code.

### 5.5 Source registry and health models

`SourceRegistryEntry` contains:

```text
source_key: SourceKey
source_name: non-empty str
authority: non-empty str
base_url: AnyHttpUrl
terms_url: AnyHttpUrl
attribution: non-empty str
refresh_policy: RefreshPolicy
enabled: bool
```

`RefreshPolicy` contains deterministic thresholds and policy flags, for example:

```text
fresh_after_seconds: positive int
stale_after_seconds: positive int
expired_after_seconds: positive int | None
allow_source_provided_freshness: bool
required_time_basis: fetched_at | issued_at | valid_until | cached_age
```

The thresholds must satisfy `fresh <= stale <= expired` when an expiration threshold is configured. A source-provided freshness value is accepted only when the registry policy explicitly allows it; otherwise the service calculates it.

`SourceHealth` contains:

```text
source_key: SourceKey
last_successful_fetch_at: datetime | None
last_attempted_fetch_at: datetime | None
last_failure: SafeFailure | None
data_age_seconds: non-negative int | None
freshness_state: FreshnessState
last_successful_publication_id: UUID | None
```

Health retention is asymmetric: a failed attempt updates `last_attempted_fetch_at` and `last_failure`, but never replaces `last_successful_fetch_at`, the last valid snapshot/publication, or its provenance. If no success or valid snapshot exists, health is `unavailable` after a failed attempt and `unknown` before any attempt.

### 5.6 Source records and CSDI results

`SourceRecord` is the generic normalized publication envelope:

```text
record_type: RecordType
record_id: UUID
source: SourceKey
provenance: ProvenanceEnvelope
attributes: dict[str, Any]
geometry: GeometryValue | None
validation: ValidationMetadata
```

`attributes` is not a free-form consumer contract for CSDI. Typed record models are used for known record types; the generic form is reserved for future official records whose source-specific fields are not part of this feature.

`CSDIRouteResult` contains:

```text
contract_version: str
contract_status: ContractStatus
origin: PointValue | None
destination: PointValue | None
geometry: GeometryValue | None
steps: list[RouteStep] | None
distance_meters: float | None
duration_seconds: float | None
provider_identity: ProviderIdentity
provider_request_id: str | None
provider_response_id: str | None
network_version: str | None
vertical_information: list[VerticalTransition] | None
accessibility_check: AccessibilityCheck
provenance: ProvenanceEnvelope
validation: ValidationMetadata
safe_failure: SafeFailure | None
explanation: str
```

A successful `route_returned` requires origin, destination, valid geometry, steps, distance, duration, provider identity, and provenance. A rejected result retains safe metadata but omits invalid geometry. `route_unavailable` means a valid provider result establishes that no route exists or a required dependency is unavailable; `route_unknown` means available information does not establish a valid route or a valid no-route result.

`AccessibilityCheck` is separate from `contract_status`:

```text
state: AccessibilityState
attributes: dict[str, ValueState[bool | str | float]]
explanation: str
```

A CSDI pedestrian route is never an accessibility approval. Missing stairs, lifts, levels, ramps, indoor/outdoor, footbridge, or related facts are `unknown` or `not_evaluated`, never an implicit pass.

`RouteStep` preserves provider order and provider identifiers where available. It may carry instruction text, geometry reference, level/elevation, indoor/outdoor state, and vertical-transition information as explicitly known/unknown values. The contract does not invent text, distances, levels, or transitions.

### 5.7 Safe failures

`SafeFailure` is a first-class non-success result:

```text
source: SourceKey
category: FailureCategory
outcome_code: str
observed_at: datetime
message: str
validation: ValidationMetadata | None
last_known_provenance: ProvenanceEnvelope | None
retryable: bool | None
provider_request_id: str | None
provider_response_id: str | None
```

The message is a safe explanation, not raw exception text. A failure explicitly distinguishes unavailable, rejected, and unknown outcomes from a successful record. It can carry last-known provenance without treating that old publication as the current successful result.

### 5.8 Publication outcome and adapter handoff

`PublicationOutcome` contains:

```text
status: published | idempotent_replay | rejected | conflict
publication_id: UUID | None
publication_key: str
payload_hash: str
validation: ValidationMetadata
safe_failure: SafeFailure | None
```

Use two related types to avoid claiming a publication outcome before service processing:

`AdapterSubmission` contains `source`, `fetch_metadata`, `provider_payload`, `normalization_result`, `provenance`, and adapter-generated `validation`.

`ProviderAdapterHandoff` is the service response containing the original fetch metadata, validated provider payload reference/metadata, normalized result or safe failure, provenance, validation outcome, and publication outcome. The provider payload is available only inside server-side code and persistence policy; it is not returned by consumer endpoints.

`FetchMetadata` includes attempted/completed timestamps, transport outcome, latency where available, provider request/response/network identifiers, HTTP status class where safe, and optional raw-response hash. It must not contain authorization headers, tokens, cookies, or full sensitive URLs.

## 6. Deterministic freshness policy

### 6.1 Interface

Define a pure protocol in `app/source_contracts/freshness.py`:

```text
class FreshnessPolicy(Protocol):
    def evaluate(
        self,
        *,
        now: datetime,
        provenance: ProvenanceEnvelope,
        policy: RefreshPolicy,
    ) -> FreshnessState: ...
```

The implementation receives an injected `now` value; it never calls the wall clock internally. It validates that all times are timezone-aware and uses UTC arithmetic. The same policy, provenance, and `now` always produce the same state.

### 6.2 Policy behavior

1. Select the configured time basis. For live data this is normally `fetched_at`; for snapshots it may be `snapshot_at`; offline data uses the explicit cached age; issued/valid-until may be used only when the registry policy says so.
2. If a required time is absent, malformed, or impossible to use, return `unknown`. Malformed time values are also a validation finding; freshness calculation must not turn them into a successful result.
3. Reject negative ages as a time validation error rather than treating future data as fresh.
4. Return `fresh` through `fresh_after_seconds`, `stale` through the stale threshold, and `expired` after the configured expiration threshold. A policy without an expiration threshold remains `stale` after the stale threshold until another contract rule marks it unavailable.
5. `unavailable` is used when there is no valid current publication/snapshot and the source health has a failed attempt. It is not a substitute for missing timing information; missing timing is `unknown`.
6. A source-provided state is used only when `allow_source_provided_freshness` is true and the value is one of the controlled enum values. Otherwise the service calculates the state.
7. Consumers receive the exact stored state. The API never downgrades stale/expired/unknown to fresh and never recalculates it with a different clock.

The service evaluates freshness before publication and again when reading source health if the policy defines age-relative state. A read-time evaluation must be clearly marked as a health view and must not mutate the publication provenance without a new publication.

## 7. Validation and geometry interfaces

### 7.1 Contract validator

Define `ContractValidator` in `app/source_contracts/validation.py`:

```text
class ContractValidator(Protocol):
    def validate_source_record(self, record: SourceRecord) -> ValidationMetadata: ...
    def validate_csdi_route(self, result: CSDIRouteResult) -> ValidationMetadata: ...
    def validate_handoff(self, submission: AdapterSubmission) -> ValidationMetadata: ...
```

Validation order is deterministic:

1. model shape and required fields;
2. controlled enum values and mode-specific metadata;
3. timezone-aware time parsing and relationships (`issued_at <= fetched_at` when both exist, `valid_until >= issued_at` when both exist, and no future/negative data age where the policy disallows it);
4. provenance completeness and preserved provider values;
5. geometry and coordinate constraints;
6. type-specific semantic rules, including route required fields and source-type separation.

All applicable failures are returned in one metadata object, with sorted deterministic findings. Validation errors are not exceptions at the service boundary except for programming/configuration defects.

### 7.2 Geometry interface

Define `GeometryValue`, `GeometryValidationResult`, and `GeometryValidator` in `app/source_contracts/geometry.py`:

```text
GeometryValue:
  geometry_type: Point | LineString | MultiLineString | Polygon | MultiPolygon
  coordinates: JSON-compatible coordinate structure
  crs: non-empty CRS identifier
  dimensions: 2 | 3
```

The validator checks:

- CRS is declared and supported by the configured geometry registry;
- every coordinate has the declared dimensionality and finite numeric values;
- coordinate ranges match the declared CRS;
- geometry type and nested sequence structure are correct;
- a line has sufficient coordinates, rings are closed where applicable, and empty geometries are rejected;
- spatial validity is checked using PostGIS in the persistence/integration path or a deterministic pure validator for unit tests;
- no implicit CRS conversion, coordinate swapping, straight-line fallback, or fabricated geometry occurs.

The initial contract should preserve source CRS and coordinates as supplied. If a later consumer needs WGS84 spatial queries, a separately versioned canonicalization port may transform only through an explicit CRS registry and retain the original CRS/geometry. The feature must not silently claim a transform it did not perform.

Invalid geometry is omitted from rejected CSDI results and is never written as a trusted publication. Geometry validation metadata includes a stable code, field path, rule detail, and provider response ID when available.

## 8. Source registry and persistence-ready boundary

### 8.1 Repository ports

Define repository protocols in `app/source_contracts/repository.py` so the service does not depend directly on SQLAlchemy:

```text
class SourceRegistryRepository(Protocol):
    def get(self, source: SourceKey) -> SourceRegistryEntry | None: ...
    def list_enabled(self) -> Sequence[SourceRegistryEntry]: ...

class SourcePublicationRepository(Protocol):
    def publish_idempotently(...): ...
    def get_publication(...): ...
    def get_latest_valid(...): ...

class SourceHealthRepository(Protocol):
    def record_attempt(...): ...
    def record_success(...): ...
    def record_failure(...): ...
    def get(...): ...
```

`SourceContractService` owns transaction boundaries. A successful publication and its source-health success update commit atomically. A failed attempt commits the attempted timestamp and failure metadata while retaining the previous success fields. A validation failure does not mutate trusted publication/version state.

### 8.2 Minimal tables

The new migration creates four focused tables. JSONB is used for contract payloads and metadata because the normalized contract is versioned and provider records differ; query-critical identity, status, source, times, hashes, and geometry are separate columns.

1. `source_registry`
   - `source_key` primary key (`csdi`, `hko`, `marine_department`);
   - `source_name`, `authority`, `base_url`, `terms_url`, `attribution` non-null;
   - `refresh_policy_json` non-null;
   - `enabled` non-null default true;
   - timestamps for row maintenance.

2. `source_health`
   - `source_key` primary/foreign key to registry;
   - `last_successful_fetch_at`, `last_attempted_fetch_at` nullable timestamptz;
   - `last_failure_json` nullable JSONB;
   - `last_successful_publication_id` nullable UUID;
   - `data_age_seconds` nullable non-negative integer;
   - `freshness_state` non-null controlled text;
   - `updated_at` non-null timestamptz.

3. `source_publications`
   - `publication_id` UUID primary key;
   - `source_key` foreign key;
   - `record_type`, `source_record_id` nullable, `source_record_identity` non-null, `source_version` nullable, `source_version_identity` non-null, `publication_key` non-null;
   - `contract_version`, `contract_status` nullable, `provenance_json`, `validation_json`, `normalized_payload_json` JSONB;
   - `payload_hash` non-null SHA-256 hex string; `raw_response_hash` nullable;
   - `geometry_json` nullable and `geometry_crs` nullable; optional PostGIS `geometry` column with unconstrained SRID for validated spatial indexing;
   - `published_at` and `created_at` timestamptz.

   `source_record_identity` is an internal uniqueness key equal to the provider `source_record_id` when present, or a reserved `unknown:<publication_key>` identity when absent. The reserved value is not exposed as the provider's source record ID and prevents PostgreSQL NULL uniqueness from creating duplicate unknown-ID publications.

4. `publication_receipts`
   - durable idempotency ledger for accepted, rejected, and conflict outcomes;
   - `source_key`, `source_record_identity`, `source_version` nullable, `source_version_identity`, `publication_key`, `payload_hash`, `outcome_json`, optional `publication_id`, and `created_at`;
   - a unique identity constraint on `(source_key, source_record_identity, source_version_identity, publication_key)`;
   - an index on source and publication key.

`source_version_identity` is a non-null internal key equal to the provider `source_version` when present or a reserved `unknown-version` value when absent. It is used only for uniqueness and is not exposed as a provider-supplied version. The same normalization rule applies in both publication tables.

The receipt is not a trusted source publication. It allows a repeated invalid attempt with the same payload to return the same deterministic outcome while ensuring validation failures do not create trusted current data.

### 8.3 Idempotent publication algorithm

Within one database transaction:

1. Validate the candidate and compute the canonical payload hash before writing trusted data.
2. Derive identity from `source_key`, provider `source_record_id` or the reserved unknown identity, `source_version` or the reserved unknown-version identity, and `publication_key`.
3. Lock or insert the receipt identity. If an existing receipt has the same payload hash, return its previous outcome and publication ID without creating a second row.
4. If the identity exists with a different hash, return `conflict` with safe metadata and do not modify either row.
5. If validation failed, write only a receipt with `rejected`; do not create/update `source_publications` or success health.
6. If valid, insert one `source_publications` row and a `published` receipt. A unique constraint handles concurrent retries; the losing transaction rereads the winner and returns `idempotent_replay`.
7. A new source version or source record ID creates a new identity and leaves prior rows/provenance unchanged.

Canonical hashing uses one versioned function: serialize the normalized Pydantic model in JSON mode with sorted object keys, compact separators, explicit UTC timestamp formatting, and explicit preservation of controlled unknown/unavailable states; hash the UTF-8 bytes with SHA-256. The hash algorithm and canonicalization version are stored with the receipt so a future canonicalization change cannot silently make old retries conflict.

### 8.4 Initial registry entries

The migration or deterministic seed routine creates exactly three distinct registry entries:

- `csdi`: Hong Kong Lands Department CSDI, with official base/terms URLs and attribution metadata;
- `hko`: Hong Kong Observatory, with official base/terms URLs and attribution metadata;
- `marine_department`: Hong Kong Marine Department, with official base/terms URLs and attribution metadata.

The URLs are registry metadata and attribution references, not a provider HTTP implementation. Credentials, tokens, endpoint selection, retry rules, and rate limits remain adapter configuration and are not stored in these tables. Seed behavior must be idempotent and must not overwrite operator-managed enabled state or refresh-policy changes after initial installation.

Marine Department normalization always uses `typhoon_shelter_reference`. It cannot create a `human_shelter` row. Future human-shelter queries must filter by the distinct normalized type and exclude `typhoon_shelter_reference` before returning destination candidates.

## 9. Service behavior

Implement `SourceContractService` in `app/source_contracts/service.py` with these operations:

- `submit(submission, now) -> ProviderAdapterHandoff`;
- `validate(...) -> ValidationMetadata`;
- `publish(...) -> PublicationOutcome`;
- `record_failure(source, failure, attempted_at) -> SourceHealth`;
- `get_source_health(source) -> SourceHealth`;
- `get_registry() -> list[SourceRegistryEntry]`;
- `get_publication(publication_id) -> ConsumerResult`.

`submit` performs validation, freshness calculation, type-specific handling, canonical hashing, repository publication, and health update. It accepts an injected `Clock` and repository ports so unit tests can prove deterministic behavior.

Successful handoff behavior:

- publish a complete normalized source record or CSDI route result;
- preserve provider source name, source record ID, source version, provider IDs, attribution, terms reference, and supplied times;
- update only the submitted source's success health;
- return the publication outcome and contract version.

Failure behavior:

- transport/timeout/rate-limit errors produce a `SafeFailure`, update attempt/failure health, and preserve last success;
- malformed, incomplete, or invalid geometry responses produce validation metadata and a non-success result, do not replace a valid publication, and omit invalid geometry;
- valid provider no-route signals produce `route_unavailable` without geometry, distance, duration, steps, or straight-line substitutes;
- indeterminate route status produces `route_unknown`;
- missing timing required for freshness produces `unknown`, never a fresh value;
- invalid mode or contract shape is rejected before publication and cannot overwrite an existing identity.

The service must not catch programming errors and turn them into apparent provider failures. Expected domain failures are typed outcomes; unexpected errors reach the existing generic HTTP handler, which intentionally hides exception details.

## 10. Backend API and consumer handoff

Register a dedicated router through the existing feature callback, using an explicit prefix `/api/v1/source-contracts`. The composition root supplies the repository/service dependency; the current app factory need not be changed by this design document.

Minimum consumer endpoints:

- `GET /api/v1/source-contracts/sources` — enabled/configured registry entries and current source health, including attribution, refresh policy summary, mode/freshness, last success/attempt, and safe failure information.
- `GET /api/v1/source-contracts/sources/{source_key}/health` — one source-independent `SourceHealth` result. Unknown source keys are a safe 404 contract error; database readiness failures are 503 with the existing request ID and a safe database code.
- `GET /api/v1/source-contracts/publications/{publication_id}` — normalized `SourceRecord`, `CSDIRouteResult`, or explicit safe failure envelope, never provider payloads.
- `GET /api/v1/source-contracts/routes/csdi/{publication_id}` — typed CSDI result view with route contract status and accessibility-check outcome kept separate.

The first implementation does not expose adapter ingestion over a browser-accessible route. Server-side adapters call `SourceContractService.submit`. If a protected internal ingestion endpoint is later added, it must be non-public, authenticated by the future operator/service boundary, and must return the same `ProviderAdapterHandoff` rather than accepting provider calls from browsers.

Every response contains:

```text
contract_version
outcome_code
explanation
source identity
provenance or explicit no-provenance state
freshness state
validation metadata
safe failure when applicable
request_id when delivered through HTTP
```

HTTP mapping:

- `200` for a valid result, source health, or a known safe non-success result that is part of the domain contract;
- `404` for a missing publication/source identity;
- `409` for a publication identity conflict;
- `422` for malformed API request shape, using the existing `validation_error` handler;
- `503` for database readiness/persistence unavailability, without exposing connection details;
- `500` only for unexpected defects, using the existing generic `internal_error` response.

A valid `route_unavailable`, `route_unknown`, stale result, or source failure is not converted to a generic HTTP error if the service can return the typed safe result. Consumers must branch on `contract_status`/`outcome_code`, not on nullable geometry alone.

The browser/client boundary is backend-only: clients call these PathGuard endpoints and never call CSDI, HKO, or Marine Department directly.

## 11. Module and file structure

The smallest implementation should add the following modules without moving current files:

```text
backend/app/source_contracts/
  __init__.py                 # public contract/service exports
  version.py                  # official-source-contracts.v1
  enums.py                    # controlled enum values
  values.py                   # explicit known/unknown/unavailable wrappers
  provenance.py               # modes, mode metadata, provenance envelope
  validation.py               # findings, metadata, validator protocol/implementation
  geometry.py                 # geometry models and validator protocol
  freshness.py                # RefreshPolicy and deterministic policy implementation
  models.py                   # SourceRecord, CSDIRouteResult, route/accessibility models
  failures.py                 # SafeFailure and failure categories
  handoff.py                  # FetchMetadata, submission, handoff, publication outcome
  repository.py                # repository protocols and transaction result types
  service.py                   # SourceContractService orchestration
  api.py                       # /api/v1/source-contracts consumer router
  persistence.py              # SQLAlchemy/psycopg repository implementation

backend/app/db/
  session.py                  # minimal SQLAlchemy engine/session boundary, if needed
  source_contract_models.py   # persistence mappings only, if ORM mappings are used

backend/migrations/versions/
  0002_official_source_contracts.py  # source registry, health, receipts, publications

backend/tests/
  test_source_contract_models.py
  test_source_contract_freshness.py
  test_source_contract_service.py
  test_source_contract_api.py
  test_source_contract_migration.py
```

`app/db/health.py`, `app/api/health.py`, `app/main.py`, `app/core/config.py`, and `0001_backend_baseline.py` remain unchanged by this feature. The exact split between `persistence.py` and SQLAlchemy mappings may be simplified during implementation, but the service must retain the repository protocol and must not let ORM details leak into contract models.

## 12. Error handling and observability

Expected contract failures are data outcomes, not raw exceptions. The service logs structured internal diagnostics with source key, request/correlation ID, failure category, contract version, publication identity, and latency, but never logs credentials, authorization headers, full provider payloads, precise user locations beyond the retention policy, or raw exception text in consumer responses.

Safe failure messages should use stable outcome codes and concise explanations such as:

- `source_fetch_timeout`: the source could not be reached before the configured timeout;
- `source_response_invalid`: the response failed the shared contract validation;
- `route_not_returned`: the provider established that no pedestrian route was available;
- `route_status_unknown`: the available response did not establish a valid route status;
- `source_freshness_unknown`: required source timing was not available;
- `publication_conflict`: the publication identity was already associated with a different payload.

Provider-specific details belong in restricted server logs or adapter diagnostics, not in the public `message`. The existing request ID is copied into validation/correlation metadata where available and returned by HTTP middleware.

Source health is observable through the source-contract endpoints and must not change the semantics or status code of `/api/v1/health`. A source can be unavailable while the database is ready, and the database can be unavailable while a previously cached contract result remains readable only if the repository policy explicitly permits it.

## 13. Testing strategy

### 13.1 Pure model and validator tests

Use fixed UTC datetimes and fixture payloads to verify:

- all four operating modes and their required metadata;
- missing `issued_at`, `valid_until`, and provider record IDs remain absent;
- provider-supplied names, IDs, versions, and timestamps are preserved exactly;
- invalid mode, invalid enum, missing required fields, and invalid time relationships produce stable findings;
- validation findings are deterministic in code/path/order;
- explicit unknown/unavailable values cannot serialize as successful false/zero/null semantics;
- CSDI required fields and route status rules;
- accessibility state remains separate from `route_returned`;
- invalid geometry is omitted from rejected route output;
- Marine Department records remain `typhoon_shelter_reference` and never become human shelters;
- contract version and provider/source version are independently serialized.

### 13.2 Freshness property/examples

Test the policy at exact threshold boundaries, just before/after thresholds, future timestamps, missing required times, invalid timezone values, stale/expired preservation, offline cached age, and health-derived unavailable/unknown states. Pass a fake clock; do not use sleep or the real wall clock.

### 13.3 Service and repository tests

Use in-memory fake repositories patterned after the existing `FakeProbe`/`TestClient` tests:

- successful publication updates only the selected source;
- failed attempt updates attempted/failure fields while retaining last success and snapshot provenance;
- same identity and same payload returns the previous outcome and one logical record;
- same identity and different payload returns conflict and leaves the existing row unchanged;
- a new source version or source record ID creates a new publication;
- invalid publication creates no trusted record or trusted version;
- concurrent/duplicate publication behavior is covered in a PostgreSQL integration test;
- safe failures never contain fabricated route geometry, distance, duration, steps, warning text, issue time, or freshness.

### 13.4 API tests

Follow `backend/tests/test_health.py` with `create_app`, a fake database probe, and a test feature registration callback. Verify explicit route prefixes, request-ID propagation, consumer-only normalized payloads, source health output, 404/409/422/503 mappings, stale/unknown preservation, and that an adapter/provider payload cannot be fetched through the public API.

### 13.5 Migration/PostGIS tests

Run the new Alembic revision against the Docker PostgreSQL/PostGIS image. Verify tables, foreign keys, controlled states, publication identity uniqueness, geometry storage/validation, seed idempotence, and downgrade behavior. The existing health test must continue to pass and still report only database/PostGIS readiness.

## 14. Migration implications and rollout

Add `0002_official_source_contracts.py` with `down_revision = "0001_backend_baseline"`. It should:

1. create the PostGIS-backed tables and indexes described above;
2. use explicit SQLAlchemy/Alembic operations because `target_metadata=None` remains the current convention;
3. verify/use the existing PostGIS extension according to deployment policy, but never make the application health probe install extensions;
4. seed the three source registry rows idempotently;
5. create check constraints or service-enforced constraints for controlled states, non-negative ages, and required registry fields;
6. provide a reversible downgrade that removes only the new feature tables/indexes in dependency order.

Do not alter the empty baseline migration. Do not add provider credentials, user route history, shelter catalogue records, or HKO/CSDI/Marine Department raw response archives in this migration. If raw response retention is later needed for debugging, it requires a separate privacy and retention decision; the current design stores only an optional raw-response hash.

Deployment order is migration first, then source-contract service/API, then adapters. Until the migration and service are enabled, existing health behavior remains unchanged. If persistence is unavailable, the service returns a safe database failure and does not report a successful publication.

## 15. Security and privacy

- Provider calls are server-side only. Browser clients receive normalized results and safe failures, never provider credentials or direct provider endpoints for execution.
- Registry URLs, terms, and attribution are public metadata; secrets are not stored in source registry rows or committed configuration.
- Do not persist authorization headers, cookies, access tokens, full request URLs with secrets, or raw provider responses by default.
- Route origin/destination can be sensitive location data. Apply the smallest retention needed for the publication/use case, avoid logging coordinates, and restrict publication lookup by UUID rather than guessable source identifiers.
- Keep provider request/response IDs and raw hashes only when needed for support/audit and treat them as potentially correlatable identifiers.
- Use parameterized SQL/SQLAlchemy expressions and validate all source keys, URLs, identifiers, JSON sizes, and geometry sizes before persistence.
- Enforce request body limits already provided by `create_app`; add contract-specific limits for steps, coordinate count, nested JSON depth, and explanation length to prevent oversized or pathological payloads.
- Public errors expose stable codes and safe messages only. The existing generic exception handler remains the fallback for unexpected exceptions.
- If an internal adapter-ingestion HTTP endpoint is ever added, it requires a separate service-authentication decision and must not be enabled as an unauthenticated public route.
- Source attribution and terms references are retained in consumer output so downstream UI cannot accidentally hide official-source obligations.

## 16. Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Provider schema or status drift | Malformed data could be treated as trusted | Adapter-owned schema validation plus shared contract validation, stable findings, and safe rejection |
| Ambiguous source timing | Incorrect fresh/stale claims | Explicit policy time basis, injected clock, `unknown` when required timing is absent, no `fetched_at` derivation |
| CRS or geometry ambiguity | Misplaced or invalid route data | Require declared CRS/dimensionality, validate ranges/structure, preserve source geometry, never silently transform |
| Duplicate/retried deliveries | Conflicting or duplicated publications | Transactional receipt identity, canonical hash, unique constraints, conflict outcome, concurrency integration test |
| Partial health update | Failed data could erase known-good state | Atomic success update and separate failure update that retains last success/snapshot fields |
| Provider-specific behavior leaking into consumers | Tight coupling and unsafe interpretation | Typed normalized models, no provider payload API, adapter/service boundary tests |
| Route returned mistaken for accessible | Unsafe recommendation | Separate `AccessibilityCheck`, explicit unknown attributes, no accessibility claim from route existence |
| Marine shelter mistaken for human shelter | Incorrect destination recommendation | Distinct record type, separate query classification, exclusion invariant and test |
| PostGIS/database outage | Loss of publication or misleading readiness | Existing health probe remains separate; typed 503 persistence failure; no false success |
| Contract version drift | Consumers misread old data | Persist and return shared contract version independently from provider version |
| Sensitive location/log retention | Privacy exposure | UUID lookup, minimal retention, no coordinate logs, restricted diagnostics |
| Overbuilding before adapters exist | Delayed feature delivery | Implement pure contracts, fake repositories, migration, and consumer API first; keep all HTTP clients out of scope |

## 17. Definition of done for this design

An implementation following this design is complete when:

1. The shared models and service enforce all required provenance, mode, freshness, safe-failure, CSDI, validation, geometry, idempotency, source-type, and versioning rules.
2. The registry has separate CSDI, HKO, and Marine Department entries and durable health retention semantics.
3. The migration creates the persistence-ready boundary without changing the baseline migration or existing database-health meaning.
4. Consumers can obtain normalized results and safe failures through the versioned backend API without provider-specific parsing or browser-to-provider calls.
5. Deterministic tests cover threshold boundaries, invalid data, safe failure, geometry, publication conflicts, source-health retention, source separation, and API handoff.
6. Provider-specific adapters remain a separate follow-on implementation and are not hidden inside the contract service.
