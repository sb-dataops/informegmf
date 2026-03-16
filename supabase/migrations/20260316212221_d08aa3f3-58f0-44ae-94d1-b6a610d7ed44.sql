ALTER TABLE public.documentos
ADD COLUMN IF NOT EXISTS placas text[] NOT NULL DEFAULT '{}',
ADD COLUMN IF NOT EXISTS valor_soporte numeric NOT NULL DEFAULT 0;

UPDATE public.documentos
SET placas = CASE
  WHEN placa IS NOT NULL AND placa <> '' THEN ARRAY[upper(placa)]
  ELSE '{}'
END,
valor_soporte = COALESCE(valor_soporte, 0)
WHERE (placas IS NULL OR array_length(placas, 1) IS NULL)
   OR valor_soporte IS NULL;

CREATE INDEX IF NOT EXISTS idx_documentos_placas_gin
ON public.documentos
USING GIN (placas);

CREATE INDEX IF NOT EXISTS idx_documentos_valor_soporte
ON public.documentos (valor_soporte);