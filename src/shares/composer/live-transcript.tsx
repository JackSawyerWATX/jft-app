import { useCallback, useEffect, useRef } from 'react';
import TextareaAutosize from 'react-textarea-autosize';

// Within roughly one line of the bottom, new words resume automatic following.
const FOLLOW_THRESHOLD_PX = 32;

type LiveTranscriptProps = {
  text: string;
  interim: string;
  onTextChange: (text: string) => void;
  readOnly: boolean;
  errorId?: string;
};

/** Follow new words inside the prompter, without moving the page or overriding scrollback. */
export function LiveTranscript({
  text,
  interim,
  onTextChange,
  readOnly,
  errorId
}: LiveTranscriptProps) {
  const viewport = useRef<HTMLDivElement>(null);
  const following = useRef(true);
  const followNewWords = useCallback(() => {
    const element = viewport.current;
    if (element && following.current) element.scrollTop = element.scrollHeight;
  }, []);
  useEffect(() => {
    followNewWords();
  }, [text, interim, followNewWords]);
  return (
    <div className="transcript-wrap">
      <div
        ref={viewport}
        role="region"
        aria-label="Live share transcript"
        tabIndex={0}
        className="live-transcript"
        onScroll={(event) => {
          const element = event.currentTarget;
          following.current =
            element.scrollHeight - element.scrollTop - element.clientHeight <
            FOLLOW_THRESHOLD_PX;
        }}
      >
        <TextareaAutosize
          onHeightChange={followNewWords}
          aria-label="Your share"
          aria-describedby={errorId}
          value={text}
          readOnly={readOnly}
          onChange={(event) => onTextChange(event.target.value)}
          className="transcript-input"
          placeholder="Speak to begin..."
          minRows={1}
        />
        {interim && (
          <p className="transcript-interim">
            <span className="sr-only">Still recognizing: </span>
            {interim}
          </p>
        )}
      </div>
    </div>
  );
}
