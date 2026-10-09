# PathGuard

Local PostGIS, a FastAPI API, and a Vite frontend. Ordinary runs stay on fixtures. Live CSDI, HKO, and Marine Department calls stay off unless the matching `PATHGUARD_*_MODE` variable is set to `live`.

## Database

From `backend`:

```powershell
docker compose up -d postgres
copy .env.example .env
alembic upgrade head
```

The database is `postgis/postgis:16-3.4`, user `pathguard`, database `pathguard`, port 5432. `GET /api/v1/health` is ready only when PostGIS answers.

## API

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -e ".[test]"
uvicorn app.main:app --reload
```

The sample password in `.env.example` is for this local database only.

## Frontend

```powershell
cd frontend
npm install
npm run dev
```

`npm run build` writes a static site to `frontend/dist`. The API stays a separate process with `DATABASE_URL` pointed at PostGIS.

## Checks

GitHub Actions runs the frontend tests and production build, then the backend tests against PostGIS. The same commands are `npm test`, `npm run build`, `alembic upgrade head`, and `python -m pytest` from the directories above.
