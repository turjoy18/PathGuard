# Marine Department typhoon-shelter reference

Server-side only. Browsers call `GET /api/v1/shelters/typhoon-reference`.

These records are vessel refuges. They are not human evacuation shelters, and the adapter does not report capacity, accessibility, opening status, or a recommended destination.

## Source

- Catalogue: https://data.gov.hk/en-data/dataset/hk-md-mardep-typhoon-shelters
- Attribution: © Marine Department, Hong Kong SAR Government.
- Terms page used until a dataset-specific licence URL is configured: https://www.mardep.gov.hk/en/home.html
- No live dataset URL is built into the adapter. Set `PATHGUARD_MARINE_URL` or `MARINE_SHELTER_GEOJSON_URL` before `mode=live`.
- Default mode is `fixture`. `snapshot`, `replay`, and `stale` reuse the same reference rows. `unavailable` returns no shelters.
- Refresh is idempotent: each official id maps to one stable record id.
