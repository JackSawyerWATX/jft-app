import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readingDateLabel } from '../../src/shares/dates';

test('reading calendar dates stay on the same day across local time zones', () => {
  const previous = process.env.TZ;
  try {
    for (const timezone of ['America/Los_Angeles', 'Pacific/Kiritimati']) {
      process.env.TZ = timezone;
      assert.equal(readingDateLabel('2025-04-23'), 'Wednesday, April 23, 2025');
    }
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
});
