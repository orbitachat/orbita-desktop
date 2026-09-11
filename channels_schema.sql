-- =======================================================
-- ORBITA MESSENGER - PUBLIC CHANNELS / COMMUNITIES SCHEMA
-- =======================================================

-- 1. Таблица публичных каналов (Сообществ)
CREATE TABLE IF NOT EXISTS public.public_channels (
    id TEXT PRIMARY KEY, -- 36-значный статический UUID/ключ канала
    name TEXT NOT NULL,
    description TEXT,
    avatar_url TEXT,
    creator_nickname TEXT NOT NULL,
    subscribers_count INT DEFAULT 1,
    is_official BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Индекс по id канала
CREATE INDEX IF NOT EXISTS idx_public_channels_id ON public.public_channels (id);

-- 2. Таблица постов публичных каналов
CREATE TABLE IF NOT EXISTS public.channel_posts (
    id TEXT PRIMARY KEY,
    channel_id TEXT NOT NULL REFERENCES public.public_channels(id) ON DELETE CASCADE,
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

-- Индекс для быстрой загрузки постов канала по дате
CREATE INDEX IF NOT EXISTS idx_channel_posts_channel_created ON public.channel_posts (channel_id, created_at DESC);

-- 3. Включение Row Level Security (RLS)
ALTER TABLE public.public_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.channel_posts ENABLE ROW LEVEL SECURITY;

-- 4. Политики свободного чтения и создания для анонимных/клиентских запросов
CREATE POLICY "Allow select for public_channels" ON public.public_channels FOR SELECT USING (true);
CREATE POLICY "Allow all for public_channels" ON public.public_channels FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow select for channel_posts" ON public.channel_posts FOR SELECT USING (true);
CREATE POLICY "Allow all for channel_posts" ON public.channel_posts FOR ALL USING (true) WITH CHECK (true);
