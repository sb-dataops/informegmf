-- Track which auctions have already been notified as "fully loaded"
CREATE TABLE public.subasta_notificada (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subasta text NOT NULL UNIQUE,
  notified_at timestamptz NOT NULL DEFAULT now(),
  total_placas integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.subasta_notificada ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read subasta_notificada"
ON public.subasta_notificada FOR SELECT
USING (true);

CREATE POLICY "Service role manages subasta_notificada"
ON public.subasta_notificada FOR ALL
TO service_role
USING (true) WITH CHECK (true);