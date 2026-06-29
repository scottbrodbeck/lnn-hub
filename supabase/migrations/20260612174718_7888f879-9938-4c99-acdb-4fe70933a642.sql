
-- Storage RLS policies for tax-documents bucket
-- Authenticated users can read (so any logged-in client can download the W-9)
CREATE POLICY "Authenticated users can read tax documents"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'tax-documents');

-- Only admins can upload / update / delete
CREATE POLICY "Admins can upload tax documents"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'tax-documents' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update tax documents"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'tax-documents' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete tax documents"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'tax-documents' AND public.has_role(auth.uid(), 'admin'));
