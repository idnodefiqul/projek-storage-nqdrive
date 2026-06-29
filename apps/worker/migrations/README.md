# Migrations

SQL migration files for Cloudflare D1 will be placed here in **Tahap 2 — Database Schema**.

Naming convention: `0001_initial_schema.sql`, `0002_add_xyz.sql`, etc.
Apply locally with `pnpm db:migrate:local`, apply to production with `pnpm db:migrate:remote`.
