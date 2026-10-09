# Requirements Document

## Introduction

PathGuard needs a shared backend contract layer so official-source adapters and downstream application features can exchange trustworthy, typed records without coupling consumers to provider-specific payloads. This feature defines the provenance envelope, source registry and health model, operating-mode semantics, provider-neutral CSDI route result contract, validation and safe-failure metadata, idempotent publication behavior, and the handoff boundary used by the CSDI, Hong Kong Observatory (HKO), and Marine Department adapters.

This feature is a shared backend contract only. It does not implement provider-specific HTTP clients, source-specific normalization rules, shelter matching, route ranking, hazard policy, frontend rendering, or operator workflows. Browser clients consume PathGuard backend endpoints and do not call official providers directly.

## Glossary

- **Source_Contract_Service**: The shared backend component that defines, validates, publishes, and serves normalized official-source records and contract results.
- **Provenance_Envelope**: The metadata attached to every normalized source record or contract result that identifies its origin, timing, version, operating mode, and freshness.
- **Source_Record**: A normalized record published by a Provider_Adapter through the Source_Contract_Service.
- **Provider_Adapter**: A server-side integration component that fetches and normalizes one external official source. This feature defines the adapter handoff contract but does not implement an adapter.
- **Consumer**: A backend service, API endpoint, worker, or client-facing feature that reads a Source_Record or contract result.
- **Source_Registry**: The authoritative catalogue of configured sources, source identity, attribution, refresh policy, and health state.
- **Source_Health**: The recorded operational state of a source, including last successful fetch, last error, latency where available, data age, and freshness state.
- **Operating_Mode**: One of `live`, `snapshot`, `replay`, or `offline`, describing how a record or result was obtained and what actions remain valid.
- **Freshness_State**: A controlled value describing whether source data is `fresh`, `stale`, `expired`, `unavailable`, or `unknown` under the configured source policy.
- **Source_Version**: A provider or fixture version identifier that distinguishes the source representation used to produce a record.
- **Fetch_Metadata**: Request and response context supplied by a Provider_Adapter, including attempt time, response time, transport outcome, and provider request identifiers where available.
- **Normalization_Result**: The provider-neutral record or failure produced after a Provider_Adapter maps a validated provider payload into the shared contract.
- **Publication_Outcome**: The result of contract validation and publication, including logical record identity, status, and Validation_Metadata.
- **Provider_Response_ID**: A provider-supplied identifier for the response, request, dataset, or network version used to produce a Source_Record.
- **Contract_Status**: The controlled state describing whether a normalized result is returned, rejected, unavailable, or unknown.
- **Coordinate_Reference_System**: The coordinate system identifier and coordinate interpretation required to validate Geometry.
- **CSDI**: The Hong Kong Lands Department 3D Pedestrian Route Search service used as a route provider.
- **CSDI_Route_Result**: The provider-neutral PathGuard representation of a returned pedestrian route, including origin, destination, geometry, steps, distance, duration, vertical information, provider identity, and contract status.
- **Geometry**: A coordinate sequence or geometry object used for a source record, route, point, line, or area.
- **Geometry_Validation**: Deterministic checks for coordinate reference system, coordinate ranges, geometry type, structure, and required spatial validity.
- **Validation_Metadata**: Structured information describing validation status, field-level errors, warnings, source response identifiers, and normalization issues.
- **Publication_Key**: The deterministic identity used to make publication idempotent for the same source record and source version.
- **Safe_Failure**: A result that reports unavailable, invalid, stale, or unknown data with structured explanation and provenance instead of inventing a route, warning, status, timestamp, or freshness state.
- **Human_Shelter**: A verified human evacuation destination represented by the PathGuard human-shelter catalogue.
- **Typhoon_Shelter_Reference**: A Marine Department typhoon-shelter location record used as a separate reference layer and not as a Human_Shelter.
- **Backend_Provider_Boundary**: The rule that external provider calls occur only through server-side Provider_Adapters and never from browser clients.

## Requirements

### Requirement 1: Provenance envelope

**User Story:** As a downstream PathGuard feature, I want every published official-source result to include a complete Provenance_Envelope, so that users and services can distinguish current, historical, and uncertain data.

#### Acceptance Criteria

