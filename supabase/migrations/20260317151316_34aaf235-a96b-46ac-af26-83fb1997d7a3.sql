-- Estado de revisión de soportes por placa
CREATE TABLE public.payment_review_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  placa TEXT NOT NULL UNIQUE,
  last_reviewed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT payment_review_status_placa_not_empty CHECK (char_length(trim(placa)) > 0)
);

ALTER TABLE public.payment_review_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read payment review status"
ON public.payment_review_status
FOR SELECT
TO public
USING (true);

CREATE POLICY "Public can insert payment review status"
ON public.payment_review_status
FOR INSERT
TO public
WITH CHECK (char_length(trim(placa)) > 0);

CREATE POLICY "Public can update payment review status"
ON public.payment_review_status
FOR UPDATE
TO public
USING (char_length(trim(placa)) > 0)
WITH CHECK (char_length(trim(placa)) > 0);

CREATE OR REPLACE FUNCTION public.update_payment_review_status_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_payment_review_status_updated_at
BEFORE UPDATE ON public.payment_review_status
FOR EACH ROW
EXECUTE FUNCTION public.update_payment_review_status_updated_at();

CREATE INDEX idx_payment_review_status_placa ON public.payment_review_status (placa);
CREATE INDEX idx_payment_review_status_last_reviewed_at ON public.payment_review_status (last_reviewed_at);