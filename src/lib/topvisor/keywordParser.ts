// Keyword-list parser shared by the setup wizard and the "add keywords" flow.
// Non-destructive by design: normalizes whitespace, drops empty lines, finds EXACT
// duplicates, and rejects only clearly-invalid entries (too long). It never strips
// special characters and never changes the displayed case of a phrase.

export interface ParsedKeywords {
  valid: string[]; // deduped, order-preserved, original case
  duplicates: number; // how many exact duplicates were collapsed
  rejected: { value: string; reason: RejectReason }[];
  total: number; // non-empty candidates seen (before dedupe/reject)
}

export type RejectReason = "too_long";

// Topvisor keyword length cap (mirrors the existing app convention of ≤200 chars).
export const MAX_KEYWORD_LENGTH = 200;

export interface ParseOptions {
  /** Also split on commas (default: split on newlines only). */
  commaMode?: boolean;
  maxLength?: number;
}

function normalizeWhitespace(s: string): string {
  // Collapse runs of any whitespace (incl. tabs / non-breaking spaces) to one space.
  return s.replace(/[\s ]+/g, " ").trim();
}

export function parseKeywords(input: string, opts: ParseOptions = {}): ParsedKeywords {
  const maxLength = opts.maxLength ?? MAX_KEYWORD_LENGTH;
  const rawText = String(input ?? "");

  // Always split on newlines; optionally also on commas (opt-in second mode).
  const rawParts = opts.commaMode ? rawText.split(/[\r\n,]+/) : rawText.split(/[\r\n]+/);

  const valid: string[] = [];
  const rejected: { value: string; reason: RejectReason }[] = [];
  const seen = new Set<string>(); // case-insensitive exact-duplicate detection
  let duplicates = 0;
  let total = 0;

  for (const part of rawParts) {
    const phrase = normalizeWhitespace(part);
    if (!phrase) continue; // drop empty lines silently
    total++;

    if (phrase.length > maxLength) {
      rejected.push({ value: phrase, reason: "too_long" });
      continue;
    }

    const dedupeKey = phrase.toLowerCase();
    if (seen.has(dedupeKey)) {
      duplicates++;
      continue;
    }
    seen.add(dedupeKey);
    valid.push(phrase); // keep original case & characters
  }

  return { valid, duplicates, rejected, total };
}

/** Build the CSV payload Topvisor's keywords/import expects (header row + phrases). */
export function toImportPayload(keywords: string[], groupName = "Основная"): string {
  const escape = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const header = "name;group_name";
  const rows = keywords.map((k) => `${escape(k)};${escape(groupName)}`);
  return [header, ...rows].join("\n");
}