1. THE Source_Contract_Service SHALL include a Provenance_Envelope on every published Source_Record and CSDI_Route_Result.
2. THE Provenance_Envelope SHALL contain the `mode`, `source_name`, `source_record_id`, `fetched_at`, `issued_at`, `valid_until`, `source_version`, and `freshness_state` fields.
3. WHEN the source does not provide `issued_at` or `valid_until`, THE Source_Contract_Service SHALL mark the corresponding field as absent and SHALL NOT derive its value from `fetched_at`.
4. WHEN a Provider_Adapter does not provide a source record identifier, THE Source_Contract_Service SHALL mark `source_record_id` as unknown or absent in the Provenance_Envelope.
5. WHEN a provider supplies a source name, record identifier, version, or time, THE Source_Contract_Service SHALL preserve the supplied value in the corresponding Provenance_Envelope field without replacing it with a PathGuard-generated value.

### Requirement 2: Operating modes and freshness semantics

**User Story:** As a Consumer, I want mode and freshness semantics to be machine-readable, so that the Consumer can apply the correct limitations to live, snapshot, replay, and offline data.

#### Acceptance Criteria

1. THE Source_Contract_Service SHALL publish exactly one `Operating_Mode` value for each record, and the value SHALL be one of `live`, `snapshot`, `replay`, or `offline`.
2. WHEN an approved Provider_Adapter fetch succeeds for a record with `mode` set to `live`, THE Source_Contract_Service SHALL publish the record as live and SHALL expose a non-null fetched time and `freshness_state`.
3. WHEN the Source_Contract_Service publishes a record with `mode` set to `snapshot`, THE Source_Contract_Service SHALL identify the record as a versioned official-data snapshot and SHALL expose a non-empty snapshot version and a non-null snapshot time.
4. WHEN the Source_Contract_Service publishes a record with `mode` set to `replay`, THE Source_Contract_Service SHALL identify the record as deterministic demo or test data and SHALL expose the non-empty replay fixture identifier or event-sequence identifier used to produce the record.
5. WHEN the Source_Contract_Service publishes a record with `mode` set to `offline`, THE Source_Contract_Service SHALL identify the record as locally cached data, SHALL expose its cached data age, and SHALL expose an explicit indication that the data may be stale and SHALL NOT be treated as live.
6. THE Source_Contract_Service SHALL determine `Freshness_State` either by calculating it from the configured source timing policy and available source times or by accepting a source-provided state when that state is explicitly permitted by the policy, and SHALL emit exactly one of `fresh`, `stale`, `expired`, `unavailable`, or `unknown`.
7. IF any timing information required by the configured source timing policy is absent, null, or invalid, THEN THE Source_Contract_Service SHALL set `freshness_state` to `unknown`.
8. IF a record has `freshness_state` set to `stale`, `expired`, `unavailable`, or `unknown`, THEN THE Source_Contract_Service SHALL expose that same state unchanged to every Consumer that receives the record and SHALL NOT represent the record as `fresh`.
9. IF a record has a missing or unsupported `mode` value, THEN THE Source_Contract_Service SHALL reject the record with an error indication identifying the invalid operating mode, SHALL NOT publish or overwrite the record, and SHALL leave any previously published record unchanged.

### Requirement 3: Source registry and source health

**User Story:** As an operator or Consumer, I want a consistent registry and health view, so that PathGuard can show which official sources are configured, working, stale, or unavailable.

#### Acceptance Criteria

1. THE Source_Registry SHALL maintain exactly one authoritative entry for each configured source, and each entry SHALL expose a non-empty source name, authority, base URL, terms URL, attribution text, refresh policy, and enabled state.
2. THE Source_Registry SHALL maintain CSDI, HKO, and Marine Department as three distinct source entries, without merging any of these sources into another entry.
3. THE Source_Contract_Service SHALL maintain one Source_Health record for each configured source, including the timestamp of the most recent successful fetch, the timestamp of the most recent attempted fetch when an attempt has occurred, failure metadata for the most recent failed attempt when a failure has occurred, data age when a valid snapshot or publication timestamp exists, and Freshness_State.
4. WHEN a Provider_Adapter reports a successful validated publication for a configured source, THE Source_Contract_Service SHALL update only that source's Source_Health with the success timestamp for that publication and a Freshness_State calculated from the source's refresh policy.
5. IF a Provider_Adapter reports a timeout, rate limit, transport error, or invalid response, THEN THE Source_Contract_Service SHALL update that source's attempted-fetch timestamp and failure metadata, retain its previous successful-fetch timestamp and valid snapshot information, and SHALL NOT record the failed attempt as a successful fetch.
6. THE Source_Contract_Service SHALL expose each configured source's identity, attribution, enabled state, Source_Health, Freshness_State, and available failure information to Consumers through a source-independent representation that does not require Consumers to parse provider-specific responses.
7. IF a configured source has neither a successful fetch nor a valid snapshot, THEN THE Source_Contract_Service SHALL expose that source as unavailable when at least one fetch attempt has failed and as unknown when no fetch attempt has occurred.

