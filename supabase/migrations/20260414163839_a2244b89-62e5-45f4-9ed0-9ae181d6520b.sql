
DROP POLICY "Service can insert notifications" ON public.notifications;

CREATE POLICY "Only service role can insert notifications"
  ON public.notifications FOR INSERT TO service_role
  WITH CHECK (true);
