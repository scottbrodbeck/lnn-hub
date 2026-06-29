-- Add DELETE policy for clients to delete their own posts
CREATE POLICY "Clients can delete own posts"
ON public.posts
FOR DELETE
TO authenticated
USING (client_id = auth.uid() AND has_role(auth.uid(), 'client'::app_role));