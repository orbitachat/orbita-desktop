ALTER TABLE public.profile_updates ADD COLUMN IF NOT EXISTS hide_profile_id BOOLEAN DEFAULT false;
ALTER TABLE public.profile_updates ADD COLUMN IF NOT EXISTS sender_code TEXT;
ALTER TABLE public.profile_updates ADD COLUMN IF NOT EXISTS numeric_id TEXT;
ALTER TABLE public.profile_updates ADD COLUMN IF NOT EXISTS username TEXT;
ALTER TABLE public.profile_updates ADD COLUMN IF NOT EXISTS bio TEXT;
ALTER TABLE public.profile_updates ADD COLUMN IF NOT EXISTS birthday TEXT;
CREATE INDEX IF NOT EXISTS idx_profile_updates_chat_id ON public.profile_updates(chat_id);
CREATE INDEX IF NOT EXISTS idx_profile_updates_numeric_id ON public.profile_updates(numeric_id);
CREATE INDEX IF NOT EXISTS idx_profile_updates_username ON public.profile_updates(username);

ALTER TABLE public.handshakes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all on handshakes" ON public.handshakes;
CREATE POLICY "Allow all on handshakes" ON public.handshakes FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all on messages" ON public.messages;
CREATE POLICY "Allow all on messages" ON public.messages FOR ALL USING (true) WITH CHECK (true);
