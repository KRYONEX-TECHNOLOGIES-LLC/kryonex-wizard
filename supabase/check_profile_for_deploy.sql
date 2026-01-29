-- Run in Supabase SQL Editor to confirm profile data for a user before/after deploy.
-- Replace the UUID with the user_id from your JWT or server logs (deployRequestId trace).

SELECT
  user_id,
  industry,
  onboarding_step,
  deploy_error,
  area_code,
  business_name,
  consent_accepted_at IS NOT NULL AS has_consent
FROM profiles
WHERE user_id = 'b1d18d08-2613-4338-a73a-7a7c7680f868';

-- Expect: industry = 'hvac' or 'plumbing'; area_code = 3 digits; business_name set.
-- deploy_error: NULL after successful deploy; set (e.g. AREA_CODE_UNAVAILABLE) on failure.
-- Phone number lives in agents table after deploy; join agents on user_id if needed.
