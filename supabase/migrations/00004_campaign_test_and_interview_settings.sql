-- Campaign-level interview settings + test progression state
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS max_duration_sec integer NOT NULL DEFAULT 420;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS opening_sentence text;

-- Web test progression flags
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS test_completed_at timestamptz;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS test_skipped_at timestamptz;

