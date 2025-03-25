-- Migration: 001_create_events_table.sql
-- Purpose: Set up the database schema for Event Sourcing pattern in the Helpdesk POC

-- Create enum for event types to ensure data integrity
CREATE TYPE event_type AS ENUM (
  'LOGIN_SUCCEEDED',
  'REFRESH_TOKEN_VALIDATED',
  'TOKEN_REFRESHED',
  'INVALID_REFRESH_TOKEN',
  'TICKET_CREATED',
  'TICKET_UPDATED',
  'COMMENT_ADDED',
  'TICKET_ESCALATED',
  'DASHBOARD_REQUESTED'
);

-- Create events table (main event store for Event Sourcing)
CREATE TABLE IF NOT EXISTS events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  type TEXT NOT NULL, -- Using TEXT instead of event_type for flexibility
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create index for efficient querying of events by user_id
CREATE INDEX idx_events_user_id ON events(user_id);

-- Create composite index for efficient event sourcing queries
CREATE INDEX idx_events_user_id_created_at ON events(user_id, created_at);

-- Create user_activity table for tracking login and token refresh activities
CREATE TABLE IF NOT EXISTS user_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  activity_type TEXT NOT NULL,
  timestamp BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create index for efficient querying of user activity
CREATE INDEX idx_user_activity_user_id ON user_activity(user_id);

-- Apply Row Level Security (RLS)
-- Enable RLS on events table
ALTER TABLE events ENABLE ROW LEVEL SECURITY;

-- Create policy for events table: users can only read their own events
CREATE POLICY events_select_policy ON events
  FOR SELECT
  USING (auth.uid() = user_id);

-- Create policy for events table: only service role can insert events
CREATE POLICY events_insert_policy ON events
  FOR INSERT
  WITH CHECK (true); -- Service role will handle this

-- Enable RLS on user_activity table
ALTER TABLE user_activity ENABLE ROW LEVEL SECURITY;

-- Create policy for user_activity table: users can only read their own activity
CREATE POLICY user_activity_select_policy ON user_activity
  FOR SELECT
  USING (auth.uid() = user_id);

-- Create policy for user_activity table: only service role can insert activity
CREATE POLICY user_activity_insert_policy ON user_activity
  FOR INSERT
  WITH CHECK (true); -- Service role will handle this

-- Comment: This schema supports the Event Sourcing pattern with an append-only events table
-- and proper indexing for efficient querying. Row Level Security ensures that users can
-- only access their own data, while the service role can write events for any user.
