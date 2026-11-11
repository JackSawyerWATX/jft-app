import { MAX_SHARE_TEXT_LENGTH } from '../model';
import type { TranscriptJoin } from './types';

/** Append a final segment without rewriting typed whitespace; count Unicode code points. */
export function appendTranscript(
  draft: string,
  segment: string,
  newParagraph: boolean,
  join: TranscriptJoin = 'space'
) {
  const words =
    join === 'space'
      ? segment.trim()
      : newParagraph
        ? segment.trimStart()
        : segment;
  let separator = '';
  if (draft && draft.at(-1)?.trim()) {
    if (newParagraph) separator = '\n\n';
    else if (join === 'space') separator = ' ';
  }
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
