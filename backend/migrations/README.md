# Migration baseline

This directory is the migration boundary for the shared PathGuard database. The initial revision is intentionally empty: feature owners add their tables in focused revisions and must preserve provenance, explicit unknown values, and human/typhoon-shelter type separation.

Run the baseline with:

```powershell
alembic upgrade head
```

The configured URL is read from `DATABASE_URL` by `migrations/env.py`; do not commit credentials or use development credentials in deployed environments.

`0002_official_source_contracts` adds the official-source registry, health, publication, and receipt tables. It seeds CSDI, HKO, and Marine Department without overwriting later operator changes, and its downgrade removes only those tables.

`0003_human_shelter_catalogue` adds human-shelter publications, shelter points, and facility evidence. It does not create a typhoon-shelter table or a combined destination table. Downgrade removes only those catalogue tables.
