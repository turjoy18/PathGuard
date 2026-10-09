# Requirements Document

## Introduction

PathGuard issue #14 establishes the catalogue foundation for verified human shelters in the Central Hong Kong pilot area. The feature provides an explicitly labelled prototype/demo catalogue backed by documented fixture data, structured provenance, PostGIS persistence, validated imports, tri-state facility evidence, freshness and verification metadata, and read access for later PathGuard features.

The catalogue is not official citywide coverage. The official Marine Department typhoon-shelter dataset remains a separate `typhoon_shelter_reference` layer and is not a source of human evacuation shelters. This feature does not implement candidate ranking or selection, pedestrian route requests, external provider ingestion, frontend/UI, or hazard trust/moderation.

## Glossary

- **Human_Shelter_Catalogue**: The PathGuard catalogue foundation containing prototype/demo records for human evacuation shelters in the Central Hong Kong pilot area.
- **Human_Shelter_Record**: A catalogue record representing a human shelter, with identity, location, status, facility evidence, and provenance.
- **Typhoon_Shelter_Reference**: A separate reference record derived from the official Marine Department typhoon-shelter dataset; the record is not a human evacuation shelter.
- **Catalogue_Service**: The backend service boundary that validates imports, persists human-shelter records, calculates catalogue freshness, and provides read access.
- **Catalogue_Import**: A versioned fixture import containing human-shelter records and their facility evidence.
- **Prototype_Fixture**: Mock/demo data explicitly labelled as a PathGuard prototype catalogue and limited to the Central Hong Kong pilot area.
- **Source_Registry**: Provenance metadata identifying the fixture owner, source URL or fixture path, terms/attribution, source version, publication metadata, and data mode.
- **Facility_Evidence**: Evidence for one named shelter facility or accessibility feature, represented by exactly one of `yes`, `no`, or `unknown`, with verification metadata.
- **Freshness_State**: A source or record state represented by `fresh`, `stale`, `unavailable`, or `unknown` according to the documented freshness policy.
- **Verification_Record**: A timestamped record of when a shelter or facility attribute was last checked, including the verification source or note.
- **Catalogue_API**: The versioned backend read endpoint under `/api/v1/shelters/human`.
- **Pilot_Area**: The documented Central Hong Kong geographic boundary selected for this prototype.
- **Data_Mode**: The PathGuard data state `live`, `snapshot`, `replay`, or `offline`.
- **Persistence_Layer**: The PostgreSQL and PostGIS storage boundary for human-shelter records, facility evidence, and provenance metadata.
- **PostgreSQL**: The relational database used by the PathGuard backend.
- **PostGIS**: The PostgreSQL extension used to validate and query spatial shelter geometry.
- **SRID**: A spatial reference identifier stored with PostGIS geometry.
- **Alembic**: The migration tool used by the PathGuard backend to apply versioned database schema changes.
- **Test_Suite**: The automated unit, integration, contract, and API tests that verify this feature's acceptance criteria.
- **Coordinate_Reference_System**: The coordinate convention used to interpret and transform spatial geometry.
- **External_Provider**: A network service outside the Catalogue_Service, including CSDI, HKO, Marine Department, or map-tile services.
- **Facility_Key**: A supported facility identifier such as `step_free_entry` or `lift`.

## Requirements

### Requirement 1: Explicit prototype scope and labeling

**User Story:** As a PathGuard user, I want the shelter catalogue scope and status to be honest, so that I do not mistake demo data for official citywide coverage.

#### Acceptance Criteria

1. THE Prototype_Fixture metadata SHALL identify `Central Hong Kong` as the Pilot_Area for every fixture version.
2. THE Prototype_Fixture metadata SHALL contain the exact label `PathGuard verified prototype/demo catalogue` for every fixture version.
3. THE Human_Shelter_Catalogue metadata SHALL identify coverage as the documented Central Hong Kong pilot area and SHALL not describe coverage as citywide Hong Kong coverage.
4. THE Source_Registry SHALL identify every Prototype_Fixture as mock/demo data and as non-official citywide shelter data.
5. WHEN a Catalogue_Import contains a record outside the documented Pilot_Area boundary, THE Catalogue_Service SHALL reject that record with a record-specific validation error identifying the boundary violation.

