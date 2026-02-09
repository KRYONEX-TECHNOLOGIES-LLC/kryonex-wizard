-- ============================================
-- AFFILIATE SYSTEM VERIFICATION SCRIPT
-- Run this in Supabase SQL Editor to verify everything is set up
-- ============================================

-- 1. CHECK REQUIRED TABLES EXIST
SELECT '=== REQUIRED TABLES ===' as check_type;
SELECT 
  table_name,
  CASE WHEN table_name IS NOT NULL THEN '✓ EXISTS' ELSE '✗ MISSING' END as status
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('referral_codes', 'referrals', 'referral_commissions', 'referral_settings', 'payout_requests')
ORDER BY table_name;

-- 2. CHECK REFERRALS TABLE HAS ALL REQUIRED COLUMNS
SELECT '=== REFERRALS TABLE COLUMNS ===' as check_type;
SELECT 
  column_name,
  data_type,
  CASE 
    WHEN column_name IN ('eligible_at', 'months_paid', 'fraud_score', 'fraud_reviewed', 'upfront_paid', 'status', 'referrer_id', 'referred_id') 
    THEN '✓ CRITICAL' 
    ELSE '' 
  END as importance
FROM information_schema.columns 
WHERE table_name = 'referrals' 
ORDER BY ordinal_position;

-- 3. CHECK REFERRAL_COMMISSIONS TABLE
SELECT '=== REFERRAL_COMMISSIONS COLUMNS ===' as check_type;
SELECT column_name, data_type
FROM information_schema.columns 
WHERE table_name = 'referral_commissions' 
ORDER BY ordinal_position;

-- 4. CHECK REFERRAL SETTINGS
SELECT '=== REFERRAL SETTINGS ===' as check_type;
SELECT 
  upfront_amount_cents as "$25_bonus",
  monthly_percent as "10%_monthly",
  max_months as "12_month_cap",
  hold_days as "30_day_hold",
  min_payout_cents as "$50_min_payout",
  fraud_auto_approve_max,
  fraud_extended_hold_min,
  fraud_auto_reject_min,
  extended_hold_days,
  is_active
FROM public.referral_settings 
WHERE id = 1;

-- 5. CHECK PROFILES HAS AFFILIATE COLUMNS
SELECT '=== PROFILES AFFILIATE COLUMNS ===' as check_type;
SELECT column_name, data_type
FROM information_schema.columns 
WHERE table_name = 'profiles' 
AND column_name IN ('account_type', 'affiliate_name', 'payout_email', 'payout_method', 'referred_by_code', 'signup_ip')
ORDER BY column_name;

-- 6. CHECK PAYOUT_REQUESTS TABLE
SELECT '=== PAYOUT_REQUESTS COLUMNS ===' as check_type;
SELECT column_name, data_type
FROM information_schema.columns 
WHERE table_name = 'payout_requests' 
ORDER BY ordinal_position;

-- ============================================
-- SUMMARY: If any section shows empty results or missing columns,
-- run these migrations in order:
-- 1. supabase/referral_system.sql
-- 2. supabase/affiliate_migration.sql
-- ============================================
