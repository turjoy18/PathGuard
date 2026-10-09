# Migration baseline

This directory is the migration boundary for the shared PathGuard database. The initial revision is intentionally empty: feature owners add their tables in focused revisions and must preserve provenance, explicit unknown values, and human/typhoon-shelter type separation.

Run the baseline with:

```powershell
alembic upgrade head
```

The configured URL is read from `DATABASE_URL` by `migrations/env.py`; do not commit credentials or use development credentials in deployed environments.
