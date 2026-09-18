CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username TEXT NOT NULL,
    avatar_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.message_reactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chat_id TEXT NOT NULL,
    message_id TEXT NOT NULL,
    emoji TEXT NOT NULL,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_user_message_emoji UNIQUE(chat_id, message_id, user_id, emoji)
);

CREATE INDEX IF NOT EXISTS idx_message_reactions_chat_msg 
ON public.message_reactions (chat_id, message_id);

CREATE INDEX IF NOT EXISTS idx_message_reactions_user_id
ON public.message_reactions (user_id);

ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow select for all users"
ON public.message_reactions FOR SELECT USING (true);

CREATE POLICY "Allow insert for user"
ON public.message_reactions FOR INSERT WITH CHECK (user_id = auth.uid() OR auth.uid() IS NULL);

CREATE POLICY "Allow delete for user"
ON public.message_reactions FOR DELETE USING (user_id = auth.uid() OR auth.uid() IS NULL);
