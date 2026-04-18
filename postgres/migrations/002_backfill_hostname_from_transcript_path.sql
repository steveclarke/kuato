-- 002 — Backfill hostname from transcript_path for any rows 001 missed.
--
-- Migration 001 backfilled hostname from files_touched, but many rows have
-- an empty files_touched array. transcript_path is always set and is a
-- reliable signal for the source machine's filesystem convention:
--
--   /Users/<name>/.claude/projects/... → macOS machine
--   /home/<name>/.claude/projects/...  → Linux machine
--
-- Hostnames match what os.hostname() returns on each machine:
--   macstudio.home (Mac Studio), uber-om (Arch)
-- Adjust the mapping below if more machines join.
--
-- Safe to re-run. Only touches rows where hostname IS NULL.

UPDATE sessions
SET hostname = 'macstudio.home'
WHERE hostname IS NULL
  AND transcript_path LIKE '/Users/steve/%';

UPDATE sessions
SET hostname = 'uber-om'
WHERE hostname IS NULL
  AND transcript_path LIKE '/home/steve/%';
