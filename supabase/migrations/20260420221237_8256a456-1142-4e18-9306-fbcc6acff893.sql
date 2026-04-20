-- Función helper para chequear múltiples roles
CREATE OR REPLACE FUNCTION public.has_any_role(_user_id uuid, _roles app_role[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = ANY(_roles)
  )
$$;

-- pagos
DROP POLICY IF EXISTS "Public can insert pagos with required fields" ON public.pagos;
DROP POLICY IF EXISTS "Public can update pagos with required fields" ON public.pagos;

CREATE POLICY "Editors and admins can insert pagos"
ON public.pagos FOR INSERT TO authenticated
WITH CHECK (
  public.has_any_role(auth.uid(), ARRAY['admin'::app_role,'editor'::app_role])
  AND char_length(trim(placa)) > 0
  AND total_prorrateo_gastos IS NOT NULL
  AND total_pagos IS NOT NULL
);

CREATE POLICY "Editors and admins can update pagos"
ON public.pagos FOR UPDATE TO authenticated
USING (public.has_any_role(auth.uid(), ARRAY['admin'::app_role,'editor'::app_role]))
WITH CHECK (
  public.has_any_role(auth.uid(), ARRAY['admin'::app_role,'editor'::app_role])
  AND char_length(trim(placa)) > 0
  AND total_prorrateo_gastos IS NOT NULL
  AND total_pagos IS NOT NULL
);

CREATE POLICY "Admins can delete pagos"
ON public.pagos FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

-- documentos
CREATE POLICY "Editors and admins can insert documentos"
ON public.documentos FOR INSERT TO authenticated
WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin'::app_role,'editor'::app_role]));

CREATE POLICY "Editors and admins can update documentos"
ON public.documentos FOR UPDATE TO authenticated
USING (public.has_any_role(auth.uid(), ARRAY['admin'::app_role,'editor'::app_role]))
WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin'::app_role,'editor'::app_role]));

CREATE POLICY "Admins can delete documentos"
ON public.documentos FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

-- payment_review_status
DROP POLICY IF EXISTS "Public can insert payment review status" ON public.payment_review_status;
DROP POLICY IF EXISTS "Public can update payment review status" ON public.payment_review_status;

CREATE POLICY "Editors and admins can insert payment review status"
ON public.payment_review_status FOR INSERT TO authenticated
WITH CHECK (
  public.has_any_role(auth.uid(), ARRAY['admin'::app_role,'editor'::app_role])
  AND char_length(trim(placa)) > 0
);

CREATE POLICY "Editors and admins can update payment review status"
ON public.payment_review_status FOR UPDATE TO authenticated
USING (public.has_any_role(auth.uid(), ARRAY['admin'::app_role,'editor'::app_role]))
WITH CHECK (
  public.has_any_role(auth.uid(), ARRAY['admin'::app_role,'editor'::app_role])
  AND char_length(trim(placa)) > 0
);