/**
 * Formats a saved timestamp as an en-US calendar date in the reader's local time zone.
 * @param date - Valid ISO creation timestamp or Date from a validated share.
 * @returns Month, day, and year. Invalid inputs yield the platform's Invalid Date text;
 * this presentation helper does not replace model validation.
 */
export function dateLabel(date: string | Date): string {
  const value = typeof date === 'string' ? new Date(date) : date;
  return value.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });
}

/**
 * Formats a reading calendar date in UTC so local offsets cannot change its day.
 * @param date - Valid YYYY-MM-DD calendar date from a validated reading snapshot.
 * @returns The en-US weekday, month, day, and year.
 * @throws RangeError when the supplied value cannot be formatted as a date.
 */
export function readingDateLabel(date: string): string {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC'
  }).format(new Date(`${date}T00:00:00Z`));
}
