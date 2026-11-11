import '@hono/zod-openapi';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import {
  QueryCommand,
  type DynamoDBDocumentClient
} from '@aws-sdk/lib-dynamodb';
import { InMemoryShareRepository } from '../../src/shares/server/storage/memory-repository';
import { DynamoDbShareRepository } from '../../src/shares/server/storage/dynamodb-repository';
import { createStoredShare } from '../../src/shares/server/storage/create-stored-share';
import { shareRepository } from '../../src/shares/server/storage/configured-repository';
import { dispatch } from '../../src/shares/server/app';
import { repositoryContract } from './repository-contract';

test('bounded memory pages traverse timestamp ties once and cannot reveal another owner', async (t) => {
  t.mock.method(Date, 'now', () => 1_800_000_000_000);
  const repository = new InMemoryShareRepository();
  const owner = randomUUID();
  const foreign = randomUUID();
  const saved = [];
  for (let index = 0; index < 7; index++)
    saved.push(await repository.create(owner, `Fictional page ${index}.`));
  assert.equal(new Set(saved.map((share) => share.createdAt)).size, 1);
  await repository.create(foreign, 'Fictional foreign share.');
  const ids: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await repository.listByOwner(owner, { limit: 2, cursor });
    assert.ok(page.shares.length <= 2);
    ids.push(...page.shares.map((share) => share.id));
    cursor = page.nextCursor ?? undefined;
  } while (cursor);
  assert.equal(ids.length, 7);
  assert.equal(new Set(ids).size, 7);
  assert.deepEqual(new Set(ids), new Set(saved.map((share) => share.id)));
  const first = await repository.listByOwner(owner, { limit: 1 });
  assert.deepEqual(
    (await repository.listByOwner(foreign, { cursor: first.nextCursor! }))
      .shares,
    []
  );
  await assert.rejects(repository.listByOwner(owner, { cursor: 'invalid' }));
  await assert.rejects(repository.listByOwner(owner, { limit: 51 }));
});

test('shared contract tolerates delayed GSI history without weakening detail assertions', async (t) => {
  const repository = new InMemoryShareRepository();
  const read = repository.listByOwner.bind(repository);
  let attempts = 0;
  t.mock.method(
    repository,
    'listByOwner',
    async (...args: Parameters<typeof read>) => {
      attempts++;
      return attempts < 3 ? { shares: [], nextCursor: null } : read(...args);
    }
  );
  await repositoryContract(repository);
  assert.ok(attempts >= 3);
});

test('history HTTP rejects invalid queries before storage and advertises an explicit next cursor', async (t) => {
  const store = new InMemoryShareRepository();
  t.mock.method(shareRepository, 'create', store.create.bind(store));
  const list = t.mock.method(
    shareRepository,
    'listByOwner',
    store.listByOwner.bind(store)
  );
  const first = await dispatch(new Request('http://localhost/api/shares'));
  const cookie = first.headers.get('set-cookie')!.split(';')[0];
  for (let index = 0; index < 3; index++) {
    await dispatch(
      new Request('http://localhost/api/shares', {
        method: 'POST',
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({ text: `Fictional HTTP page ${index}.` })
      })
    );
  }
  const request = (query: string) =>
    dispatch(
      new Request(`http://localhost/api/shares${query}`, {
        headers: { cookie }
      })
    );
  const before = list.mock.callCount();
  for (const query of [
    '?limit=0',
    '?limit=51',
    '?limit=abc',
    '?cursor=invalid'
  ]) {
    const response = await request(query);
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error.code, 'INVALID_HISTORY_QUERY');
  }
  assert.equal(list.mock.callCount(), before);
  const page = await request('?limit=2');
  assert.equal((await page.json()).length, 2);
  const cursor = page.headers.get('X-Next-Cursor');
  assert.ok(cursor);
  const next = await request(`?limit=2&cursor=${encodeURIComponent(cursor)}`);
  assert.equal((await next.json()).length, 1);
  assert.equal(next.headers.get('X-Next-Cursor'), null);
});

test('later-page database failure is a sanitized HTTP failure, never a successful partial page', async (t) => {
  const stored = createStoredShare(
    randomUUID(),
    'Fictional first database page.'
  );
  let calls = 0;
  const repository = new DynamoDbShareRepository('fictional-shares', {
    send: async (command: QueryCommand) => {
      assert.ok(command instanceof QueryCommand);
      calls++;
      if (calls > 1) {
        assert.equal(command.input.ExclusiveStartKey?.id, stored.id);
        // Cursor position cannot choose the owner partition.
        assert.equal(
          command.input.ExclusiveStartKey?.ownerId,
          command.input.ExpressionAttributeValues?.[':owner']
        );
        throw new Error('Fictional raw database failure');
      }
      return {
        Items: [stored],
        LastEvaluatedKey: {
          id: stored.id,
          createdAt: stored.createdAt,
          ownerId: stored.ownerId
        }
      };
    }
  } as unknown as Pick<DynamoDBDocumentClient, 'send'>);
  t.mock.method(
    shareRepository,
    'listByOwner',
    repository.listByOwner.bind(repository)
  );
  const first = await dispatch(new Request('http://localhost/api/shares'));
  assert.equal(first.status, 200);
  const cookie = first.headers.get('set-cookie')!.split(';')[0];
  const cursor = first.headers.get('X-Next-Cursor')!;
  const failed = await dispatch(
    new Request(
      `http://localhost/api/shares?cursor=${encodeURIComponent(cursor)}`,
      { headers: { cookie } }
    )
  );
  assert.equal(failed.status, 500);
  const body = await failed.json();
  assert.equal(body.error.code, 'INTERNAL_ERROR');
  assert.equal(JSON.stringify(body).includes('raw database'), false);
  assert.equal(failed.headers.get('X-Next-Cursor'), null);
});