### Requirement 4: Provider-neutral CSDI route result contract

**User Story:** As a route Consumer, I want a stable provider-neutral route result, so that route presentation and safety checks do not depend on CSDI response field names.

#### Acceptance Criteria

1. WHEN a Provider_Adapter returns a CSDI pedestrian route that passes validation, THE Source_Contract_Service SHALL publish a CSDI_Route_Result containing origin, destination, Geometry, steps, distance, duration, provider identity, and Provenance_Envelope.
2. WHEN a Provider_Adapter supplies a provider request identifier, provider response or network version, route status, or Validation_Metadata, or validation generates Validation_Metadata, THE Source_Contract_Service SHALL include each supplied or generated value in the corresponding CSDI_Route_Result field.
3. WHEN a validated CSDI pedestrian route contains level, elevation, indoor/outdoor, stair, lift, ramp, footbridge, or other vertical-transition information, THE Source_Contract_Service SHALL preserve each supplied value in the CSDI_Route_Result without converting an absent value into an accessibility claim.
4. THE Source_Contract_Service SHALL assign exactly one of `route_returned`, `route_rejected`, `route_unavailable`, or `route_unknown` as the CSDI_Route_Result contract state, where `route_returned` means a validated route is published, `route_rejected` means a response fails route validation, `route_unavailable` means the provider or required dependency does not return a route, and `route_unknown` means the available information does not establish any of the other three states.
5. WHEN a validated CSDI pedestrian route is published, THE Source_Contract_Service SHALL identify the result as a CSDI pedestrian route and SHALL represent its accessibility-check outcome separately from the route contract state.
6. IF a CSDI response omits or fails validation for any required route-result field—origin, destination, Geometry, steps, distance, duration, provider identity, or Provenance_Envelope—THEN THE Source_Contract_Service SHALL publish a CSDI_Route_Result with contract state `route_rejected`, include Validation_Metadata identifying the validation failure, and omit the invalid Geometry from the result.
7. IF an accessibility-relevant route attribute is absent, THEN THE Source_Contract_Service SHALL expose that attribute as `unknown` and SHALL not report an accessibility check for that attribute as passed.

### Requirement 5: Validation, geometry, and error metadata

**User Story:** As a Provider_Adapter owner, I want deterministic contract validation and structured errors, so that malformed official data cannot become trusted application data.

#### Acceptance Criteria

1. WHEN a Provider_Adapter submits a Source_Record or CSDI_Route_Result, THE Source_Contract_Service SHALL apply all contract-defined checks for required fields, field types, enumerated values, time relationships, and Provenance_Envelope completeness before publication, SHALL prevent any value or record that fails an applicable check from being published, and SHALL return Validation_Metadata for each failed check.
2. WHERE a submitted Source_Record or CSDI_Route_Result contains Geometry, THE Source_Contract_Service SHALL validate the declared coordinate reference information, contract-defined coordinate dimensionality, coordinate ranges for the declared coordinate reference system, contract-defined geometry type, sequence structure, and all spatial-validity constraints before publication.
3. IF a Geometry check fails, THEN THE Source_Contract_Service SHALL prevent the affected geometry from being published and SHALL return Validation_Metadata containing a stable error code, the failing field or path, detail describing the failed validation rule, and the provider response identifier when that identifier is available; repeated validation of the same failure under the same contract version SHALL produce the same error code.
4. IF a time value is malformed or violates a contract-defined time relationship, THEN THE Source_Contract_Service SHALL reject the affected time field or containing record according to the contract’s rejection rule before publication and SHALL return Validation_Metadata identifying the invalid time field or path and the failed time rule.
5. THE Source_Contract_Service SHALL classify each validation finding or result as exactly one of error, warning, unknown value, or unavailable result in Validation_Metadata, using the classification rules defined by the applicable contract.
6. IF a validation or publication error occurs and a correlation identifier or request identifier is available, THEN THE Source_Contract_Service SHALL include each available identifier unchanged in the error’s Validation_Metadata.
7. IF the Source_Contract_Service cannot determine whether a value is valid, THEN THE Source_Contract_Service SHALL apply the applicable field contract rule for preserving the value as unknown or rejecting the affected record, SHALL not classify the value as valid, and SHALL record the resulting decision in Validation_Metadata.

