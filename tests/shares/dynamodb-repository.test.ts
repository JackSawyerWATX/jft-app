// Initialize the existing Zod OpenAPI extension before loading shared schemas.
import '@hono/zod-openapi';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import {
  GetCommand,
  PutCommand,
  QueryCommand,
  type DynamoDBDocumentClient
} from '@aws-sdk/lib-dynamodb';
import {
  createShareRepository,
  InMemoryShareRepository,
  shareRepository,
  type ShareRepository
} from '../../src/shares/server/storage/repository';
import { DynamoDbShareRepository } from '../../src/shares/server/storage/dynamodb-repository';
import { SHARE_LIFETIME_SECONDS } from '../../src/shares/server/storage/create-stored-share';
import { readPublicShare } from '../../src/shares/server/application/read-public-share';
import { dispatch } from '../../src/shares/server/app';

/** Injected failure fake; DynamoDB Local covers successful SDK behavior. */
class FailingDynamo {
  commands: (PutCommand | GetCommand | QueryCommand)[] = [];

  client = {
    send: async (command: PutCommand | GetCommand | QueryCommand) => {
      this.commands.push(command);
      throw new Error('Fictional database failure');
    }
  } as unknown as Pick<DynamoDBDocumentClient, 'send'>;

  repository() {
    return new DynamoDbShareRepository('fictional-shares', this.client);
  }
}

test('memory repository contract includes ownership, detached snapshots, ordering, and seven-day expiry', async (t) => {
  let now = 1_800_000_000_000;
  t.mock.method(Date, 'now', () => now);
  const repository: ShareRepository = new InMemoryShareRepository();
  const owner = randomUUID();
  const foreign = randomUUID();
  const first = await repository.create(owner, '  Fictional first thought.  ');
  assert.equal(first.text, 'Fictional first thought.');
  assert.equal(
    first.expiresAt,
    Math.floor(now / 1000) + SHARE_LIFETIME_SECONDS
  );
  now += 2000;
  const second = await repository.create(owner, 'Fictional second thought.');
  await repository.create(foreign, 'Fictional foreign thought.');
  assert.deepEqual(
    (await repository.listByOwner(owner)).map((share) => share.id),
    [second.id, first.id]
  );
  assert.equal(await repository.findByOwner(first.id, foreign), null);
  assert.equal(await repository.findById(randomUUID()), null);
  assert.equal(await repository.findById('invalid'), null);
  first.text = 'Mutation';
  first.reflection.title = 'Mutation';
  const read = await repository.findById(first.id);
  assert.equal(read?.text, 'Fictional first thought.');
  assert.notEqual(read?.reflection.title, 'Mutation');
  const history = await repository.listByOwner(owner);
  history[0].text = 'History mutation';
  assert.equal(
    (await repository.findByOwner(second.id, owner))?.text,
    second.text
  );
  await assert.rejects(repository.create(owner, '   '));
  await assert.rejects(repository.create('invalid', 'Fictional text.'));
  assert.deepEqual(await readPublicShare(second.id, repository), {
    text: second.text,
    reflection: second.reflection
  });

  now = first.expiresAt * 1000 - 1;
  assert.ok(await repository.findById(first.id));
  now += 1;
  assert.equal(await repository.findById(first.id), null);
  assert.equal(await repository.findByOwner(first.id, owner), null);
  assert.equal(await readPublicShare(first.id, repository), null);
  assert.deepEqual(
    (await repository.listByOwner(owner)).map((share) => share.id),
    [second.id]
  );

  now = second.expiresAt * 1000;
  assert.deepEqual(await repository.listByOwner(owner), []);
  now -= SHARE_LIFETIME_SECONDS * 1000;
  assert.equal(await repository.findById(second.id), null);
});

