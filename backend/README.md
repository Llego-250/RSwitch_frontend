# RDIP Backend

FastAPI backend for the RSwitch Data Intelligence Platform (RDIP) v1 — scoped
to four modules: Data Ingestion, Integrations Monitor, Compliance Document
Repository, and Reporting & Issue Tracking. AI/ML detection, automated API
pulls, financial inclusion analytics, and governance are explicitly out of
scope for this service.

## Stack

FastAPI + SQLModel (SQLAlchemy + Pydantic) + PostgreSQL + MinIO (file
storage) + APScheduler (the one automated job: flagging overdue
integrations). No message broker — batch file upload doesn't need one.

## Structure-agnostic ingestion

Per-FSP file schemas live in the `IngestionTemplate` / `TemplateColumn`
tables, edited via the `/templates` API — adding a new participant's format
is a data change, not a deploy. `app/services/ingestion.py` reads `.csv` and
`.xlsx` today; adding a new file format means adding a reader function there,
without touching the validation logic that runs against the template.

## Quickstart

From the repo root: `docker compose up` (see the root `docker-compose.yml`)
brings up this service alongside the frontend, Postgres, and MinIO.

Standalone:

```bash
cp .env.example .env
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Without Docker/MinIO, set `STORAGE_BACKEND=local` in `.env` and uploaded
files are stored on disk under `LOCAL_STORAGE_DIR`. Seed demo data with
`python -m app.seed_demo` (logins: `admin@`, `compliance@`, `board@rswitch.rw`,
and participant logins `ops@<code>.rw`, e.g. `ops@kvu.rw` — all `changeme123`).

The web app (repo root, `npm run dev` on :5173) talks to this API at
`VITE_API_URL` (default `http://localhost:8000`); keep its origin in
`CORS_ORIGINS`.

- API docs (Swagger UI): http://localhost:8000/docs
- Health check: http://localhost:8000/health

A default admin user (`admin@rswitch.rw` / `changeme123`) is seeded on first
startup — change the password immediately in anything beyond local dev.

## Data model

`Participant` carries `is_active` (trading eligibility) — this is never read
by or confused with `Integration.status` (Connected/Degraded/Disconnected/
Maintenance), which lives in its own table. `ComplianceDocument.status` is
never stored: `app/services/compliance.py` derives it from `expiry_date` at
read time, and "Missing" is the absence of a row for a required
`RequiredDocumentType`, not a stored value either.
