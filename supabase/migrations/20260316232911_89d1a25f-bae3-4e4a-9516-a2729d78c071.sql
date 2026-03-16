-- Allow the app to create and update payment records.
-- Existing SELECT policy remains unchanged.

CREATE POLICY "Public can insert pagos"
ON public.pagos
FOR INSERT
TO public
WITH CHECK (true);

CREATE POLICY "Public can update pagos"
ON public.pagos
FOR UPDATE
TO public
USING (true)
WITH CHECK (true);