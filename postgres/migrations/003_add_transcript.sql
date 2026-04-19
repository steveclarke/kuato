-- 003 — Add full transcript archival column.
--
-- Stores every parsed JSONL line of a session as a JSONB array so the DB
-- becomes the source of truth for full transcripts, not just a searchable
-- index. Original design pointed `transcript_path` at the local JSONL and
-- read it on demand for `?with_transcript=true`. That breaks when Claude
-- Code's `cleanupPeriodDays` rotates the files out or the source machine
-- is retired (see the 'ubu' one-time import from 2026-04-18).
--
-- Column is nullable — existing rows stay summary-only until a `--force`
-- re-sync on their source machine captures the transcript (if the JSONL
-- still exists).
--
-- Safe to re-run.

ALTER TABLE sessions ADD COLUMN IF NOT EXISTS transcript JSONB;
