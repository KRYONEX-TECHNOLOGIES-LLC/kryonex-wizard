# Supabase

This folder contains the SQL schema used by the app.

## Schema
- `command_suite.sql`: tables, views, and seed data.

To apply:
1) Open Supabase SQL editor.
2) Paste `command_suite.sql`.
3) Run in a staging project first.

## RLS Notes
- User-facing reads/writes are scoped by `auth.uid()`.
- Admin reads use the service role key on the API server.
- Keep service keys only in backend `.env`.

## Key Tables (high level)
- `profiles`: user metadata and roles.
- `leads`, `call_recordings`, `messages`: CRM + comms history.
- `appointments`: calendar bookings.
- `agents`: deployed Retell agent metadata.
