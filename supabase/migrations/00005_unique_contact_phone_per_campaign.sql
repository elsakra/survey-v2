-- Prevent duplicate phone numbers within the same campaign
CREATE UNIQUE INDEX IF NOT EXISTS contacts_campaign_phone_uniq
  ON contacts (campaign_id, phone);
