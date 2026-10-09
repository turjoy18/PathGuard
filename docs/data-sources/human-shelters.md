# Human shelters

PathGuard issue #14 catalogue for the Central Hong Kong pilot. This is the **PathGuard verified prototype/demo catalogue**. It is mock/demo data, not an official Hong Kong shelter dataset, and it is not citywide Hong Kong coverage.

The shared official-source contracts from issue #10 supply `ProvenanceEnvelope`, `OperatingMode`, `FreshnessState`, `RecordType`, and geometry validation. This catalogue does not add a `source_registry` key. CSDI, HKO, and Marine Department remain the only official registry entries. Shelter-specific `last_verified_at` sits beside the shared envelope until a shared field exists.

## Authority and coverage

| Item | Value |
|---|---|
| Fixture name | `central-hong-kong-human-shelters` |
| Fixture version | `2026-10-09.1` |
| Schema | `human-shelter-catalogue.v1` |
| Owner | PathGuard |
| Authority on each record | PathGuard prototype catalogue |
| Label | `PathGuard verified prototype/demo catalogue` |
| Pilot area | Central Hong Kong |
| Source path | `backend/app/human_shelters/fixtures/prototype-v1.json` |
| Attribution | PathGuard prototype/demo data. Not an official Hong Kong shelter catalogue. |
| Data classification | `mock_demo` |
| Official citywide | false |
| Data mode | `snapshot` |
| Publication date | 2026-10-09 |
| Accepted import modes | `snapshot`, `replay` |
| Rejected import mode | `live` and `offline` |

## What Central Hong Kong means here

Import validation uses this inclusive bounding box. It is a prototype interpretation of Central Hong Kong for the pilot, not an official district polygon.

| Edge | Value |
|---|---|
| West | 114.1450 |
| East | 114.1750 |
| South | 22.2750 |
| North | 22.2900 |

Coordinates are stored as EPSG:4326 longitude/latitude. Source `EPSG:4326` and `EPSG:2326` points are accepted. `EPSG:2326` is transformed to EPSG:4326 before the boundary check. Any other CRS, a non-point, or a point outside the box is rejected.

## Verification and limitations

Verification method: manual review of prototype coordinates against the bounding box above. Facility, status, and capacity values are fixture evidence. They are not a live accessibility survey and they are not inferred from straight-line distance.

Limitations:

- Mock/demo catalogue for the Central Hong Kong pilot only.
- Not official citywide Hong Kong shelter coverage.
- The official Marine Department typhoon-shelter dataset is a separate `typhoon_shelter_reference` layer. It is not an authoritative source for human-shelter values, and a shared name or coordinate does not copy a typhoon reference into this catalogue.
- Missing facility, status, or capacity information is stored as `unknown`. `unknown` is not `yes`, `open`, or `available`.
- `no` is kept as explicit evidence.

## Provenance

Each record uses the shared envelope plus a shelter verification time.

Required on every prototype record: `source_name`, `source_record_id`, `source_version`, and mode metadata for `snapshot` or `replay`.

Preserved when supplied: `fetched_at`, `issued_at`, `valid_until`, `last_verified_at`, `source_provided_freshness`.

`last_verified_at` is required when operating status is `open` or `closed`. It may be absent when status is `unknown`, which is how a record can have unknown freshness.

Timestamps are timezone-aware UTC. A missing required provenance field is rejected by field name.

## Freshness policy

Evaluation time is UTC.

When the current publication is available:

1. A `valid_until` earlier than the evaluation time is `stale`, even if other timestamps are recent.
2. Otherwise, if none of `fetched_at`, `issued_at`, and `last_verified_at` is usable, freshness is `unknown`. A usable timestamp is timezone-aware UTC and not later than the evaluation time.
3. Otherwise the newest usable timestamp is selected. Age greater than 30 days is `stale`. Age of 30 days or less is `fresh`.

`source_provided_freshness` is preserved and does not override this policy. The official-source `DeterministicFreshnessPolicy` is unchanged and is not the catalogue rule, because that policy uses one time basis and does not include `last_verified_at`.

Facility evidence age uses only that facility's `verified_at` and the same 30-day window. It does not replace `last_verified_at`.

When the current publication is unavailable, PathGuard keeps the last stored records and timestamps, reports catalogue `source_state` `unavailable`, and does not mark that publication current. Record freshness is the last evaluation; it is not recomputed into a new current claim.

## Record shape

- Stable identifier, 1–128 characters, unique inside a fixture version.
- `record_type` fixed as `human_shelter`. Any other type, including `typhoon_shelter_reference`, is an import discriminator error and is not stored.
- Name, address, authority, pilot area, point geometry, and operating status `open`, `closed`, or `unknown`.
- Capacity `available`, `unavailable`, or `unknown` only with a capacity source when the state is `available` or `unavailable`. A missing capacity state is stored as `unknown`.
- Facility keys: `step_free_entry`, `lift`, `ramp`, `accessible_toilet`, `stairs_only_entry`.
- Facility state is exactly `yes`, `no`, or `unknown`. `yes` and `no` require an evidence source, verification time, and note. A missing key is stored as `unknown` with no verification claim.

Import validates the whole fixture version first. Any record or fixture error persists nothing and leaves the previous publication unchanged.

Reads are `GET /api/v1/shelters/human` and `GET /api/v1/shelters/human/{stable_id}` only. They do not rank shelters, choose a destination, request a route, or call CSDI, HKO, Marine Department, or map providers.
