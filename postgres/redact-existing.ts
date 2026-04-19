#!/usr/bin/env bun
/**
 * One-off: redact profanity in already-stored rows.
 *
 * `sync.ts --force` only covers sessions whose JSONL still exists on the
 * source machine. Rows whose JSONLs have been rotated out by Claude Code
 * stay un-redacted after the redaction feature ships. This script closes
 * that gap by re-scrubbing every row's `user_messages`, `search_text`,
 * and `transcript` in place.
 *
 * Idempotent — redacting twice has no additional effect because the
 * grawlix characters don't match any patterns.
 *
 * Usage:
 *   DATABASE_URL=... bun run postgres/redact-existing.ts
 *   DATABASE_URL=... bun run postgres/redact-existing.ts --dry-run   # report, no writes
 *   DATABASE_URL=... bun run postgres/redact-existing.ts --limit 100 # do N rows then stop
 */

import { parseArgs } from 'util';
import postgres from 'postgres';
import { redactString, redactTree } from '../shared/redact.js';

const DATABASE_URL =
  process.env.DATABASE_URL || 'postgres://localhost/claude_sessions';

const { values } = parseArgs({
  options: {
    'dry-run': { type: 'boolean' },
    limit: { type: 'string' },
  },
});

const dryRun = values['dry-run'] ?? false;
const limit = values.limit ? parseInt(values.limit, 10) : undefined;

const sql = postgres(DATABASE_URL);

async function main() {
  const countResult = await sql`SELECT COUNT(*) AS n FROM sessions`;
  const total = Number(countResult[0].n);
  console.log(`Scanning ${total} session rows${limit ? ` (limit ${limit})` : ''}${dryRun ? ' [dry run]' : ''}`);

  let scanned = 0;
  let changed = 0;
  let page = 0;
  const pageSize = 100;

  while (true) {
    const rows = await sql`
      SELECT id, user_messages, search_text, transcript
      FROM sessions
      ORDER BY started_at
      OFFSET ${page * pageSize}
      LIMIT ${pageSize}
    `;
    if (rows.length === 0) break;

    for (const row of rows) {
      scanned++;
      if (limit && scanned > limit) break;

      const userMessagesOrig = row.user_messages as string[] | null;
      const searchTextOrig = row.search_text as string | null;
      const transcriptOrig = row.transcript as unknown[] | null;

      const userMessagesNew = userMessagesOrig?.map(redactString) ?? null;
      const searchTextNew = searchTextOrig ? redactString(searchTextOrig) : null;
      const transcriptNew = transcriptOrig
        ? (redactTree(transcriptOrig) as unknown[])
        : null;

      const userDiff =
        JSON.stringify(userMessagesOrig) !== JSON.stringify(userMessagesNew);
      const searchDiff = searchTextOrig !== searchTextNew;
      const transcriptDiff =
        JSON.stringify(transcriptOrig) !== JSON.stringify(transcriptNew);

      if (userDiff || searchDiff || transcriptDiff) {
        changed++;
        if (!dryRun) {
          await sql`
            UPDATE sessions
            SET
              user_messages = ${sql.json(userMessagesNew)},
              search_text = ${searchTextNew},
              transcript = ${transcriptNew === null ? null : sql.json(transcriptNew)}
            WHERE id = ${row.id}
          `;
        }
        if (changed % 50 === 0 || changed < 5) {
          console.log(`  ${changed} changed / ${scanned} scanned so far (${row.id})`);
        }
      }
    }

    if (limit && scanned >= limit) break;
    page++;
  }

  console.log('');
  console.log('Done.');
  console.log(`  Scanned: ${scanned}`);
  console.log(`  Changed: ${changed}${dryRun ? ' (would have)' : ''}`);
}

main()
  .catch((err) => {
    console.error('Redaction failed:', err);
    process.exit(1);
  })
  .finally(() => sql.end());
