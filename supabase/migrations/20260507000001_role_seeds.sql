-- role_seeds: mapping email -> role(s) que se aplica automaticamente cuando un usuario
-- hace login por primera vez. Permite migrar los usuarios del Supabase viejo sin tener
-- que asignar roles manualmente uno por uno desde el panel admin.

CREATE TABLE IF NOT EXISTS public.role_seeds (
  email      TEXT NOT NULL,
  role       public.app_role NOT NULL,
  applied_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (email, role)
);

ALTER TABLE public.role_seeds ENABLE ROW LEVEL SECURITY;

-- Solo admins ven y editan los seeds
CREATE POLICY "Admins can view role_seeds"
  ON public.role_seeds FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage role_seeds"
  ON public.role_seeds FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Mapping de los 6 usuarios del Supabase viejo
INSERT INTO public.role_seeds (email, role) VALUES
  ('andrea.hernandez@superbid.com.co', 'editor'),
  ('dataops@superbid.com.co',          'admin'),
  ('juan.saavedra@superbid.com.co',    'admin'),
  ('juan.saavedra@superbid.com.co',    'lector_con_notificacion'),
  ('juliana.murillo@superbid.com.co',  'lector'),
  ('maria.castro@superbid.com.co',     'lector'),
  ('retiros1@superbid.com.co',         'lector')
ON CONFLICT (email, role) DO NOTHING;

-- Trigger handle_new_user: ahora tambien aplica los seeds que coincidan con el email.
-- Preserva la logica original de crear profile.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, email, display_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1))
  );

  -- Aplica seeded roles que coincidan con el email del nuevo usuario
  INSERT INTO public.user_roles (user_id, role)
  SELECT NEW.id, rs.role
  FROM public.role_seeds rs
  WHERE rs.email = NEW.email
  ON CONFLICT (user_id, role) DO NOTHING;

  -- Marca esos seeds como aplicados (dejamos la fila para auditoria)
  UPDATE public.role_seeds
  SET applied_at = now()
  WHERE email = NEW.email AND applied_at IS NULL;

  RETURN NEW;
END;
$$;

-- Backfill: para usuarios que ya existen (e.g., dataops que ya entro), aplica los seeds
INSERT INTO public.user_roles (user_id, role)
SELECT u.id, rs.role
FROM auth.users u
JOIN public.role_seeds rs ON rs.email = u.email
ON CONFLICT (user_id, role) DO NOTHING;

UPDATE public.role_seeds rs
SET applied_at = now()
WHERE applied_at IS NULL
  AND EXISTS (
    SELECT 1 FROM auth.users u WHERE u.email = rs.email
  );
