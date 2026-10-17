// Word matching, as the server does it (_is_target_variant in migration 005, _same_word in
// migration 024), so a Knower hears about an off-limits word at once. The server still
// decides.

/** Whether `word` is `target` or a simple form of it (plural, -ing, -ed, -er…). */
function isFormOf(word: string, target: string): boolean {
  const w = word.trim().toLowerCase();
  const t = target.trim().toLowerCase();
  return (
    w === t ||
    [
      `${t}s`, `${t}es`, `${t}ing`, `${t}ed`, `${t}er`, `${t}ers`,
      t.replace(/e$/, 'ing'), t.replace(/e$/, 'ed'),
      t.replace(/y$/, 'ies'), t.replace(/y$/, 'ied'),
    ].includes(w)
  );
}

/** Whether two words are the same word or simple forms of each other, either way round. */
export function sameWord(a: string, b: string): boolean {
  return isFormOf(a, b) || isFormOf(b, a);
}

/** The off-limits word `word` runs into, if any. */
export function offLimitsMatch(word: string, offLimits: readonly string[]): string | null {
  return offLimits.find((f) => sameWord(word, f)) ?? null;
}
