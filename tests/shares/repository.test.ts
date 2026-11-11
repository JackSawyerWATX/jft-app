import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { InMemoryShareRepository } from '../../src/shares/server/storage/memory-repository';
import { createStoredShare } from '../../src/shares/server/storage/create-stored-share';
import { reflection } from '../../src/shares/reflection/reflection-fixture';

test('memory repository instances isolate records', async () => {
  const owner = randomUUID();
  const first = new InMemoryShareRepository();
  const second = new InMemoryShareRepository();
  const saved = await first.create(owner, 'Fictional isolated record.');
  assert.deepEqual((await second.listByOwner(owner)).shares, []);
  assert.equal(await second.findByOwner(saved.id, owner), null);
});

test('share construction validates metadata and captures a detached reading without persisting', () => {
  const owner = randomUUID();
  const start = Date.now();
  const share = createStoredShare(
    owner,
    '  A fictional constructed thought.  '
  );
  assert.equal(share.ownerId, owner);
  assert.equal(share.text, 'A fictional constructed thought.');
  assert.ok(Date.parse(share.createdAt) >= start);
  assert.ok(Date.parse(share.createdAt) <= Date.now());
  assert.deepEqual(share.reflection, reflection);
  share.reflection.title = 'Changed constructed snapshot';
  assert.notEqual(share.reflection.title, reflection.title);
  assert.throws(() => createStoredShare(owner, '  '));
});

import { repositoryContract } from './repository-contract';
test('memory satisfies the shared repository contract', () =>
  repositoryContract(new InMemoryShareRepository()));
