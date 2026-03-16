-- Tighten the write policies added previously so they are not fully open-ended.
DROP POLICY IF EXISTS "Public can insert pagos" ON public.pagos;
DROP POLICY IF EXISTS "Public can update pagos" ON public.pagos;

CREATE POLICY "Public can insert pagos with required fields"
ON public.pagos
FOR INSERT
TO public
WITH CHECK (
  char_length(trim(placa)) > 0
  AND total_prorrateo_gastos IS NOT NULL
  AND total_pagos IS NOT NULL
);

CREATE POLICY "Public can update pagos with required fields"
ON public.pagos
FOR UPDATE
TO public
USING (char_length(trim(placa)) > 0)
WITH CHECK (
  char_length(trim(placa)) > 0
  AND total_prorrateo_gastos IS NOT NULL
  AND total_pagos IS NOT NULL
);