/** Formats a saved timestamp in the reader's local time zone. */
export function dateLabel(date: string | Date): string {
  const value = typeof date === 'string' ? new Date(date) : date;
  return value.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });
}

/** Formats a reading's calendar date without shifting it to the previous day locally. */
export function readingDateLabel(date: string): string {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC'
  }).format(new Date(`${date}T00:00:00Z`));
}