test('memory HTTP paths enforce expiry and preserve the public contract', async (t) => {
  let now = 1_800_000_000_000;
  t.mock.method(Date, 'now', () => now);
  const repository: ShareRepository = new InMemoryShareRepository();
  t.mock.method(shareRepository, 'create', repository.create.bind(repository));
  t.mock.method(
    shareRepository,
    'listByOwner',
    repository.listByOwner.bind(repository)
  );
  t.mock.method(
    shareRepository,
    'findByOwner',
    repository.findByOwner.bind(repository)
  );
  t.mock.method(
    shareRepository,
    'findById',
    repository.findById.bind(repository)
  );
  const response = await dispatch(
    new Request('http://localhost/api/shares', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'Fictional API share.' })
    })
  );
  assert.equal(response.status, 201);
  const saved = await response.json();
  assert.equal('expiresAt' in saved, false);
  assert.equal('ownerId' in saved, false);
  const cookie = response.headers.get('set-cookie')!.split(';')[0];
  const request = (path: string, ownerCookie?: string) =>
    dispatch(
      new Request(`http://localhost${path}`, {
        headers: ownerCookie ? { cookie: ownerCookie } : {}
      })
    );
  assert.equal((await request(`/api/shares/${saved.id}`, cookie)).status, 200);
  assert.equal((await request(`/api/shares/${saved.id}`)).status, 404);
  const publicResponse = await request(`/api/public/shares/${saved.id}`);
  assert.equal(publicResponse.status, 200);
  assert.equal(publicResponse.headers.get('set-cookie'), null);
  assert.deepEqual(await publicResponse.json(), {
    reflection: saved.reflection,
    text: saved.text
  });
  now += SHARE_LIFETIME_SECONDS * 1000;
  assert.equal((await request(`/api/shares/${saved.id}`, cookie)).status, 404);
  assert.equal((await request(`/api/public/shares/${saved.id}`)).status, 404);
  assert.deepEqual(await (await request('/api/shares', cookie)).json(), []);
});

test('DynamoDB failures propagate and HTTP responses redact raw errors', async (t) => {
  const database = new FailingDynamo();
  const repository = database.repository();
  const owner = randomUUID();
  const id = randomUUID();
  await assert.rejects(
    repository.create(owner, 'Fictional failure.'),
    /Fictional database failure/
  );
  await assert.rejects(repository.findById(id), /Fictional database failure/);
  await assert.rejects(
    repository.findByOwner(id, owner),
    /Fictional database failure/
  );
  await assert.rejects(
    repository.listByOwner(owner),
    /Fictional database failure/
  );
  await assert.rejects(
    readPublicShare(id, repository),
    /Fictional database failure/
  );
  t.mock.method(
    shareRepository,
    'findById',
    repository.findById.bind(repository)
  );
  const response = await dispatch(
    new Request(`http://localhost/api/public/shares/${id}`)
  );
  assert.equal(response.status, 500);
  assert.equal(
    (await response.text()).includes('Fictional database failure'),
    false
  );
});

test('persistence selection is explicit and invalid settings fail without falling back', () => {
  assert.ok(createShareRepository({}) instanceof InMemoryShareRepository);
  assert.ok(
    createShareRepository({ SHARE_PERSISTENCE: 'memory' }) instanceof
      InMemoryShareRepository
  );
  assert.throws(
    () => createShareRepository({ SHARE_PERSISTENCE: 'unknown' }),
    /SHARE_PERSISTENCE/
  );
  assert.throws(
    () => createShareRepository({ SHARE_PERSISTENCE: 'dynamodb' }),
    /DYNAMODB_TABLE_NAME/
  );
  assert.throws(
    () =>
      createShareRepository({
        SHARE_PERSISTENCE: 'dynamodb',
        DYNAMODB_TABLE_NAME: 'fictional-shares'
      }),
    /DYNAMODB_REGION/
  );
  assert.ok(
    createShareRepository({
      SHARE_PERSISTENCE: 'dynamodb',
      DYNAMODB_TABLE_NAME: 'fictional-shares',
      DYNAMODB_REGION: 'us-west-2'
    }) instanceof DynamoDbShareRepository
  );
});
