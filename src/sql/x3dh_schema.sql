-- 1. Таблица для постоянных ключей (Identity Key, Signed PreKey и Подпись)
CREATE TABLE public.user_public_keys (
    user_code UUID PRIMARY KEY, -- Или TEXT, в зависимости от типа user_code
    identity_key TEXT NOT NULL,
    identity_signing_key TEXT,
    signed_pre_key TEXT NOT NULL,
    pre_key_signature TEXT NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Таблица для одноразовых ключей (One-Time PreKeys)
CREATE TABLE public.one_time_pre_keys (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_code UUID NOT NULL, -- Или TEXT
    key_id INTEGER NOT NULL,
    public_key TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_otpk_user_code ON public.one_time_pre_keys (user_code);

-- 3. Политики безопасности (RLS)
ALTER TABLE public.user_public_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.one_time_pre_keys ENABLE ROW LEVEL SECURITY;

-- Любой может читать публичные ключи
CREATE POLICY "Public keys are viewable by everyone" ON public.user_public_keys FOR SELECT USING (true);
CREATE POLICY "One-time keys are viewable by everyone" ON public.one_time_pre_keys FOR SELECT USING (true);

-- (Опционально) Добавьте политики на INSERT/UPDATE/DELETE, если у вас настроена аутентификация через Supabase Auth
-- CREATE POLICY "Users can insert their own keys" ON public.user_public_keys FOR ALL USING (auth.uid() = user_code);
-- ... (настройте по вашей логике аутентификации)

-- 4. RPC функция для безопасного захвата и удаления One-Time PreKey (чтобы избежать race conditions)
CREATE OR REPLACE FUNCTION consume_one_time_pre_key(p_user_code UUID) -- Или TEXT
RETURNS JSON AS $$
DECLARE
    v_key RECORD;
BEGIN
    SELECT id, key_id, public_key INTO v_key
    FROM public.one_time_pre_keys
    WHERE user_code = p_user_code
    ORDER BY created_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED;

    IF FOUND THEN
        DELETE FROM public.one_time_pre_keys WHERE id = v_key.id;
        RETURN json_build_object(
            'id', v_key.id,
            'keyId', v_key.key_id,
            'publicKey', v_key.public_key
        );
    ELSE
        RETURN NULL;
    END IF;
END;
$$ LANGUAGE plpgsql;
