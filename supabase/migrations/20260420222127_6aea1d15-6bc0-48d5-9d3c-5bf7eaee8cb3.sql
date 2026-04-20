DROP POLICY IF EXISTS "Editors and admins can insert payment review status" ON public.payment_review_status;
DROP POLICY IF EXISTS "Editors and admins can update payment review status" ON public.payment_review_status;

CREATE POLICY "Reviewers can insert payment review status"
ON public.payment_review_status FOR INSERT TO authenticated
WITH CHECK (
  public.has_any_role(
    auth.uid(),
    ARRAY['admin'::app_role, 'editor'::app_role, 'lector_con_notificacion'::app_role]
  )
  AND char_length(trim(placa)) > 0
);

CREATE POLICY "Reviewers can update payment review status"
ON public.payment_review_status FOR UPDATE TO authenticated
USING (
  public.has_any_role(
    auth.uid(),
    ARRAY['admin'::app_role, 'editor'::app_role, 'lector_con_notificacion'::app_role]
  )
)
WITH CHECK (
  public.has_any_role(
    auth.uid(),
    ARRAY['admin'::app_role, 'editor'::app_role, 'lector_con_notificacion'::app_role]
  )
  AND char_length(trim(placa)) > 0
);