-- Create extension for UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Create events table
CREATE TABLE IF NOT EXISTS public.events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL, 
  type TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for faster queries by email
CREATE INDEX IF NOT EXISTS idx_events_email ON public.events(email);
-- Create index for faster queries by type
CREATE INDEX IF NOT EXISTS idx_events_type ON public.events(type);
-- Create composite index for efficient event sourcing queries
CREATE INDEX IF NOT EXISTS idx_events_email_created_at ON public.events(email, created_at);

-- Create user activity table for tracking authentication events
CREATE TABLE IF NOT EXISTS public.user_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL, 
  activity_type TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for faster queries by email
CREATE INDEX IF NOT EXISTS idx_user_activity_email ON public.user_activity(email);


CREATE INDEX IF NOT EXISTS idx_user_activity_type ON public.user_activity(activity_type);

-- Apply Row Level Security (RLS) to enforce data segregation by email
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

-- Create policy for events table: users can only read their own events
CREATE POLICY events_select_policy ON public.events
  FOR SELECT
  USING (auth.email()::text = email);
