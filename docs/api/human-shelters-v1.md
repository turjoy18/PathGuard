# Human shelters API v1

Schema version: `human-shelter-catalogue.v1`.

Register the router with an explicit prefix of `/api/v1/shelters`. The registry does not add that prefix by itself.

- `GET /api/v1/shelters/human`
- `GET /api/v1/shelters/human/{stable_id}`

There is no import, ranking, route, or operator route on this surface. Collection order is ascending `stable_id`. That order is not a recommendation.

A missing stable identifier, including a typhoon-shelter reference identifier, returns HTTP 404:

```json
{
  "error": {
    "code": "human_shelter_not_found",
    "message": "No human shelter exists for this identifier."
  },
  "request_id": "request-id"
}
```

Storage failures return HTTP 503 with `catalogue_unavailable` and no database details.

## Collection

`source_state` is `available` or `unavailable`. `publication_current` is true only while the loaded publication is available. `official_citywide` is false.

```json
{
  "schema_version": "human-shelter-catalogue.v1",
  "label": "PathGuard verified prototype/demo catalogue",
  "pilot_area": "Central Hong Kong",
  "coverage": "Documented Central Hong Kong pilot area only. This is not official citywide Hong Kong coverage.",
  "limitations": "Mock/demo catalogue. Typhoon shelters are not human evacuation shelters.",
  "verification_method": "Manual review against the documented Central Hong Kong bounding box.",
  "official_citywide": false,
  "fixture_name": "central-hong-kong-human-shelters",
  "fixture_version": "2026-10-09.1",
  "owner": "PathGuard",
  "source_url": "backend/app/human_shelters/fixtures/prototype-v1.json",
  "attribution": "PathGuard prototype/demo data. Not an official Hong Kong shelter catalogue.",
  "data_mode": "snapshot",
  "publication_date": "2026-10-09",
  "source_state": "available",
  "publication_current": true,
  "records": []
}
```

`data_mode` is `snapshot` or `replay` when a publication exists, and null when none has been loaded. An empty catalogue uses `source_state` `unavailable` and `publication_current` false.

## Record

Safety-relevant states are returned even when they are `unknown`. They are not omitted.

```json
{
  "stable_id": "pg-proto-central-001",
  "record_type": "human_shelter",
  "name": "Prototype Shelter - Central Community Hall",
  "address": "10 Ice House Street, Central, Hong Kong",
  "authority": "PathGuard prototype catalogue",
  "pilot_area": "Central Hong Kong",
  "location": {
    "longitude": 114.157,
    "latitude": 22.281,
    "srid": 4326,
    "source_crs": "EPSG:4326"
  },
  "entrances": [],
  "operating_status": "open",
  "capacity_state": "unknown",
  "capacity_source": null,
  "facilities": [
    {
      "key": "lift",
      "state": "unknown",
      "evidence_source": null,
      "verified_at": null,
      "note": null,
      "evidence_freshness_state": "unknown"
    }
  ]
}
```

Every record also includes `last_verified_at` (null when the fixture has no usable verification time), `freshness_state`, and `provenance`.

`freshness_state` is `fresh`, `stale`, `unknown`, or the last stored evaluation when the publication is unavailable. Facility `state` is `yes`, `no`, or `unknown`. `evidence_freshness_state` uses the facility's own `verified_at` and does not replace `last_verified_at`.

`operating_status` is `open`, `closed`, or `unknown`. `capacity_state` is `available`, `unavailable`, or `unknown`.

## Provenance object

The provenance object is the shared official-source envelope (`official-source-contracts.v1`):

| Field | Required in this response |
|---|---|
| `contract_version` | yes |
| `mode` | yes, `snapshot` or `replay` |
| `source_name` | yes |
| `source_record_id` | yes |
| `source_version` | yes |
| `fetched_at` | present; null when the fixture did not supply it |
| `issued_at` | present; null when not supplied |
| `valid_until` | present; null when not supplied |
| `freshness_state` | yes, the catalogue evaluation |
| `source_provided_freshness` | present; null when the fixture did not supply a provider claim |
| `mode_metadata` | yes |

Detail responses repeat the catalogue label, pilot area, coverage, limitations, `source_state`, and `publication_current` next to the one record.

The committed fixture `prototype-v1.json` includes a fresh open shelter, a stale closed shelter, an unknown shelter, a shelter that is stale because `valid_until` is past, and facility values `yes`, `no`, and `unknown`. Negative fixtures cover a typhoon-shelter reference, malformed geometry, and `live` mode. Those negative fixtures are rejected and are not returned by this API.
