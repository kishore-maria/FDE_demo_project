-- For a locally installed PostgreSQL (no Docker). Run as a superuser:
--   psql -U postgres -f docker/postgres/setup-local.sql
-- CREATEDB is required by `prisma migrate dev` (shadow database).
CREATE ROLE bookworm WITH LOGIN PASSWORD 'bookworm' CREATEDB;
CREATE DATABASE bookworm OWNER bookworm;
CREATE DATABASE bookworm_test OWNER bookworm;
