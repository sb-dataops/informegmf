-- Restrict signups to allowed corporate domains
CREATE OR REPLACE FUNCTION public.enforce_allowed_email_domain()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  email_domain TEXT;
  allowed_domains TEXT[] := ARRAY['superbid.com.co', 'gmfinancial.com'];
BEGIN
  IF NEW.email IS NULL THEN
    RAISE EXCEPTION 'Email is required';
  END IF;

  email_domain := lower(split_part(NEW.email, '@', 2));

  IF NOT (email_domain = ANY(allowed_domains)) THEN
    RAISE EXCEPTION 'El correo % no está autorizado. Solo se permiten correos @superbid.com.co o @gmfinancial.com', NEW.email
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_allowed_email_domain_trigger ON auth.users;
CREATE TRIGGER enforce_allowed_email_domain_trigger
  BEFORE INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_allowed_email_domain();