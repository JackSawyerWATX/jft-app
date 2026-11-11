import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { ShareRepository } from '../../src/shares/server/storage/repository';
import { readPublicShare } from '../../src/shares/server/application/read-public-share';

/** Reusable behavioral checks for memory and DynamoDB; no SDK-specific expectations. */
export async function repositoryContract(repository: ShareRepository) {
  const owner = randomUUID();
  const saved = await repository.create(owner, '  Fictional contract text.  ');
  assert.equal(saved.text, 'Fictional contract text.');
  assert.equal(await repository.findByOwner(saved.id, randomUUID()), null);
  assert.equal(await repository.findById('invalid'), null);
  assert.equal(await repository.findById(randomUUID()), null);
  const history = await repository.listByOwner(owner);
  assert.deepEqual(
    history.map((share) => share.id),
    [saved.id]
  );
  history[0].text = 'History mutation';
  assert.equal(
    (await repository.findById(saved.id))?.text,
    'Fictional contract text.'
  );
  assert.deepEqual(await repository.listByOwner(randomUUID()), []);
  saved.text = 'Mutation';
  const read = await repository.findByOwner(saved.id, owner);
  assert.equal(read?.text, 'Fictional contract text.');
  read!.reflection.title = 'Mutation';
  assert.notEqual(
    (await repository.findById(saved.id))?.reflection.title,
    'Mutation'
  );
  await assert.rejects(repository.create(owner, ' '));
  await assert.rejects(repository.create('invalid', 'Fictional text.'));
  // Legacy TTL metadata is not part of new records: links alone expire.
  assert.equal('expiresAt' in (await repository.findById(saved.id))!, false);
  assert.ok(await readPublicShare(saved.id, repository));
}
