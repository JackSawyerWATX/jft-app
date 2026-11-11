import assert from 'node:assert/strict';
import test from 'node:test';
import { appendTranscript } from '../../../src/shares/transcription/append-transcript';

test('append preserves typed text, separates sessions, and enforces code point limit', () => {
  let draft = appendTranscript('Typed.', ' First.', true).text;
  draft = appendTranscript(draft, 'Second.', false).text;
  assert.equal(draft, 'Typed.\n\nFirst. Second.');
  assert.equal(
    appendTranscript(draft, 'More.', true).text,
    draft + '\n\nMore.'
  );
  assert.equal(
    appendTranscript('Typed.\n\n', 'New.', true).text,
    'Typed.\n\nNew.'
  );
  const full = appendTranscript('🌱'.repeat(9997), 'abcde', false);
  assert.equal(Array.from(full.text).length, 10000);
  assert.equal(full.full, true);
  assert.equal(appendTranscript(full.text, 'More', true).text, full.text);
});

test('verbatim fragments preserve word joins, punctuation, whitespace and Unicode between session boundaries', () => {
  let text = 'Typed.';
  text = appendTranscript(text, ' Hel', true, 'verbatim').text;
  for (const fragment of [
    'lo',
    ',',
    ' ',
    'world',
    '!',
    '\n',
    '今日は',
    'いい日。'
  ]) {
    text = appendTranscript(text, fragment, false, 'verbatim').text;
  }
  assert.equal(text, 'Typed.\n\nHello, world!\n今日はいい日。');
  assert.equal(
    appendTranscript(text, ' Again.', true, 'verbatim').text,
    `${text}\n\nAgain.`
  );
  const full = appendTranscript('🌱'.repeat(9999), '🌱🌱', false, 'verbatim');
  assert.equal(Array.from(full.text).length, 10000);
  assert.equal(full.full, true);
});