### Requirement 2: Source, fixture, and provenance documentation

**User Story:** As a developer or reviewer, I want every fixture version and record to be traceable, so that prototype limitations and source assumptions remain visible.

#### Acceptance Criteria

1. THE Source_Registry SHALL document, for each Prototype_Fixture version, the fixture name, version, owner, source URL or repository path, attribution or terms note, Pilot_Area, Data_Mode, and publication date.
2. THE Source_Registry SHALL document the Pilot_Area boundary used by import validation and the interpretation of Central Hong Kong for the prototype.
3. THE Catalogue_Import SHALL assign each imported Human_Shelter_Record a stable `source_record_id` within the documented Prototype_Fixture version.
4. THE Human_Shelter_Catalogue SHALL preserve `source_name`, `source_record_id`, `source_version`, `fetched_at`, `issued_at` when supplied, `valid_until` when supplied, `last_verified_at`, `freshness_state`, and Data_Mode for each imported record.
5. IF a provenance field required by the Prototype_Fixture schema is absent, THEN THE Catalogue_Service SHALL reject the affected record and report the missing field by name.
6. THE Source_Registry SHALL document the Prototype_Fixture contract in `docs/data-sources/human-shelters.md`.
7. THE Source_Registry SHALL document that the official Marine Department Typhoon_Shelter_Reference is a separate reference layer and is not an authoritative source for Human_Shelter_Record values.

### Requirement 3: Human-shelter schema

**User Story:** As a catalogue maintainer, I want a precise and stable human-shelter schema, so that later PathGuard features can consume records without guessing field meaning.

#### Acceptance Criteria

1. THE Human_Shelter_Record SHALL contain a stable identifier of 1 through 128 characters, fixed record type `human_shelter`, name, address, authority or catalogue owner, Pilot_Area, point geometry, and operating status.
2. THE Human_Shelter_Record SHALL contain a source reference and a last verification timestamp for the record-level status.
3. THE Human_Shelter_Record SHALL represent operating status using exactly one of `open`, `closed`, or `unknown`.
4. THE Human_Shelter_Record SHALL represent capacity state using exactly one of `available`, `unavailable`, or `unknown` only when a capacity source is documented.
5. WHEN required identity, authority, area, or location information is missing, THE Catalogue_Service SHALL reject the record with a required-field validation error.
6. WHEN status, capacity, or facility information is missing, THE Catalogue_Service SHALL store the missing value as `unknown` and SHALL not convert the missing value into a positive state.
7. THE Catalogue_Service SHALL preserve the source Coordinate_Reference_System, transform geometry to the documented catalogue Coordinate_Reference_System when normalization is required, and store the normalized point with the documented SRID.
8. IF imported geometry is missing, malformed, non-point, outside the supported Coordinate_Reference_System set, or invalid after normalization, THEN THE Catalogue_Service SHALL reject the record with a field-specific geometry or CRS validation error.

### Requirement 4: Structural separation from typhoon-shelter references

**User Story:** As a safety reviewer, I want human shelters and typhoon-shelter references separated at every boundary, so that a reference location cannot be treated as a human evacuation shelter by data-shape confusion.

#### Acceptance Criteria

1. THE Persistence_Layer SHALL store Human_Shelter_Record values in a human-shelter relation separate from the Typhoon_Shelter_Reference relation.
2. WHEN a Catalogue_Import record has a type other than the fixed type `human_shelter`, THE Catalogue_Service SHALL reject the record with an import discriminator error.
3. THE Catalogue_Service SHALL read Human_Shelter_Record values only from the human-shelter relation and SHALL not merge Typhoon_Shelter_Reference values into the result.
4. THE Catalogue_API SHALL expose human-shelter records through the `/api/v1/shelters/human` resource separately from any typhoon-shelter reference resource.
5. IF a caller supplies a Typhoon_Shelter_Reference identifier to the human-shelter detail boundary, THEN THE Catalogue_API SHALL return HTTP 404 and SHALL not return the reference as a Human_Shelter_Record.
6. THE Catalogue_Service SHALL not add a Typhoon_Shelter_Reference to the Human_Shelter_Catalogue based only on a shared location, name, or geometry.

