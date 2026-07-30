/**
 * Finds where a sentence sits inside the scene text, so the sentence being read
 * aloud can be highlighted while a child follows along.
 *
 * It searches instead of re-joining the sentences because the scene's own
 * whitespace has to survive: the text arrives with paragraph breaks in it, and
 * rebuilding the paragraph from `sentences.join(" ")` would quietly flatten
 * every one of them.
 *
 * Sentences are matched in order, each search starting where the previous match
 * ended, so a sentence repeated in the scene still highlights the right one —
 * which matters here, because this story has a refrain that appears twice.
 */
export function sentenceRange(
  text: string,
  sentences: readonly string[],
  index: number,
): [number, number] | null {
  if (index < 0 || index >= sentences.length) return null;

  let cursor = 0;
  for (let i = 0; i <= index; i++) {
    const at = text.indexOf(sentences[i], cursor);
    // The sentence is not in the text: the scene changed under us. Highlighting
    // the wrong words is worse than highlighting none.
    if (at < 0) return null;

    if (i === index) return [at, at + sentences[i].length];
    cursor = at + sentences[i].length;
  }

  return null;
}
