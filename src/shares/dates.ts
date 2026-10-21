/** Saved timestamps use the reader's local time zone. */
export function dateLabel(date: string | Date): string {
  const value = typeof date === 'string' ? new Date(date) : date;
  return value.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });
}

/** Reading dates use UTC so local offsets cannot change the calendar day. */
export function readingDateLabel(date: string): string {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC'
  }).format(new Date(`${date}T00:00:00Z`));
}
