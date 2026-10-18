import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { createShare, parseShares } from '../../src/shares/model';

test('rejects empty shares and trims saved text', () => {
  assert.throws(() => createShare(' \n '));
  const share = createShare('  My thoughts\nare here.  ');
  assert.equal(share.text, 'My thoughts\nare here.');
  assert.notEqual(share.id, createShare('Another thought').id);
  assert.ok(Number.isFinite(Date.parse(share.createdAt)));
});
test('round trips stored shares and orders newest first', () => {
  const first = {
    ...createShare('Earlier'),
    createdAt: '2025-04-22T12:00:00Z'
  };
  const second = { ...createShare('Later'), createdAt: '2025-04-23T12:00:00Z' };
  assert.deepEqual(parseShares(JSON.stringify([first, second])), [
    second,
    first
  ]);
  assert.deepEqual(parseShares(null), []);
});
test('rejects malformed storage instead of silently discarding history', () => {
  for (const raw of [
    '{',
    '{}',
    '[null]',
    '[{"text":"hello"}]',
    JSON.stringify([{ ...createShare('Valid'), createdAt: 'invalid' }])
  ]) {
    assert.throws(() => parseShares(raw));
  }
});

test('rejects records outside the saved share contract', () => {
  const share = createShare('A fictional thought.');
  const invalid = [
    { ...share, id: 'not-a-uuid' },
    { ...share, createdAt: '2025-04-23' },
    { ...share, kind: 'audio' },
    { ...share, text: ' \n ' },
    { ...share, reflection: { ...share.reflection, title: '' } },
    { ...share, reflection: { ...share.reflection, date: '2025-02-30' } }
  ];
  for (const value of invalid)
    assert.throws(() => parseShares(JSON.stringify([value])));
});

test('preserves unknown fields while validating stored records', () => {
  const share = {
    ...createShare('A fictional thought.'),
    futureMetadata: { source: 'example' }
  };
  assert.deepEqual(parseShares(JSON.stringify([share])), [share]);
});

test('reads the fixed v1 storage fixture independently of the current record creator', () => {
  const shares = parseShares(
    readFileSync('tests/fixtures/shares-v1.json', 'utf8')
  );
  assert.equal(shares.length, 1);
  assert.equal(shares[0].createdAt, '2025-04-23T12:34:56.000Z');
  assert.equal(
    shares[0].reflection.body,
    'A fictional reading snapshot from the first storage format.'
  );
  assert.equal(shares[0].text, 'A fictional saved share.\nOne step at a time.');
});
