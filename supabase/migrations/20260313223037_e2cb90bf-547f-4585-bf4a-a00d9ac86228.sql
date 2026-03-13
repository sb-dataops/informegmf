
-- Tabla de pagos por placa
CREATE TABLE public.pagos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  placa TEXT NOT NULL,
  subasta TEXT,
  total_prorrateo_gastos NUMERIC DEFAULT 0,
  total_pagos NUMERIC DEFAULT 0,
  fecha_limite_pago DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tabla de documentos por comprador
CREATE TABLE public.documentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  documento_comprador TEXT NOT NULL,
  placa TEXT,
  nombre_archivo TEXT NOT NULL,
  tipo_archivo TEXT,
  tamano BIGINT,
  gcs_path TEXT NOT NULL,
  gcs_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_pagos_placa ON public.pagos(placa);
CREATE INDEX idx_documentos_comprador ON public.documentos(documento_comprador);
CREATE INDEX idx_documentos_placa ON public.documentos(placa);

-- Disable RLS for now (internal tool, no auth)
ALTER TABLE public.pagos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documentos ENABLE ROW LEVEL SECURITY;

-- Allow all access (internal tool without auth)
CREATE POLICY "Allow all access to pagos" ON public.pagos FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to documentos" ON public.documentos FOR ALL USING (true) WITH CHECK (true);