### Requirement 6: Safe failure outcomes

**User Story:** As a person relying on PathGuard during a changing emergency, I want provider failures to produce honest limitations, so that the system does not present invented guidance as official information.

#### Acceptance Criteria

1. IF a provider fetch fails, THEN THE Source_Contract_Service SHALL return a Safe_Failure that identifies the affected source, identifies the failure category, includes a non-null observed time representing when the failure was detected, includes the applicable error metadata, and includes available last-known provenance or explicitly indicates that no last-known provenance is available.
2. IF a provider response is malformed, incomplete, or geometrically invalid, THEN THE Source_Contract_Service SHALL reject that response, return a Safe_Failure containing the applicable Validation_Metadata, and SHALL not publish the rejected response as current data or replace an existing valid current result with it.
3. IF a provider validly indicates that no route exists, THEN THE Source_Contract_Service SHALL return a route-unavailable outcome with an explanation of that result and SHALL not fabricate route geometry, distance, duration, steps, or a straight-line substitute. IF the Source_Contract_Service cannot determine whether a route exists because no valid route result is available, THEN THE Source_Contract_Service SHALL return a route-unknown outcome with an explanation of that limitation and SHALL not fabricate route geometry, distance, duration, steps, or a straight-line substitute.
4. IF an official provider validly indicates that no warning or status applies, THEN THE Source_Contract_Service SHALL return an unavailable outcome with source health information and SHALL not fabricate warning content, status, issue time, or freshness. IF the Source_Contract_Service cannot determine the official warning or status because no valid result is available, THEN THE Source_Contract_Service SHALL return an unknown outcome with source health information and SHALL not fabricate warning content, status, issue time, or freshness.
5. IF the Source_Contract_Service cannot establish freshness from provider data or validation metadata, THEN THE Source_Contract_Service SHALL return `unknown` freshness and SHALL not infer freshness from request completion time alone.
6. THE Source_Contract_Service SHALL mark every Safe_Failure as a non-success outcome and SHALL provide Consumers with an observable distinction between Safe_Failure outcomes and successful Source_Records so that a Consumer cannot interpret a Safe_Failure as official data.

### Requirement 7: Idempotent publication and record identity

**User Story:** As a Provider_Adapter owner, I want repeated source deliveries to be safe, so that retries and scheduled fetches do not create conflicting duplicate records.

#### Acceptance Criteria

1. WHEN a Provider_Adapter submits a Source_Record with the same source, source record identifier, source version, and Publication_Key as an existing published Source_Record, THE Source_Contract_Service SHALL maintain exactly one logical published record for that identity.
2. WHEN a Provider_Adapter retries a publication request with the same source, source record identifier, source version, Publication_Key, and payload as a previous request, THE Source_Contract_Service SHALL return the previous publication outcome and SHALL NOT create or modify a second logical record.
3. IF a Provider_Adapter submits a payload that differs from the payload associated with an existing Publication_Key, THEN THE Source_Contract_Service SHALL reject the publication, SHALL leave the existing publication unchanged, and SHALL return conflict metadata identifying the source and Publication_Key.
4. IF a Provider_Adapter supplies a raw-response hash or equivalent payload identity metadata, THEN THE Source_Contract_Service SHALL preserve the supplied metadata with the published record.
5. WHEN a Provider_Adapter submits a new source version or source record identifier that represents a distinct valid source state, THE Source_Contract_Service SHALL publish a distinct versioned record, SHALL leave the prior record unchanged, and SHALL retain the prior record's provenance.
6. IF a publication fails validation, THEN THE Source_Contract_Service SHALL create or modify no trusted publication or version and SHALL return an outcome identifying every validation failure detected.

### Requirement 8: Provider adapter handoff and backend boundary

**User Story:** As an adapter implementer, I want a clear server-side handoff contract, so that CSDI, HKO, and Marine Department integrations can be implemented independently while Consumers receive one normalized interface.

#### Acceptance Criteria

