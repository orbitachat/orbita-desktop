CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username TEXT NOT NULL,
    avatar_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_profiles_id ON public.profiles (id);
CREATE INDEX IF NOT EXISTS idx_profiles_username ON public.profiles (username);

CREATE TABLE IF NOT EXISTS public.public_channels (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    avatar_url TEXT,
    creator_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    creator_nickname TEXT NOT NULL,
    subscribers_count INT DEFAULT 1,
    is_official BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_public_channels_id ON public.public_channels (id);
CREATE INDEX IF NOT EXISTS idx_public_channels_creator_id ON public.public_channels (creator_id);

CREATE TABLE IF NOT EXISTS public.channel_members (
    channel_id TEXT NOT NULL REFERENCES public.public_channels(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (channel_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_channel_members_user ON public.channel_members (user_id);
CREATE INDEX IF NOT EXISTS idx_channel_members_channel_role ON public.channel_members (channel_id, role);

CREATE TABLE IF NOT EXISTS public.channel_posts (
    id TEXT PRIMARY KEY,
    channel_id TEXT NOT NULL REFERENCES public.public_channels(id) ON DELETE CASCADE,
    sender_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    sender_nickname TEXT NOT NULL,
    text TEXT,
    media_type TEXT,
    media_url TEXT,
    media_name TEXT,
    mime TEXT,
    duration INT,
    width INT,
    height INT,
    waveform JSONB,
    audio_metadata JSONB,
    link_preview JSONB,
    reactions JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_channel_posts_channel_created ON public.channel_posts (channel_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_channel_posts_sender_id ON public.channel_posts (sender_id);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.public_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.channel_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.channel_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow select for profiles" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Allow insert for profiles" ON public.profiles FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow update for profiles" ON public.profiles FOR UPDATE USING (true) WITH CHECK (true);

CREATE POLICY "Allow select for public_channels" ON public.public_channels FOR SELECT USING (true);
CREATE POLICY "Allow insert for public_channels" ON public.public_channels FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow update for public_channels" ON public.public_channels FOR UPDATE USING (
    creator_id = auth.uid() OR
    EXISTS (
        SELECT 1 FROM public.channel_members
        WHERE channel_members.channel_id = public_channels.id
        AND channel_members.user_id = auth.uid()
        AND channel_members.role IN ('owner', 'admin')
    )
);
CREATE POLICY "Allow delete for public_channels" ON public.public_channels FOR DELETE USING (
    creator_id = auth.uid() OR
    EXISTS (
        SELECT 1 FROM public.channel_members
        WHERE channel_members.channel_id = public_channels.id
        AND channel_members.user_id = auth.uid()
        AND channel_members.role = 'owner'
    )
);

CREATE POLICY "Allow select for channel_members" ON public.channel_members FOR SELECT USING (true);
CREATE POLICY "Allow insert for channel_members" ON public.channel_members FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow delete for channel_members" ON public.channel_members FOR DELETE USING (
    user_id = auth.uid() OR
    EXISTS (
        SELECT 1 FROM public.channel_members cm
        WHERE cm.channel_id = channel_members.channel_id
        AND cm.user_id = auth.uid()
        AND cm.role = 'owner'
    )
);

CREATE POLICY "Allow select for channel_posts" ON public.channel_posts FOR SELECT USING (true);
CREATE POLICY "Allow insert for channel_posts" ON public.channel_posts FOR INSERT WITH CHECK (
    sender_id = auth.uid() AND
    EXISTS (
        SELECT 1 FROM public.channel_members
        WHERE channel_members.channel_id = channel_posts.channel_id
        AND channel_members.user_id = auth.uid()
        AND channel_members.role IN ('owner', 'admin')
    )
);
CREATE POLICY "Allow update for channel_posts" ON public.channel_posts FOR UPDATE USING (
    sender_id = auth.uid() OR
    EXISTS (
        SELECT 1 FROM public.channel_members
        WHERE channel_members.channel_id = channel_posts.channel_id
        AND channel_members.user_id = auth.uid()
        AND channel_members.role IN ('owner', 'admin')
    )
);
CREATE POLICY "Allow delete for channel_posts" ON public.channel_posts FOR DELETE USING (
    sender_id = auth.uid() OR
    EXISTS (
        SELECT 1 FROM public.channel_members
        WHERE channel_members.channel_id = channel_posts.channel_id
        AND channel_members.user_id = auth.uid()
        AND channel_members.role IN ('owner', 'admin')
    )
);

CREATE TABLE IF NOT EXISTS public.messages (
    id TEXT PRIMARY KEY,
    chat_id TEXT NOT NULL,
    sender_id TEXT NOT NULL,
    recipient_id TEXT NOT NULL,
    ciphertext TEXT NOT NULL,
    message_index INT,
    dh_public_key TEXT,
    prev_chain_count INT,
    delivered BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_recipient_delivered ON public.messages (recipient_id, delivered, created_at);
CREATE INDEX IF NOT EXISTS idx_messages_chat_id ON public.messages (chat_id);