### Requirement 5: PostGIS persistence and migration

**User Story:** As a backend developer, I want catalogue records persisted with spatial integrity and relational separation, so that later PathGuard services can query pilot-area shelter locations reliably.

#### Acceptance Criteria

1. THE Persistence_Layer SHALL provide an Alembic migration that creates the human-shelter relation, facility-evidence relation, provenance structures, and required indexes in PostgreSQL with PostGIS enabled.
2. THE Persistence_Layer SHALL store every Human_Shelter_Record point with an explicit SRID and SHALL reject invalid or missing point geometry during persistence.
3. THE Persistence_Layer SHALL persist Facility_Evidence in a separate facility structure with a foreign-key relationship to the Human_Shelter_Record.
4. THE Persistence_Layer SHALL enforce uniqueness for the Human_Shelter_Record stable identifier within the catalogue version or source namespace.
5. THE Persistence_Layer SHALL provide an index for stable-identifier lookup and a spatial index for human-shelter point geometry.
6. THE Persistence_Layer SHALL persist source, publication, validity, and verification timestamps as timezone-aware values.
7. WHEN the human-shelter migration is applied to an empty baseline database, THE Persistence_Layer SHALL create the required human-shelter and facility structures without creating a combined destination table containing Human_Shelter_Record and Typhoon_Shelter_Reference values.

### Requirement 6: Facility evidence and no inference

**User Story:** As a person selecting a shelter for accessibility needs, I want facility evidence to distinguish confirmed support from confirmed absence and unknown information, so that missing data is not presented as accessible.

#### Acceptance Criteria

1. THE Facility_Evidence SHALL represent exactly one state, `yes`, `no`, or `unknown`, for each supported Facility_Key.
2. THE Human_Shelter_Catalogue SHALL support at least `step_free_entry`, `lift`, `ramp`, `accessible_toilet`, and `stairs_only_entry` as distinct Facility_Key values.
3. WHEN Facility_Evidence has state `yes` or `no`, THE Facility_Evidence SHALL include an evidence source, verification timestamp, and verification note.
4. WHEN a facility value is absent from a Catalogue_Import, THE Catalogue_Service SHALL store that Facility_Evidence state as `unknown`.
5. WHEN a facility value is `unknown`, THE Catalogue_API SHALL return `unknown` and SHALL not describe the facility as verified or available.
6. THE Catalogue_Service SHALL preserve a `no` facility state as explicit evidence through import, persistence, and read serialization.
7. IF a facility state is not exactly `yes`, `no`, or `unknown`, THEN THE Catalogue_Service SHALL reject the affected input with a field-specific facility-state validation error.
8. THE Catalogue_Service SHALL reject duplicate Facility_Evidence states for the same Human_Shelter_Record and Facility_Key within one catalogue version.

### Requirement 7: Import validation and atomicity

**User Story:** As a catalogue maintainer, I want invalid fixture data rejected before publication, so that the read catalogue contains only structurally valid and traceable records.

#### Acceptance Criteria

1. WHEN a Catalogue_Import is submitted, THE Catalogue_Service SHALL validate the complete fixture version before persistence, including fixture version, required identity fields, record type, geometry, Coordinate_Reference_System, Pilot_Area, enum values, facility states, and provenance.
2. IF a Catalogue_Import contains a duplicate stable identifier within its version or source namespace, THEN THE Catalogue_Service SHALL reject the duplicate and report the conflicting identifier at the record or field level.
3. IF a Catalogue_Import contains malformed geometry, an unsupported Coordinate_Reference_System, an invalid enum, an invalid facility state, or missing provenance, THEN THE Catalogue_Service SHALL reject the affected input with field-level validation errors.
4. IF any record or fixture-level field in a Catalogue_Import fails validation, THEN THE Catalogue_Service SHALL persist none of the records from that import version and SHALL preserve the previously published catalogue version unchanged.
5. WHEN a Catalogue_Import passes complete validation, THE Catalogue_Service SHALL publish the Human_Shelter_Record values and associated Facility_Evidence under the same fixture version as one atomic publication.
6. THE Catalogue_Service SHALL report accurate counts for accepted records, rejected records, and validation errors for each import attempt without exposing database credentials, provider secrets, or raw secrets.

