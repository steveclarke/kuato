/**
 * Profanity redaction for archived transcripts.
 *
 * Runs at sync time, before the row hits Postgres, so the DB never sees
 * the raw words. Intentionally destructive — there's no undo short of
 * re-syncing from a JSONL that still has the originals.
 *
 * Uses `obscenity` with its English preset. Adjust `extraWords` /
 * `allowWords` in this file for project-specific tuning.
 */

import {
  RegExpMatcher,
  TextCensor,
  englishDataset,
  englishRecommendedTransformers,
  pattern,
} from 'obscenity';

/**
 * Words to ALWAYS scrub, beyond obscenity's English preset.
 * Add entries when a word you care about slips through.
 */
const extraWords: string[] = [
  // add additional terms here as lowercase simple strings, e.g. 'frig'
];

/**
 * Words to NEVER scrub, even if the preset matches them.
 * Add entries when a false positive affects legitimate content.
 * Uses obscenity's phrase IDs (the English preset's metadata key).
 */
const allowPhraseIds: string[] = [
  // e.g. 'ass' — often false-positive on 'class', 'assist', etc.
  // obscenity handles word boundaries well so these are rare; leave empty
  // until something actually misfires.
];

// Build a customized dataset once at module load
const dataset = englishDataset;
for (const id of allowPhraseIds) {
  dataset.removePhraseWithId(id);
}
for (const word of extraWords) {
  dataset.addPhrase((p) =>
    p.setMetadata({ originalWord: word }).addPattern(pattern`${word}`)
  );
}

const matcher = new RegExpMatcher({
  ...dataset.build(),
  ...englishRecommendedTransformers,
});

const censor = new TextCensor();

/**
 * Scrub profanity from a single string. Returns the string unchanged
 * if nothing matches, so callers don't need to diff.
 */
export function redactString(input: string): string {
  if (!input) return input;
  const matches = matcher.getAllMatches(input);
  if (matches.length === 0) return input;
  return censor.applyTo(input, matches);
}

/**
 * Walk a parsed-JSON tree and redact every string leaf in place.
 * Returns a new tree — does NOT mutate the input.
 *
 * Used for the `transcript` JSONB column where we store the full
 * parsed-JSONL array. Scrubs user messages, assistant text blocks,
 * tool_result contents, and any other string field — we prefer
 * over-scrubbing to under-scrubbing here.
 */
export function redactTree(node: unknown): unknown {
  if (typeof node === 'string') {
    return redactString(node);
  }
  if (Array.isArray(node)) {
    return node.map(redactTree);
  }
  if (node && typeof node === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      out[k] = redactTree(v);
    }
    return out;
  }
  return node;
}
