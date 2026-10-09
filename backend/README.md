# PathGuard backend

This directory contains the shared FastAPI/PostGIS application skeleton. Feature owners register routers and services through `app.registry.FeatureRegistry`; the application bootstrap remains the integration boundary.

## Local setup

1. Copy `.env.example` to `.env` and adjust values only for the local environment.
2. Start PostGIS from this directory:

   ```powershell
   docker compose up -d postgres
   ```

3. Create a virtual environment and install the pinned package plus test extras:

   ```powershell
   py -3.11 -m venv .venv
   .\.venv\Scripts\Activate.ps1
   python -m pip install --upgrade pip
   pip install -e ".[test]"
   ```

4. Apply the baseline migration and run the API:

   ```powershell
   alembic upgrade head
   uvicorn app.main:app --reload
   ```

The health endpoint is `GET http://localhost:8000/api/v1/health`. It returns HTTP 200 only when the application can connect to PostgreSQL and the PostGIS extension responds. Provider availability is intentionally not part of this database readiness check.

Official-source registry, health, and normalized publications are a separate contract under `/api/v1/source-contracts` once `register_source_contracts` is passed to `create_app`. See `app/source_contracts/README.md`. Revision `0002_official_source_contracts` adds that persistence boundary after the empty baseline.

## Feature registration

Register a feature router through the application factory rather than editing feature code into `app.main`:

```python
from fastapi import APIRouter
from app.registry import FeatureRegistry

router = APIRouter()
registry = FeatureRegistry()
registry.register(router, prefix="/example", tags=["example"])
```

The registry is deliberately small. Authentication, provider adapters, planner logic, hazard policy, and operator authorization belong to their own issues.

## Configuration and safety

Configuration is read from environment variables. Development defaults are suitable only for local fixture work. Do not commit credentials, use the sample password in a deployed environment, or expose database errors to clients. The scaffold includes CORS, trusted-host, request-size, correlation-ID, and JSON error boundaries for later feature modules to use.
