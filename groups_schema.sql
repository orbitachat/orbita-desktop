CREATE TABLE IF NOT EXISTS public.groups (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    avatar_url TEXT,
    creator_id TEXT,
    creator_code TEXT,
    creator_nickname TEXT NOT NULL,
    max_members INT DEFAULT 10 CHECK (max_members <= 10),
    members_count INT DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_groups_id ON public.groups (id);
CREATE INDEX IF NOT EXISTS idx_groups_code ON public.groups (code);
CREATE INDEX IF NOT EXISTS idx_groups_creator_code ON public.groups (creator_code);

CREATE TABLE IF NOT EXISTS public.group_members (
    group_id TEXT NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
    user_code TEXT NOT NULL,
    user_id TEXT,
    nickname TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
    avatar_url TEXT,
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    last_seen TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (group_id, user_code)
);

CREATE INDEX IF NOT EXISTS idx_group_members_group_id ON public.group_members (group_id);
CREATE INDEX IF NOT EXISTS idx_group_members_user_code ON public.group_members (user_code);
CREATE INDEX IF NOT EXISTS idx_group_members_role ON public.group_members (group_id, role);

CREATE OR REPLACE FUNCTION check_group_member_limit()
RETURNS TRIGGER AS $$
BEGIN
    IF (SELECT COUNT(*) FROM public.group_members WHERE group_id = NEW.group_id) >= 10 THEN
        RAISE EXCEPTION 'Group is full (max 10 members)';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_check_group_member_limit ON public.group_members;
CREATE TRIGGER trg_check_group_member_limit
BEFORE INSERT ON public.group_members
FOR EACH ROW
EXECUTE FUNCTION check_group_member_limit();

CREATE OR REPLACE FUNCTION update_group_members_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE public.groups
        SET members_count = (SELECT COUNT(*) FROM public.group_members WHERE group_id = NEW.group_id),
            updated_at = NOW()
        WHERE id = NEW.group_id;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE public.groups
        SET members_count = (SELECT COUNT(*) FROM public.group_members WHERE group_id = OLD.group_id),
            updated_at = NOW()
        WHERE id = OLD.group_id;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_group_members_count ON public.group_members;
CREATE TRIGGER trg_update_group_members_count
AFTER INSERT OR DELETE ON public.group_members
FOR EACH ROW
EXECUTE FUNCTION update_group_members_count();

CREATE TABLE IF NOT EXISTS public.group_messages (
    id TEXT PRIMARY KEY,
    group_id TEXT NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
    sender_code TEXT NOT NULL,
    sender_id TEXT,
    sender_nickname TEXT NOT NULL,
    ciphertext TEXT NOT NULL,
    media_type TEXT,
    media_url TEXT,
    media_name TEXT,
    media_key TEXT,
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

CREATE INDEX IF NOT EXISTS idx_group_messages_group_created ON public.group_messages (group_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_group_messages_sender_code ON public.group_messages (sender_code);

CREATE TABLE IF NOT EXISTS public.group_calls (
    group_id TEXT PRIMARY KEY REFERENCES public.groups(id) ON DELETE CASCADE,
    room_name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'ended')),
    host_code TEXT NOT NULL,
    host_nickname TEXT NOT NULL,
    participants_count INT DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_group_calls_status ON public.group_calls (group_id, status);

ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_calls ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all on groups" ON public.groups FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on group_members" ON public.group_members FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on group_messages" ON public.group_messages FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on group_calls" ON public.group_calls FOR ALL USING (true) WITH CHECK (true);