### Requirement 8: Freshness and verification

**User Story:** As a user or reviewer, I want catalogue age and verification state visible, so that stale prototype information is not mistaken for current shelter availability or accessibility.

#### Acceptance Criteria

1. THE Catalogue_Service SHALL evaluate freshness at a documented UTC evaluation time using this prototype policy: a record is `fresh` when the current fixture publication is available, `valid_until` is absent or not past, and the newest usable value among `fetched_at`, `issued_at`, and `last_verified_at` is no more than 30 days old; a record is `stale` when the publication is available and `valid_until` is past or the newest usable value is more than 30 days old; a record is `unknown` when the publication is available and none of those timestamps is usable.
2. WHEN a Human_Shelter_Record exceeds the 30-day freshness interval or has a past `valid_until`, THE Catalogue_Service SHALL mark the record `stale` before returning it through the Catalogue_API.
3. WHEN a Human_Shelter_Record has no usable source or verification timestamp while the current fixture publication is available, THE Catalogue_Service SHALL mark the record `unknown` rather than `fresh`.
4. WHEN the current Prototype_Fixture publication is unavailable, THE Catalogue_Service SHALL retain the last-known records and timestamps, report current source state `unavailable`, and SHALL not claim that the retained publication is current.
5. THE Catalogue_API SHALL return `source_name`, `source_version`, `source_record_id`, `fetched_at`, `issued_at` when supplied, `valid_until` when supplied, `last_verified_at`, Data_Mode, and `freshness_state` for each returned record.
6. THE Catalogue_Service SHALL preserve facility-level verification timestamps independently from record-level verification timestamps and SHALL evaluate each facility's evidence age without replacing the record-level timestamp.
7. THE Source_Registry SHALL document the 30-day threshold, `valid_until` precedence, timestamp selection, UTC evaluation time, and unavailable-publication behavior in `docs/data-sources/human-shelters.md`.

### Requirement 9: Read access without recommendation logic

**User Story:** As a PathGuard backend consumer, I want read access to the verified prototype catalogue, so that later features can inspect source-labelled shelter records without coupling catalogue storage to routing or ranking.

#### Acceptance Criteria

1. WHEN a caller requests `GET /api/v1/shelters/human`, THE Catalogue_API SHALL return only Human_Shelter_Record values within the documented Pilot_Area and their Facility_Evidence.
2. WHEN a caller requests `GET /api/v1/shelters/human/{stable_id}`, THE Catalogue_API SHALL return only the matching Human_Shelter_Record identity, location, status, facility evidence, provenance, and freshness metadata.
3. THE Catalogue_API SHALL return explicit `unknown` values, freshness metadata, Data_Mode, and provenance fields in serialized responses rather than omitting safety-relevant states.
4. THE Catalogue_API SHALL return collection records in deterministic ascending stable-identifier order, and that order SHALL not represent candidate ranking or selection.
5. THE Catalogue_Service SHALL provide only catalogue collection and detail reads for this feature and SHALL not request a pedestrian route, calculate a shelter score, rank candidates, or select a destination.
6. THE Catalogue_API SHALL expose the collection and detail responses under `/api/v1` using one documented versioned response schema in `docs/api/human-shelters-v1.md`.
7. THE Catalogue_API SHALL return HTTP 404 for a missing human-shelter stable identifier and for a Typhoon_Shelter_Reference identifier supplied to the human-shelter detail path.

### Requirement 10: Strict issue boundaries

**User Story:** As the issue owner, I want this foundation feature limited to catalogue responsibilities, so that safety-critical provider, route, recommendation, and interface work remains reviewable in separate issues.

#### Acceptance Criteria

