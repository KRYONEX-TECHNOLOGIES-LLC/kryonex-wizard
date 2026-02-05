-- Referral System Migration
-- Run this in Supabase SQL Editor to create the referral system tables

-- ============================================
-- 1. REFERRAL CODES TABLE - One unique code per user
-- ============================================
CREATE TABLE IF NOT EXISTS public.referral_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  code text UNIQUE NOT NULL,  -- e.g., "JOHN7X2K"
  created_at timestamptz DEFAULT now(),
  is_active boolean DEFAULT true
);

-- Index for fast code lookups
CREATE INDEX IF NOT EXISTS idx_referral_codes_code ON public.referral_codes(code);
CREATE INDEX IF NOT EXISTS idx_referral_codes_user ON public.referral_codes(user_id);

-- ============================================
-- 2. REFERRALS TABLE - Track each referral relationship
-- ============================================
CREATE TABLE IF NOT EXISTS public.referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  referred_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  referral_code text NOT NULL,
  status text DEFAULT 'pending',  -- pending, eligible, paid, rejected, clawed_back
  signup_ip text,
  signup_at timestamptz DEFAULT now(),
  first_payment_at timestamptz,
  eligible_at timestamptz,  -- 30 days after first payment
  upfront_paid boolean DEFAULT false,
  upfront_paid_at timestamptz,
  total_commission_cents integer DEFAULT 0,
  months_paid integer DEFAULT 0,  -- max 12
  rejection_reason text,
  fraud_flags jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes for referrals
CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON public.referrals(referrer_id);
CREATE INDEX IF NOT EXISTS idx_referrals_referred ON public.referrals(referred_id);
CREATE INDEX IF NOT EXISTS idx_referrals_status ON public.referrals(status);
CREATE INDEX IF NOT EXISTS idx_referrals_code ON public.referrals(referral_code);

-- ============================================
-- 3. REFERRAL COMMISSIONS TABLE - Track each commission payment
-- ============================================
CREATE TABLE IF NOT EXISTS public.referral_commissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referral_id uuid REFERENCES public.referrals(id) ON DELETE CASCADE,
  referrer_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  amount_cents integer NOT NULL,
  commission_type text NOT NULL,  -- 'upfront' or 'monthly'
  month_number integer,  -- 1-12 for monthly, NULL for upfront
  status text DEFAULT 'pending',  -- pending, approved, paid, clawed_back
  stripe_invoice_id text,  -- which invoice triggered this
  stripe_subscription_id text,
  created_at timestamptz DEFAULT now(),
  approved_at timestamptz,
  paid_at timestamptz
);

-- Indexes for commissions
CREATE INDEX IF NOT EXISTS idx_referral_commissions_referrer ON public.referral_commissions(referrer_id);
CREATE INDEX IF NOT EXISTS idx_referral_commissions_referral ON public.referral_commissions(referral_id);
CREATE INDEX IF NOT EXISTS idx_referral_commissions_status ON public.referral_commissions(status);

-- ============================================
-- 4. REFERRAL SETTINGS TABLE - Admin configurable settings
-- ============================================
CREATE TABLE IF NOT EXISTS public.referral_settings (
  id integer PRIMARY KEY DEFAULT 1,
  upfront_amount_cents integer DEFAULT 2500,  -- $25
  monthly_percent integer DEFAULT 10,  -- 10%
  max_months integer DEFAULT 12,
  hold_days integer DEFAULT 30,
  min_payout_cents integer DEFAULT 5000,  -- $50 min to request payout
  auto_approve_under_cents integer DEFAULT 10000,  -- auto-approve under $100
  is_active boolean DEFAULT true,
  updated_at timestamptz DEFAULT now()
);

-- Insert default settings
INSERT INTO public.referral_settings (id, upfront_amount_cents, monthly_percent, max_months, hold_days, min_payout_cents, auto_approve_under_cents, is_active)
VALUES (1, 2500, 10, 12, 30, 5000, 10000, true)
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- 5. ADD referred_by_code TO PROFILES TABLE
-- ============================================
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS referred_by_code text,
ADD COLUMN IF NOT EXISTS referred_by_user_id uuid REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS signup_ip text;

-- ============================================
-- 6. ENABLE ROW LEVEL SECURITY
-- ============================================
ALTER TABLE public.referral_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_commissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_settings ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 7. RLS POLICIES - Referral Codes
-- ============================================
DROP POLICY IF EXISTS "Users can view own referral code" ON public.referral_codes;
CREATE POLICY "Users can view own referral code"
ON public.referral_codes FOR SELECT
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create own referral code" ON public.referral_codes;
CREATE POLICY "Users can create own referral code"
ON public.referral_codes FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Admin full access to referral_codes
DROP POLICY IF EXISTS "Admins full access referral_codes" ON public.referral_codes;
CREATE POLICY "Admins full access referral_codes"
ON public.referral_codes FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.user_id = auth.uid()
    AND profiles.role = 'admin'
  )
);