1. THE Source_Contract_Service SHALL define a Provider_Adapter handoff that contains fetch metadata, the validated provider payload, the normalization result, a Provenance_Envelope, a validation outcome, and a publication outcome.
2. WHEN a CSDI, HKO, or Marine Department Provider_Adapter submits a handoff, THE Source_Contract_Service SHALL accept it using the defined handoff contract and SHALL expose the resulting Consumer interface without requiring Consumers to read or validate provider-specific payload schemas.
3. THE Source_Contract_Service SHALL expose each successful handoff as normalized records and SHALL expose each unsuccessful handoff as a Safe_Failure through backend interfaces intended for Consumers.
4. THE Backend_Provider_Boundary SHALL route every external CSDI, HKO, and Marine Department request through the corresponding server-side Provider_Adapter and SHALL not route those requests through a browser client.
5. WHEN a browser client requests official-source data, THE backend SHALL return either a normalized contract result or a Safe_Failure, and the browser client SHALL not be required to call an external provider directly to obtain that result.
6. THE Source_Contract_Service SHALL preserve, in every Consumer handoff, the provider attribution, terms reference, source name, and source record identifier supplied by the corresponding Provider_Adapter.
7. THE Source_Contract_Service SHALL leave provider-specific authentication, request construction, rate-limit handling, retry handling, and endpoint selection to the corresponding Provider_Adapter and SHALL not require Consumers to perform any of those provider-specific operations.

### Requirement 9: Source-type separation and safe consumer classification

**User Story:** As a shelter and map Consumer, I want source types to remain explicit, so that a reference location cannot be mistaken for a recommended human shelter.

#### Acceptance Criteria

1. WHEN the Source_Contract_Service normalizes a Marine Department typhoon-shelter record, THE Source_Contract_Service SHALL assign the normalized type `Typhoon_Shelter_Reference`.
2. THE Source_Contract_Service SHALL represent `Typhoon_Shelter_Reference` and `Human_Shelter` as distinct normalized types and distinct Consumer-facing classifications.
3. WHEN a Consumer requests destination candidates matching `Human_Shelter`, THE Source_Contract_Service SHALL exclude every record whose normalized type is `Typhoon_Shelter_Reference` from the returned candidate set.
4. IF an authoritative source does not provide a value for capacity, accessibility, opening status, or facility availability, THEN THE Source_Contract_Service SHALL expose that attribute as `unknown`.
5. IF an authoritative source does not provide evidence for a safety-relevant attribute, THEN THE Source_Contract_Service SHALL expose that attribute as `unknown` and SHALL not classify the record as verified for that attribute.

### Requirement 10: Contract observability and consumer compatibility

**User Story:** As a feature integrator, I want contract outcomes to be inspectable and stable, so that downstream features can explain source limitations and detect contract changes.

#### Acceptance Criteria

1. THE Source_Contract_Service SHALL expose the contract status, source identity, Provenance_Envelope, Freshness_State, Validation_Metadata, and Safe_Failure fields in every Consumer-facing result, with each field represented by its defined value or an explicit unknown or unavailable state when no value exists.
2. WHEN a Consumer receives a normalized result, THE Source_Contract_Service SHALL provide metadata identifying the source name, source mode, each available source time, Freshness_State, and any source limitation, and SHALL represent unavailable metadata as unknown or unavailable rather than as a successful value.
3. WHEN a Consumer receives a rejected, unavailable, or unknown result, THE Source_Contract_Service SHALL provide a machine-readable outcome code that distinguishes the applicable outcome and a human-readable explanation that identifies the outcome and its limitation or failure reason.
4. THE Source_Contract_Service SHALL expose a shared contract version separately from every provider-specific payload version, and a change to one version SHALL NOT by itself require a change to the other version.
5. IF a shared contract change makes an existing normalized field unavailable or changes the meaning of an existing normalized field, THEN THE Source_Contract_Service SHALL include the resulting shared contract version in the result metadata before the Consumer processes the result.
6. WHEN a result containing an unknown or unavailable state is handed to a Consumer, THE Source_Contract_Service SHALL preserve that state through the handoff and SHALL NOT represent it as a successful null, false, or zero value.

## Scope Boundary

This feature includes shared backend schemas, validation rules, source registry and health records, mode and freshness semantics, CSDI route result normalization boundaries, safe-failure outcomes, publication identity, and Consumer handoff contracts.

This feature excludes CSDI, HKO, and Marine Department adapter implementation; provider authentication and endpoint configuration; human-shelter catalogue creation; route matching and ranking; hazard computation; frontend pages; browser storage; push notifications; and operator authorization workflows.

## Safety Invariants

- PathGuard SHALL show what is known, stale, unavailable, and unknown rather than hiding uncertainty behind a confident route or status label.
- A CSDI pedestrian route result SHALL remain distinct from an accessibility-check result.
- A failed or invalid provider response SHALL not become fabricated route, warning, status, timestamp, or freshness data.
- Human_Shelter and Typhoon_Shelter_Reference records SHALL remain separate classifications.
- Browser clients SHALL use the backend contract boundary and SHALL not call official providers directly.
