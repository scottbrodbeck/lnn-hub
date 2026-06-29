
-- 1. Expand the check constraint to allow 'email_blast_manual'
ALTER TABLE public.support_requests
  DROP CONSTRAINT support_requests_request_category_check;

ALTER TABLE public.support_requests
  ADD CONSTRAINT support_requests_request_category_check
  CHECK (request_category = ANY (ARRAY[
    'support'::text,
    'design'::text,
    'email_blast_manual'::text
  ]));

-- 2. Fix admin RLS policy to add missing WITH CHECK
DROP POLICY "Admins can manage all support requests" ON public.support_requests;

CREATE POLICY "Admins can manage all support requests"
  ON public.support_requests
  FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