-- ============================================
-- 8. RLS POLICIES - Referrals
-- ============================================
-- Users can view referrals where they are the referrer
DROP POLICY IF EXISTS "Users can view referrals they made" ON public.referrals;
CREATE POLICY "Users can view referrals they made"
ON public.referrals FOR SELECT
USING (auth.uid() = referrer_id);

-- Admin full access to referrals
DROP POLICY IF EXISTS "Admins full access referrals" ON public.referrals;
CREATE POLICY "Admins full access referrals"
ON public.referrals FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.user_id = auth.uid()
    AND profiles.role = 'admin'
  )
);

-- ============================================
-- 9. RLS POLICIES - Referral Commissions
-- ============================================
-- Users can view their own commissions
DROP POLICY IF EXISTS "Users can view own commissions" ON public.referral_commissions;
CREATE POLICY "Users can view own commissions"
ON public.referral_commissions FOR SELECT
USING (auth.uid() = referrer_id);

-- Admin full access to commissions
DROP POLICY IF EXISTS "Admins full access commissions" ON public.referral_commissions;
CREATE POLICY "Admins full access commissions"
ON public.referral_commissions FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.user_id = auth.uid()
    AND profiles.role = 'admin'
  )
);

-- ============================================
-- 10. RLS POLICIES - Referral Settings (Admin only)
-- ============================================
DROP POLICY IF EXISTS "Only admins can view settings" ON public.referral_settings;
CREATE POLICY "Only admins can view settings"
ON public.referral_settings FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.user_id = auth.uid()
    AND profiles.role = 'admin'
  )
);

DROP POLICY IF EXISTS "Only admins can update settings" ON public.referral_settings;
CREATE POLICY "Only admins can update settings"
ON public.referral_settings FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.user_id = auth.uid()
    AND profiles.role = 'admin'
  )
);

-- ============================================
-- 11. HELPER FUNCTION - Generate unique referral code
-- ============================================
CREATE OR REPLACE FUNCTION generate_referral_code()
RETURNS text AS $$
DECLARE
  chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';  -- No I, O, 0, 1 to avoid confusion
  result text := '';
  i integer;
BEGIN
  FOR i IN 1..8 LOOP
    result := result || substr(chars, floor(random() * length(chars) + 1)::integer, 1);
  END LOOP;
  RETURN result;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 12. PAYOUT REQUESTS TABLE - Track payout request history
-- ============================================
CREATE TABLE IF NOT EXISTS public.payout_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  amount_cents integer NOT NULL,
  status text DEFAULT 'pending',  -- pending, processing, completed, rejected
  payment_method text DEFAULT 'manual',  -- manual, paypal, stripe, bank_transfer
  payment_email text,  -- PayPal email or bank info reference
  notes text,
  admin_notes text,  -- Internal notes from admin
  processed_by uuid REFERENCES auth.users(id),  -- Admin who processed
  processed_at timestamptz,
  rejection_reason text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes for payout requests
CREATE INDEX IF NOT EXISTS idx_payout_requests_user ON public.payout_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_payout_requests_status ON public.payout_requests(status);
CREATE INDEX IF NOT EXISTS idx_payout_requests_created ON public.payout_requests(created_at DESC);

-- Enable RLS
ALTER TABLE public.payout_requests ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 13. RLS POLICIES - Payout Requests
-- ============================================
-- Users can view their own payout requests
DROP POLICY IF EXISTS "Users can view own payout requests" ON public.payout_requests;
CREATE POLICY "Users can view own payout requests"
ON public.payout_requests FOR SELECT
USING (auth.uid() = user_id);

-- Users can create their own payout requests
DROP POLICY IF EXISTS "Users can create own payout requests" ON public.payout_requests;
CREATE POLICY "Users can create own payout requests"
ON public.payout_requests FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Admin full access to payout requests
DROP POLICY IF EXISTS "Admins full access payout_requests" ON public.payout_requests;
CREATE POLICY "Admins full access payout_requests"
ON public.payout_requests FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.user_id = auth.uid()
    AND profiles.role = 'admin'
  )
);

-- ============================================
-- 14. ADD payout fields to profiles for payment info storage
-- ============================================
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS payout_email text,
ADD COLUMN IF NOT EXISTS payout_method text DEFAULT 'paypal';

-- ============================================
-- DONE! Verify by running:
-- SELECT * FROM public.referral_settings;
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'referral_codes';
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'referrals';
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'payout_requests';
-- ============================================
