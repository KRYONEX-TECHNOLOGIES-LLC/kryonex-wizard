-- Affiliate System Migration
-- Run this in Supabase SQL Editor to add affiliate account support

-- ============================================
-- 1. ADD account_type TO PROFILES TABLE
-- ============================================
-- Values: 'business' (default), 'affiliate', 'both'
-- Existing users default to 'business' - no disruption

ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS account_type text DEFAULT 'business';

-- Add constraint to ensure valid values
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'profiles_account_type_check'
  ) THEN
    ALTER TABLE public.profiles 
    ADD CONSTRAINT profiles_account_type_check 
    CHECK (account_type IN ('business', 'affiliate', 'both'));
  END IF;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_profiles_account_type ON public.profiles(account_type);

-- ============================================
-- 2. ADD affiliate_name TO PROFILES TABLE
-- ============================================
-- For affiliate-only accounts (no business_name required)

ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS affiliate_name text;

-- NOTE: payout_email already exists on profiles from referral_system.sql
-- No need to add paypal_email — using payout_email for all payout destinations

-- ============================================
-- 3. ADD fraud_score TO REFERRALS TABLE
-- ============================================
-- Track calculated fraud score for each referral

ALTER TABLE public.referrals 
ADD COLUMN IF NOT EXISTS fraud_score integer DEFAULT 0;

ALTER TABLE public.referrals 
ADD COLUMN IF NOT EXISTS fraud_reviewed boolean DEFAULT false;

ALTER TABLE public.referrals 
ADD COLUMN IF NOT EXISTS fraud_reviewed_at timestamptz;

ALTER TABLE public.referrals 
ADD COLUMN IF NOT EXISTS fraud_reviewed_by uuid REFERENCES auth.users(id);

-- ============================================
-- 4. ADD extended_hold_until TO REFERRAL_COMMISSIONS TABLE
-- ============================================
-- For high fraud scores that need extended hold

ALTER TABLE public.referral_commissions 
ADD COLUMN IF NOT EXISTS extended_hold_until timestamptz;

ALTER TABLE public.referral_commissions 
ADD COLUMN IF NOT EXISTS hold_reason text;

ALTER TABLE public.referral_commissions 
ADD COLUMN IF NOT EXISTS notes text;

ALTER TABLE public.referral_commissions 
ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- ============================================
-- 5. HELPER FUNCTION - Calculate fraud score
-- ============================================
CREATE OR REPLACE FUNCTION calculate_referral_fraud_score(
  p_referral_id uuid
) RETURNS integer AS $$
DECLARE
  v_score integer := 0;
  v_referral record;
  v_referrer record;
  v_referred record;
  v_same_day_count integer;
BEGIN
  -- Get referral details
  SELECT * INTO v_referral FROM public.referrals WHERE id = p_referral_id;
  IF NOT FOUND THEN RETURN 0; END IF;
  
  -- Get referrer profile
  SELECT * INTO v_referrer FROM public.profiles WHERE user_id = v_referral.referrer_id;
  
  -- Get referred user profile
  SELECT * INTO v_referred FROM public.profiles WHERE user_id = v_referral.referred_id;
  
  -- Check same IP
  IF v_referral.signup_ip IS NOT NULL AND v_referrer.signup_ip IS NOT NULL THEN
    IF v_referral.signup_ip = v_referrer.signup_ip THEN
      v_score := v_score + 10;
    END IF;
  END IF;
  
  -- Check same email domain
  IF v_referrer.user_id IS NOT NULL AND v_referred.user_id IS NOT NULL THEN
    DECLARE
      v_referrer_email text;
      v_referred_email text;
    BEGIN
      SELECT email INTO v_referrer_email FROM auth.users WHERE id = v_referrer.user_id;
      SELECT email INTO v_referred_email FROM auth.users WHERE id = v_referred.user_id;
      
      IF split_part(v_referrer_email, '@', 2) = split_part(v_referred_email, '@', 2) THEN
        v_score := v_score + 15;
      END IF;
    END;
  END IF;
  
  -- Check for rapid cancellation (within 7 days)
  IF v_referral.status = 'cancelled' THEN
    IF v_referral.signup_at + interval '7 days' > now() THEN
      v_score := v_score + 20;
    END IF;
  END IF;
  
  -- Check for refund
  IF v_referral.status = 'clawed_back' OR v_referral.status = 'refunded' THEN
    v_score := v_score + 25;
  END IF;
  
  -- Check multiple referrals same day
  SELECT COUNT(*) INTO v_same_day_count
  FROM public.referrals
  WHERE referrer_id = v_referral.referrer_id
    AND DATE(signup_at) = DATE(v_referral.signup_at)
    AND id != v_referral.id;
  
  IF v_same_day_count >= 3 THEN
    v_score := v_score + 15;
  END IF;
  
  -- Update the referral with the calculated score
  UPDATE public.referrals SET fraud_score = v_score WHERE id = p_referral_id;
  
  RETURN v_score;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 6. UPDATE SETTINGS WITH FRAUD THRESHOLDS
-- ============================================
ALTER TABLE public.referral_settings 
ADD COLUMN IF NOT EXISTS fraud_auto_approve_max integer DEFAULT 20;

ALTER TABLE public.referral_settings 
ADD COLUMN IF NOT EXISTS fraud_extended_hold_min integer DEFAULT 41;

ALTER TABLE public.referral_settings 
ADD COLUMN IF NOT EXISTS fraud_manual_review_min integer DEFAULT 61;

ALTER TABLE public.referral_settings 
ADD COLUMN IF NOT EXISTS fraud_auto_reject_min integer DEFAULT 81;

ALTER TABLE public.referral_settings 
ADD COLUMN IF NOT EXISTS extended_hold_days integer DEFAULT 45;

-- Update default settings
UPDATE public.referral_settings SET
  fraud_auto_approve_max = 20,
  fraud_extended_hold_min = 41,
  fraud_manual_review_min = 61,
  fraud_auto_reject_min = 81,
  extended_hold_days = 45
WHERE id = 1;

-- ============================================
-- DONE! Verify by running:
-- SELECT account_type FROM public.profiles LIMIT 5;
-- SELECT fraud_score FROM public.referrals LIMIT 5;
-- SELECT fraud_auto_approve_max FROM public.referral_settings;
-- ============================================
