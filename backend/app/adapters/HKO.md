# Hong Kong Observatory adapter

Server-side only. Browsers call `GET /api/v1/official-status`.

## Products

- Current warning summary: `https://data.weather.gov.hk/weatherAPI/opendata/weather.php?dataType=warnsum&lang=en`
- Warning information: same host with `dataType=warningInfo`
- Languages: `en`, `tc`, `sc`
- No API key. Terms: https://www.hko.gov.hk/en/abouthko/disclaimer.htm
- Attribution: © Hong Kong Observatory, Hong Kong SAR Government.
- Update interval used here: fresh for 10 minutes after the official issue or update time, then stale. Missing times stay unknown.
- Polygons are not inferred. Official text is stored separately from PathGuard guidance, which this adapter does not write.

`PATHGUARD_HKO_MODE=fixture` is the default. `sample=none` is an empty official summary. `sample=malformed` fails closed. `live` calls the two products above.
