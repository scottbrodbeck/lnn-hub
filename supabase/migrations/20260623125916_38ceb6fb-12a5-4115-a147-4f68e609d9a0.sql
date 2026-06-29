ALTER TABLE public.support_requests
  DROP CONSTRAINT support_requests_request_category_check;

ALTER TABLE public.support_requests
  ADD CONSTRAINT support_requests_request_category_check
  CHECK (request_category = ANY (ARRAY[
    'support'::text,
    'design'::text,
    'email_blast_manual'::text,
    'change_request'::text
  ]));