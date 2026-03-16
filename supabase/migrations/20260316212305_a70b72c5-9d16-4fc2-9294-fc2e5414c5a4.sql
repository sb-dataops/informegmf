ALTER TABLE public.documentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pagos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all access to documentos" ON public.documentos;
DROP POLICY IF EXISTS "Allow all access to pagos" ON public.pagos;

CREATE POLICY "Public can read documentos"
ON public.documentos
FOR SELECT
TO public
USING (true);

CREATE POLICY "Public can read pagos"
ON public.pagos
FOR SELECT
TO public
USING (true);