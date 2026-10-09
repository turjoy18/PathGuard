# Hazard trust lifecycle

Server-side only. Browsers call PathGuard.

- `POST /api/v1/hazards/reports` accepts a community or operator report. The HTTP response is the acknowledgement. A client queue id is not server-accepted until that response, and a repeat id returns the same report.
- `POST /api/v1/hazards/reports/{id}/review` is operator-only (`X-Operator-Token`, default `operator-demo`, and `X-Operator-Actor`).
- Trust states: `pending`, `verified`, `rejected`, `resolved`, `expired`, `reconfirmed`.
- Pending, rejected, resolved, and expired reports have effect `none` and cannot block a route or override an official fact.
- Verified and reconfirmed reports may warn, penalize, or invalidate from severity `low` / `medium` / `high`. Route intersection is issue 19.
- Notes are tag-stripped. Photos allow jpeg or png under 1 MB, keep a hash only, and mark EXIF as removed.