1. WHEN the Catalogue_Service imports a Prototype_Fixture, THE Catalogue_Service SHALL read only the documented fixture input and SHALL make no calls to CSDI, HKO, Marine Department, map-tile, or other External_Provider endpoints.
2. THE Human_Shelter_Catalogue SHALL provide no candidate ranking, candidate selection, recommendation, or destination-choice behavior.
3. THE Human_Shelter_Catalogue SHALL provide no pedestrian route request, route storage, route evaluation, or route accessibility behavior.
4. THE Human_Shelter_Catalogue SHALL provide no frontend, PWA, map, or other user-interface behavior.
5. THE Human_Shelter_Catalogue SHALL provide no hazard ingestion, hazard trust, review, moderation, route-overlay, or changed-condition behavior.
6. THE Catalogue_Service SHALL preserve Data_Mode metadata for imported records and SHALL accept only `snapshot` or `replay` for Prototype_Fixture data; `live` SHALL be rejected for Prototype_Fixture imports.

### Requirement 11: Fixtures and automated tests

**User Story:** As a maintainer, I want representative fixtures and automated tests, so that catalogue separation, provenance, validation, freshness, and unknown-state behavior remain protected during later feature work.

#### Acceptance Criteria

1. THE Prototype_Fixture SHALL contain at least 3 and no more than 100 Central Hong Kong Human_Shelter_Record values with stable identifiers and documented per-version provenance.
2. THE Prototype_Fixture SHALL include Facility_Evidence examples with `yes`, `no`, and `unknown` states across `step_free_entry`, `lift`, `ramp`, `accessible_toilet`, and `stairs_only_entry`.
3. THE Prototype_Fixture SHALL include at least one record with a stale freshness condition and at least one record with an unknown freshness condition.
4. THE Test_Suite SHALL verify that a Typhoon_Shelter_Reference cannot be imported, persisted, or returned through the human-shelter boundary, including a negative HTTP 404 detail-read test.
5. THE Test_Suite SHALL verify valid import persistence, invalid required-field and enum rejection, duplicate-identifier rejection, whole-import atomicity with preservation of the previous catalogue, and PostGIS geometry and CRS validation.
6. THE Test_Suite SHALL verify that missing facility values remain `unknown`, explicit `no` values remain `no`, and invalid facility states are rejected through import, persistence, and API serialization.
7. THE Test_Suite SHALL verify that source, source-record, version, Data_Mode, verification, freshness, valid-until, and publication metadata remain present in human-shelter read responses according to the documented response schema.
8. THE Test_Suite SHALL verify the 30-day freshness policy, valid-until handling, unknown timestamps, unavailable publication behavior, and independent facility-level verification timestamps.
9. THE Test_Suite SHALL verify that catalogue reads invoke none of the route, ranking, candidate-selection, CSDI, HKO, Marine Department, map-provider, frontend, hazard, or moderation systems.

## Scope Boundaries

This feature includes the documented Central Hong Kong Prototype_Fixture containing 3–100 records, catalogue schema, source and per-version provenance records, PostGIS migration and persistence, import validation, tri-state facility evidence, the documented freshness and verification policy, backend collection/detail read access, and representative fixtures/tests.

This feature excludes:

- Candidate ranking, candidate selection, recommendation, or shelter route matching logic.
- CSDI route requests, route storage, route accessibility checks, and rerouting.
- HKO, CSDI, Marine Department, map-tile, or other External_Provider ingestion.
- Frontend, PWA, map, or other user-interface work.
- Hazard reporting, hazard trust policy, review, moderation, or route overlays.
- Treating Marine Department typhoon-shelter reference records as human evacuation shelters.
- Any Prototype_Fixture import with Data_Mode `live`.

## Traceability to PathGuard Plan

- The separate human-shelter catalogue follows the plan's `human_shelters` model and the rule that `unknown` is not `yes`.
- Provenance and freshness fields follow the plan's source-record contract: mode, source name, source record ID, fetched time, issued time where applicable, validity where applicable, source version, verification time, and freshness state.
- The Prototype_Fixture is visibly distinct from live official data, uses only `snapshot` or `replay` Data_Mode, and does not claim citywide coverage.
- The Marine Department typhoon-shelter layer remains a separate reference layer and cannot enter the human-shelter catalogue.
- The issue stops before candidate selection, deterministic matching, route planning, external provider calls, hazard effects, or UI implementation, as required by issue #14 boundaries.
