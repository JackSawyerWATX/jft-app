import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createShare, STORAGE_KEY } from '../../src/shares/model';
import { readShares, saveShare } from '../../src/shares/storage';

test('re-reads history before saving so sequential writers retain prior shares', () => {
  let value: string | null = null;
  const storage = {
    getItem: () => value,
    setItem: (_key: string, next: string) => {
      value = next;
    }
  };
  const first = saveShare(storage, 'First fictional thought.');
  const second = saveShare(storage, 'Second fictional thought.');
  assert.deepEqual(readShares(storage), [second.share, first.share]);
});

test('never writes over unreadable history', () => {
  let writes = 0;
  const storage = {
    getItem: () => '{broken',
    setItem: () => {
      writes++;
    }
  };
  assert.throws(() => saveShare(storage, 'Fictional draft.'));
  assert.equal(writes, 0);
});

test('propagates unavailable storage and quota errors instead of returning success', () => {
  const unavailable = {
    getItem: () => {
      throw new Error('Unavailable');
    },
    setItem: () => {}
  };
  assert.throws(() => readShares(unavailable), /Unavailable/);
  const full = {
    getItem: () => null,
    setItem: () => {
      throw new Error('Full');
    }
  };
  assert.throws(() => saveShare(full, 'Fictional draft.'), /Full/);
});

test('appending a share preserves older records and their unknown metadata', () => {
  const original = {
    ...createShare('An older fictional thought.'),
    futureMetadata: { source: 'example' },
    reflection: { ...createShare('Example').reflection, edition: 'example' }
  };
  let value = JSON.stringify([original]);
  const storage = {
    getItem: (key: string) => {
      assert.equal(key, STORAGE_KEY);
      return value;
    },
    setItem: (key: string, next: string) => {
      assert.equal(key, STORAGE_KEY);
      value = next;
    }
  };
  const { share } = saveShare(storage, 'A new fictional thought.');
  assert.deepEqual(readShares(storage), [share, original]);
});
