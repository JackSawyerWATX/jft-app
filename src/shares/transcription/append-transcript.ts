import { MAX_SHARE_TEXT_LENGTH } from '../model';

/** Append a final segment without rewriting typed whitespace; count Unicode code points. */
export function appendTranscript(
  draft: string,
  segment: string,
  newParagraph: boolean
) {
  const words = segment.trim();
  const separator =
    !draft || /\s$/.test(draft) ? '' : newParagraph ? '\n\n' : ' ';
  const remaining = Math.max(
    0,
    MAX_SHARE_TEXT_LENGTH - Array.from(draft).length
  );
  const addition = words ? Array.from(separator + words) : [];
  return {
    text: draft + addition.slice(0, remaining).join(''),
    full: addition.length >= remaining
  };
}
