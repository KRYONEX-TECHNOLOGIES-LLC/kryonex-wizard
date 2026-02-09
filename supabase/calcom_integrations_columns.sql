-- Cal.com integration: add all columns required for OAuth callback and status.
-- Run in Supabase SQL Editor if you see: "Could not find the 'booking_url' column of 'integrations'".
-- Safe to re-run (uses IF NOT EXISTS). Required columns: booking_url, event_type_id, event_type_slug,
-- cal_username, cal_team_slug, cal_organization_slug, cal_time_zone, cal_user_id, expires_at, updated_at.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'integrations' AND column_name = 'booking_url') THEN
    ALTER TABLE public.integrations ADD COLUMN booking_url text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'integrations' AND column_name = 'event_type_id') THEN
    ALTER TABLE public.integrations ADD COLUMN event_type_id text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'integrations' AND column_name = 'event_type_slug') THEN
    ALTER TABLE public.integrations ADD COLUMN event_type_slug text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'integrations' AND column_name = 'cal_username') THEN
    ALTER TABLE public.integrations ADD COLUMN cal_username text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'integrations' AND column_name = 'cal_team_slug') THEN
    ALTER TABLE public.integrations ADD COLUMN cal_team_slug text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'integrations' AND column_name = 'cal_organization_slug') THEN
    ALTER TABLE public.integrations ADD COLUMN cal_organization_slug text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'integrations' AND column_name = 'cal_time_zone') THEN
    ALTER TABLE public.integrations ADD COLUMN cal_time_zone text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'integrations' AND column_name = 'cal_user_id') THEN
    ALTER TABLE public.integrations ADD COLUMN cal_user_id text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'integrations' AND column_name = 'expires_at') THEN
    ALTER TABLE public.integrations ADD COLUMN expires_at timestamptz;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'integrations' AND column_name = 'updated_at') THEN
    ALTER TABLE public.integrations ADD COLUMN updated_at timestamptz DEFAULT now();
  END IF;
END $$;
