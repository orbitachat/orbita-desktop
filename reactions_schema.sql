-- =======================================================
-- ORBITA MESSENGER - EMOJI REACTIONS DATABASE SCHEMA
-- =======================================================

-- 1. Таблица реакций на сообщения (Рекомендуемый подход)
CREATE TABLE IF NOT EXISTS public.message_reactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chat_id TEXT NOT NULL,
    message_id TEXT NOT NULL,
    emoji TEXT NOT NULL,
    user_id TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_user_message_emoji UNIQUE(chat_id, message_id, user_id, emoji)
);

-- Индексы для обеспечения высокой производительности при поиске
CREATE INDEX IF NOT EXISTS idx_message_reactions_chat_msg 
ON public.message_reactions (chat_id, message_id);

-- Включение Row Level Security (RLS)
ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;

-- Политики доступа RLS
CREATE POLICY "Allow select for all users"
ON public.message_reactions FOR SELECT USING (true);

CREATE POLICY "Allow insert/delete for all users"
ON public.message_reactions FOR ALL USING (true) WITH CHECK (true);


-- 2. Альтернативный вариант (Добавление JSONB колонки в существующую таблицу messages)
-- ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS reactions JSONB DEFAULT '{}'::jsonb;
