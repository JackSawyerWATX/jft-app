'use client';

import { useId, useState } from 'react';

const previewLength = 240;
const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

/** Shows a short text preview; expansion stays local and never makes a request. */
export function ThoughtsText({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const id = useId();
  const characters = Array.from(
    segmenter.segment(text),
    ({ segment }) => segment
  );
  const truncated = characters.length > previewLength;
  const content =
    truncated && !expanded
      ? `${characters.slice(0, previewLength).join('').trimEnd()}...`
      : text;
  return (
    <div className="mt-3">
      <p
        id={id}
        className="whitespace-pre-wrap break-words font-serif text-xl leading-relaxed"
      >
        {content}
      </p>
      {truncated && (
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={id}
          className="mt-2 min-h-11 text-sm underline underline-offset-4"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? 'Show less' : 'Read more'}
        </button>
      )}
    </div>
  );
}
