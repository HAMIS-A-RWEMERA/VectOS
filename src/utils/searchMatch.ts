/**
 * Checks whether all space-separated tokens in `query` appear anywhere
 * (case-insensitive) across the provided searchable fields.
 * Allows matching middle/end characters, phone digits, SKUs, or multi-word queries.
 */
export function matchesSearch(
  query: string,
  ...fields: Array<string | number | null | undefined>
): boolean {
  const normalizedQuery = String(query || '').trim().toLowerCase();
  if (!normalizedQuery) return true;

  const haystack = fields
    .filter((f) => f !== null && f !== undefined && String(f).trim() !== '')
    .map((f) => String(f).toLowerCase())
    .join(' ');

  if (!haystack) return false;

  const tokens = normalizedQuery.split(/\s+/).filter(Boolean);
  return tokens.every((token) => haystack.includes(token));
}
