-- 001 — Add hostname column for cross-machine attribution.
--
-- Records which machine a session was synced from. Populated by sync.ts
-- via os.hostname() from that point forward. Existing rows backfilled
-- heuristically from files_touched paths (/Users/steve/* = Mac Studio,
-- /home/steve/* = Arch box 'uber-om').
--
-- Safe to re-run.

ALTER TABLE sessions ADD COLUMN IF NOT EXISTS hostname TEXT;

CREATE INDEX IF NOT EXISTS idx_sessions_hostname ON sessions(hostname);

-- One-time heuristic backfill. Only touches rows where hostname is NULL.
UPDATE sessions
SET hostname = 'uber-om'
WHERE hostname IS NULL
  AND EXISTS (
    SELECT 1 FROM jsonb_array_elements_text(files_touched) f
    WHERE f LIKE '/home/steve/%'
  );

UPDATE sessions
SET hostname = 'mac-studio'
WHERE hostname IS NULL
  AND EXISTS (
    SELECT 1 FROM jsonb_array_elements_text(files_touched) f
    WHERE f LIKE '/Users/steve/%'
  );
