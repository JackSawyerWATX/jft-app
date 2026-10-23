import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createShareSchema, shareSchema } from '../../src/shares/model';
import { reflection } from '../../src/shares/reflection/reflection-fixture';

test('accepts and trims text; rejects blank, malformed and client metadata', () => {
  assert.deepEqual(
    createShareSchema.parse({ text: '  A fictional thought.\n ' }),
    { text: 'A fictional thought.' }
  );
  for (const input of [
    null,
    {},
    { text: '' },
    { text: ' \n ' },
    { text: 42 },
    { text: 'ok', ownerId: 'forged' },
    { text: 'ok', id: crypto.randomUUID() },
    { text: 'ok', createdAt: new Date().toISOString() },
    { text: 'ok', reflection }
  ]) {
    assert.equal(createShareSchema.safeParse(input).success, false);
  }
});

test('validates saved share contracts and omits server ownership', () => {
  const share = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    kind: 'text',
    text: 'Fictional thought.',
    shareUrl: `/s/${crypto.randomUUID()}`,
    reflection
  };
  assert.deepEqual(
    shareSchema.parse({ ...share, ownerId: crypto.randomUUID() }),
    share
  );
  for (const input of [
    { ...share, id: 'invalid' },
    { ...share, createdAt: '2025-01-01' },
    { ...share, kind: 'audio' },
    { ...share, text: ' ' },
    { ...share, reflection: { ...reflection, date: '2025-02-30' } }
  ]) {
    assert.equal(shareSchema.safeParse(input).success, false);
  }
});
