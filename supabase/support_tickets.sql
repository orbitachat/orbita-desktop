CREATE TABLE IF NOT EXISTS public.support_tickets (
  id BIGSERIAL PRIMARY KEY,
  ticket_number TEXT NOT NULL UNIQUE,
  user_code TEXT NOT NULL,
  sender_nickname TEXT,
  message_text TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'sent',
  admin_reply TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  answered_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_support_tickets_user_code ON public.support_tickets(user_code);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON public.support_tickets(status);
