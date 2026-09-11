CREATE TABLE IF NOT EXISTS public.support_admins (
  user_code TEXT PRIMARY KEY,
  role TEXT NOT NULL DEFAULT 'admin',
  auth_token TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.support_admins (user_code, role)
VALUES ('W8C17R1XDS3D3GCJGCT7P8A5G5WMIK6TGFG4', 'superadmin')
ON CONFLICT (user_code) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.support_tickets (
  id BIGSERIAL PRIMARY KEY,
  ticket_number TEXT NOT NULL UNIQUE,
  user_code TEXT NOT NULL,
  sender_nickname TEXT,
  message_text TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'sent',
  admin_reply TEXT,
  admin_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  answered_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_support_tickets_user_code ON public.support_tickets(user_code);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON public.support_tickets(status);
CREATE INDEX IF NOT EXISTS idx_support_tickets_created_at ON public.support_tickets(created_at DESC);

ALTER TABLE public.support_admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow service role full access to support_admins" ON public.support_admins
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Allow public read of support_admins" ON public.support_admins
  FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "Allow service role full access to support_tickets" ON public.support_tickets
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Allow public all access to support_tickets" ON public.support_tickets
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
