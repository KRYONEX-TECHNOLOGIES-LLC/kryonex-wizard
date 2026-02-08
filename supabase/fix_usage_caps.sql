-- ============================================
-- FIX USAGE CAPS FOR ALL TIERS
-- Run this in Supabase SQL Editor
-- ============================================

-- 1. First, check current state of all users with their subscription and usage
SELECT 
  s.user_id, 
  s.plan_type, 
  s.status as sub_status,
  u.call_cap_seconds/60 as current_cap_minutes, 
  u.call_used_seconds/60 as used_minutes,
  u.sms_cap as current_sms_cap,
  u.sms_used,
  CASE 
    WHEN LOWER(s.plan_type) = 'scale' THEN 3000
    WHEN LOWER(s.plan_type) = 'elite' THEN 800
    WHEN LOWER(s.plan_type) = 'pro' THEN 300
    ELSE 150
  END as expected_cap_minutes,
  CASE 
    WHEN u.call_cap_seconds/60 != CASE 
      WHEN LOWER(s.plan_type) = 'scale' THEN 3000
      WHEN LOWER(s.plan_type) = 'elite' THEN 800
      WHEN LOWER(s.plan_type) = 'pro' THEN 300
      ELSE 150
    END THEN 'MISMATCH'
    ELSE 'OK'
  END as status
FROM subscriptions s
LEFT JOIN usage_limits u ON s.user_id = u.user_id
ORDER BY s.plan_type, s.created_at DESC;

-- ============================================
-- 2. Fix Scale users (should be 3000 min / 5000 sms)
-- ============================================
UPDATE usage_limits 
SET 
  call_cap_seconds = 180000,  -- 3000 minutes
  sms_cap = 5000,
  updated_at = NOW()
WHERE user_id IN (
  SELECT user_id FROM subscriptions WHERE LOWER(plan_type) = 'scale'
);

-- ============================================
-- 3. Fix Elite users (should be 800 min / 3000 sms)
-- ============================================
UPDATE usage_limits 
SET 
  call_cap_seconds = 48000,  -- 800 minutes
  sms_cap = 3000,
  updated_at = NOW()
WHERE user_id IN (
  SELECT user_id FROM subscriptions WHERE LOWER(plan_type) = 'elite'
);

-- ============================================
-- 4. Fix Pro users (should be 300 min / 1000 sms)
-- ============================================
UPDATE usage_limits 
SET 
  call_cap_seconds = 18000,  -- 300 minutes
  sms_cap = 1000,
  updated_at = NOW()
WHERE user_id IN (
  SELECT user_id FROM subscriptions WHERE LOWER(plan_type) = 'pro'
);

-- ============================================
-- 5. Fix Core users (should be 150 min / 250 sms)
-- ============================================
UPDATE usage_limits 
SET 
  call_cap_seconds = 9000,  -- 150 minutes
  sms_cap = 250,
  updated_at = NOW()
WHERE user_id IN (
  SELECT user_id FROM subscriptions WHERE LOWER(plan_type) = 'core'
);

-- ============================================
-- 6. Create missing usage_limits rows for users without one
-- ============================================
INSERT INTO usage_limits (user_id, call_cap_seconds, sms_cap, grace_seconds, call_used_seconds, sms_used, period_start, period_end)
SELECT 
  s.user_id,
  CASE 
    WHEN LOWER(s.plan_type) = 'scale' THEN 180000
    WHEN LOWER(s.plan_type) = 'elite' THEN 48000
    WHEN LOWER(s.plan_type) = 'pro' THEN 18000
    ELSE 9000
  END as call_cap_seconds,
  CASE 
    WHEN LOWER(s.plan_type) = 'scale' THEN 5000
    WHEN LOWER(s.plan_type) = 'elite' THEN 3000
    WHEN LOWER(s.plan_type) = 'pro' THEN 1000
    ELSE 250
  END as sms_cap,
  600 as grace_seconds,
  0 as call_used_seconds,
  0 as sms_used,
  NOW() as period_start,
  NOW() + INTERVAL '30 days' as period_end
FROM subscriptions s
LEFT JOIN usage_limits u ON s.user_id = u.user_id
WHERE u.user_id IS NULL;

-- ============================================
-- 7. Verify new agent phone number mapping
-- ============================================
SELECT 
  a.agent_id, 
  a.phone_number, 
  a.user_id, 
  a.created_at,
  a.is_active,
  p.email,
  p.business_name,
  u.call_cap_seconds/60 as cap_minutes,
  u.call_used_seconds/60 as used_minutes
FROM agents a
LEFT JOIN profiles p ON a.user_id = p.user_id
LEFT JOIN usage_limits u ON a.user_id = u.user_id
ORDER BY a.created_at DESC
LIMIT 10;

-- ============================================
-- 8. Check for recent leads (call tracking verification)
-- ============================================
SELECT 
  l.id,
  l.user_id,
  l.name,
  l.phone,
  l.status,
  l.call_duration_seconds,
  l.created_at,
  p.business_name
FROM leads l
LEFT JOIN profiles p ON l.user_id = p.user_id
ORDER BY l.created_at DESC
LIMIT 20;

-- ============================================
-- 9. Check recent usage_calls (verifies call tracking)
-- ============================================
SELECT 
  uc.user_id,
  uc.agent_id,
  uc.call_id,
  uc.seconds,
  uc.created_at,
  p.business_name
FROM usage_calls uc
LEFT JOIN profiles p ON uc.user_id = p.user_id
ORDER BY uc.created_at DESC
LIMIT 20;

-- ============================================
-- 10. Final verification - show corrected state
-- ============================================
SELECT 
  s.user_id, 
  s.plan_type, 
  u.call_cap_seconds/60 as cap_minutes, 
  u.call_used_seconds/60 as used_minutes,
  u.sms_cap,
  u.sms_used,
  CASE 
    WHEN LOWER(s.plan_type) = 'scale' AND u.call_cap_seconds = 180000 THEN 'OK'
    WHEN LOWER(s.plan_type) = 'elite' AND u.call_cap_seconds = 48000 THEN 'OK'
    WHEN LOWER(s.plan_type) = 'pro' AND u.call_cap_seconds = 18000 THEN 'OK'
    WHEN LOWER(s.plan_type) = 'core' AND u.call_cap_seconds = 9000 THEN 'OK'
    ELSE 'CHECK'
  END as verification_status
FROM subscriptions s
LEFT JOIN usage_limits u ON s.user_id = u.user_id
ORDER BY s.plan_type;
