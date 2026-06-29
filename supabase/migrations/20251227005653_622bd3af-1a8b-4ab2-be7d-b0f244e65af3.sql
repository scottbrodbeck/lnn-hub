-- Enable Row Level Security on otp_codes table
ALTER TABLE public.otp_codes ENABLE ROW LEVEL SECURITY;

-- No permissive policies are added, which means:
-- 1. Regular client-side access is completely blocked
-- 2. Edge functions using SUPABASE_SERVICE_ROLE_KEY bypass RLS and continue to work
-- This is the correct pattern since OTP verification should only happen through secure server-side functions