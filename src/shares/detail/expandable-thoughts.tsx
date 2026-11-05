'use client';

import { useId, useState } from 'react';
import { ThoughtsText } from './thoughts-text';

const PREVIEW_LENGTH = 300;

/** Owner-only preview; recipient pages render ThoughtsText directly in full. */
export function ExpandableThoughts({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const id = useId();
  const characters = Array.from(text);
  const long = characters.length > PREVIEW_LENGTH;
  const preview = long
    ? `${characters.slice(0, PREVIEW_LENGTH).join('').trimEnd()}…`
    : text;
  return (
    <>
      <div id={id}>
        <ThoughtsText text={expanded ? text : preview} />
      </div>
      {long && (
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={id}
          className="mt-3 min-h-11 text-sm font-semibold underline underline-offset-4"
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? 'Show less' : 'Read more'}
        </button>
      )}
    </>
  );
}
