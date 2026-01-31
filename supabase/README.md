# Supabase

This folder contains the SQL schema and migrations used by the app.

## Schema Files

| File | Description |
|------|-------------|
| `command_suite.sql` | Core tables: profiles, leads, deals, commissions, call_recordings, integrations, tracking, appointments, audit_logs, black_box_logs, dialer_queue. |
| `ops_infrastructure.sql` | Ops tables: webhook_queue, unknown_phone, call_events, sms_events, alerts, tier_snapshots, billing_line_items, reconciliation_runs. Also adds status/updated_at/provider to agents. |
| `agents_deploy_trace.sql` | Adds deploy_request_id, nickname, provider_number_id to agents table. |
| `usage_limits_hard_stop.sql` | Adds hard_stop_active column to usage_limits. |
| `add_profiles_area_code.sql` | Adds business_name, area_code, and other columns to profiles. |
| `check_profile_for_deploy.sql` | Diagnostic query to verify profile data before deploy. |
| `deploy_error_profiles.sql` | Adds deploy_error column to profiles. |
| `ops_layer_complete.sql` | **NEW** - Adds columns for recording storage (leads), usage_alerts table, cal_booking_uid to appointments. Run this to complete ops layer. |

## How to Apply

1. Open Supabase SQL Editor.
2. Run migrations in order:
   - `command_suite.sql` (core schema)
   - `ops_infrastructure.sql` (ops tables)
   - Other migrations as needed
3. Test in staging before production.

## RLS Notes
- User-facing reads/writes are scoped by `auth.uid()`.
- Admin reads use the service role key on the API server.
- Ops tables (webhook_queue, call_events, etc.) are admin-only.
- Keep service keys only in backend `.env`.

## Key Tables

### Core
- `profiles`: user metadata, business_name, area_code, roles.
- `agents`: deployed Retell agent metadata, phone_number, status.
- `leads`, `call_recordings`, `messages`: CRM + comms history.
- `appointments`: calendar bookings.
- `subscriptions`, `usage_limits`: billing and usage tracking.

### Ops Infrastructure
- `webhook_queue`: raw webhooks for replay and audit.
- `unknown_phone`: webhooks for numbers not in agents.
- `call_events`: normalized call records with billing fields.
- `sms_events`: normalized SMS records with billing fields.
- `alerts`: operational alerts (usage warnings, blocks).
- `tier_snapshots`: immutable tier rules for historical billing.
- `billing_line_items`: traceable billing linked to events.
- `reconciliation_runs`: audit trail for nightly jobs.
