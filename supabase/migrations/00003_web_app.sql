-- Add columns to campaigns for web app
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS user_id uuid;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS calling_hours jsonb DEFAULT '{"timezone":"America/New_York","start":"09:00","end":"17:00","days":[1,2,3,4,5]}';
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS instructions text;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'draft';

CREATE INDEX IF NOT EXISTS campaigns_user_idx ON campaigns(user_id);
CREATE INDEX IF NOT EXISTS campaigns_status_idx ON campaigns(status);

-- Contacts table
CREATE TABLE IF NOT EXISTS contacts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id     uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL,
  phone           text NOT NULL,
  name            text,
  email           text,
  metadata        jsonb DEFAULT '{}',
  status          text NOT NULL DEFAULT 'pending',
  attempts        integer NOT NULL DEFAULT 0,
  max_attempts    integer NOT NULL DEFAULT 3,
  last_attempted_at timestamptz,
  session_id      uuid REFERENCES sessions(id),
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS contacts_campaign_idx ON contacts(campaign_id);
CREATE INDEX IF NOT EXISTS contacts_status_idx ON contacts(status);
CREATE INDEX IF NOT EXISTS contacts_user_idx ON contacts(user_id);

-- Call attempts table
CREATE TABLE IF NOT EXISTS call_attempts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id      uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  campaign_id     uuid NOT NULL REFERENCES campaigns(id),
  attempt_num     integer NOT NULL,
  status          text NOT NULL DEFAULT 'pending',
  call_id         text,
  session_id      uuid REFERENCES sessions(id),
  started_at      timestamptz NOT NULL DEFAULT now(),
  ended_at        timestamptz,
  error           text
);

CREATE INDEX IF NOT EXISTS call_attempts_contact_idx ON call_attempts(contact_id);
CREATE INDEX IF NOT EXISTS call_attempts_campaign_idx ON call_attempts(campaign_id);
