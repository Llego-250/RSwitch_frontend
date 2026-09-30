-- Runs once when the postgres container's data volume is first created.
-- Provisions a separate database for n8n's own execution/credential store
-- (kept apart from the RDIP application database) and enables the
-- pg_trgm extension RDIP uses for participant name search (Sprint 2 item 5).

CREATE DATABASE n8n;

\connect rswitch
CREATE EXTENSION IF NOT EXISTS pg_trgm;
