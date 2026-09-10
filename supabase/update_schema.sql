ALTER TABLE public.profile_updates ADD COLUMN IF NOT EXISTS hide_profile_id BOOLEAN DEFAULT false;
ALTER TABLE public.profile_updates ADD COLUMN IF NOT EXISTS sender_code TEXT;
CREATE INDEX IF NOT EXISTS idx_profile_updates_chat_id ON public.profile_updates(chat_id);

CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.unschedule('orbita-cleanup-stale-profile-updates') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'orbita-cleanup-stale-profile-updates'
);

SELECT cron.schedule(
  'orbita-cleanup-stale-profile-updates',
  '*/30 * * * *',
  $$DELETE FROM profile_updates WHERE updated_at < NOW() - INTERVAL '7 days';$$
);
