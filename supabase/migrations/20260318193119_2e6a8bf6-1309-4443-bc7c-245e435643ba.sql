CREATE POLICY "Service role can manage otp codes"
ON public.otp_codes
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);