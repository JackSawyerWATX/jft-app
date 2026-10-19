import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { InMemoryShareRepository } from '../../src/shares/server/repository';
import { createStoredShare } from '../../src/shares/server/create-stored-share';
import { reflection } from '../../src/shares/reflection-fixture';

test('repository instances isolate data, reject invalid writes, and detach every read', async () => {
  const first = new InMemoryShareRepository();
  const second = new InMemoryShareRepository();
  const owner = randomUUID();
  const saved = await first.create(owner, 'A fictional isolated record.');
  assert.deepEqual(await second.listByOwner(owner), []);
  assert.equal(await second.findByOwner(saved.id, owner), null);
  await assert.rejects(first.create(owner, '   '));
  await assert.rejects(first.create('not-an-owner-uuid', 'Fictional text.'));
  const listed = await first.listByOwner(owner);
  assert.equal(listed.length, 1);
  listed[0].reflection.title = 'Changed list snapshot';
  const found = await first.findByOwner(saved.id, owner);
  assert.ok(found);
  assert.equal(found.reflection.title, reflection.title);
  found.text = 'Changed detail snapshot';
  assert.equal((await first.findByOwner(saved.id, owner))?.text, saved.text);
  assert.equal(await first.findByOwner(saved.id, randomUUID()), null);
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
