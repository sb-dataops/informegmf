ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS email_notified_at TIMESTAMP WITH TIME ZONE;

CREATE INDEX IF NOT EXISTS idx_notifications_email_pending ON public.notifications (created_at) WHERE email_notified_at IS NULL;

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;