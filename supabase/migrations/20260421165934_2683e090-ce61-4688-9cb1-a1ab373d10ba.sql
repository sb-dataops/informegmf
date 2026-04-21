-- Function to notify all admins when a new user (without roles) signs up/logs in for the first time
CREATE OR REPLACE FUNCTION public.notify_admins_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  admin_record RECORD;
  user_display TEXT;
BEGIN
  user_display := COALESCE(NEW.display_name, NEW.email, 'Usuario desconocido');

  -- Insert a notification for each admin
  FOR admin_record IN
    SELECT ur.user_id
    FROM public.user_roles ur
    WHERE ur.role = 'admin'
  LOOP
    INSERT INTO public.notifications (user_id, title, message)
    VALUES (
      admin_record.user_id,
      'Nuevo usuario sin rol asignado',
      user_display || ' (' || COALESCE(NEW.email, 'sin email') || ') inició sesión por primera vez. Asígnale un rol para que pueda acceder al sistema.'
    );
  END LOOP;

  RETURN NEW;
END;
$$;

-- Trigger fires after a profile is created (which happens on first signup/login)
DROP TRIGGER IF EXISTS on_new_profile_notify_admins ON public.profiles;
CREATE TRIGGER on_new_profile_notify_admins
AFTER INSERT ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.notify_admins_new_user();