import { useEffect, useState } from 'react';

const MILLISECONDS_PER_SECOND = 1_000;
const SECONDS_PER_MINUTE = 60;

/** Count time spent listening in this editor view, retaining the count while paused. */
export function ListeningClock({ listening }: { listening: boolean }) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (!listening) return;
    const timer = setInterval(
      () => setSeconds((value) => value + 1),
      MILLISECONDS_PER_SECOND
    );
    return () => clearInterval(timer);
  }, [listening]);
  const minutes = Math.floor(seconds / SECONDS_PER_MINUTE);
  const remainingSeconds = seconds % SECONDS_PER_MINUTE;
  return (
    <p className="listening-clock" aria-label="Listening time">
      {String(minutes).padStart(2, '0')}:
      {String(remainingSeconds).padStart(2, '0')}
    </p>
  );
}
