import '@hono/zod-openapi';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  CreateTableCommand,
  DeleteTableCommand,
  DynamoDBClient,
  waitUntilTableExists
} from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { test } from 'node:test';
import { dispatch } from '../../src/shares/server/app';
import { shareRepository } from '../../src/shares/server/storage/configured-repository';
import { repositoryContract } from './repository-contract';
import { DynamoDbShareRepository } from '../../src/shares/server/storage/dynamodb-repository';
import { createStoredShare } from '../../src/shares/server/storage/create-stored-share';

const endpoint = process.env.DYNAMODB_LOCAL_ENDPOINT;

test(
  'DynamoDB Local applies repository contract, ordering, pagination, and conditional writes',
  { skip: !endpoint },
  async (t) => {
    const client = new DynamoDBClient({
      endpoint,
      region: 'us-west-2',
      credentials: {
        accessKeyId: 'localtestaccesskey0001',
        secretAccessKey: 'localtestsecretaccesskey000000000000000000000000'
      }
    });
    const documentClient = DynamoDBDocumentClient.from(client);
    const tableName = `shares-${randomUUID()}`;
    await client.send(
      new CreateTableCommand({
        TableName: tableName,
        BillingMode: 'PAY_PER_REQUEST',
        KeySchema: [{ AttributeName: 'id', KeyType: 'HASH' }],
        AttributeDefinitions: [
          { AttributeName: 'id', AttributeType: 'S' },
          { AttributeName: 'ownerId', AttributeType: 'S' },
          { AttributeName: 'createdAt', AttributeType: 'S' }
        ],
        GlobalSecondaryIndexes: [
          {
            IndexName: 'owner-created-at',
            KeySchema: [
              { AttributeName: 'ownerId', KeyType: 'HASH' },
              { AttributeName: 'createdAt', KeyType: 'RANGE' }
            ],
            Projection: { ProjectionType: 'ALL' }
          }
        ]
      })
    );
    t.after(async () => {
      try {
        await client.send(new DeleteTableCommand({ TableName: tableName }));
      } finally {
        client.destroy();
      }
    });
    await waitUntilTableExists(
      { client, maxWaitTime: 30 },
      { TableName: tableName }
    );

    const repository = new DynamoDbShareRepository(tableName, documentClient);
    await repositoryContract(repository);
    const ownerId = randomUUID();
    const otherOwnerId = randomUUID();
    const now = Date.now();
    const putShare = async (
      share: ReturnType<typeof createStoredShare>,
      padding?: number
    ) => {
      await documentClient.send(
        new PutCommand({
          TableName: tableName,
          Item: {
            ...share,
            ...(padding ? { padding: 'x'.repeat(padding) } : {})
          }
        })
      );
    };

    const older = createStoredShare(ownerId, 'Fictional older share.');
    older.createdAt = new Date(now - 30_000).toISOString();
    await putShare(older);

    const newer = createStoredShare(ownerId, 'Fictional newer share.');
    newer.createdAt = new Date(now - 20_000).toISOString();
    await putShare(newer);

    const future = createStoredShare(ownerId, 'Fictional future-dated share.');
    future.createdAt = new Date(now + 20_000).toISOString();
    await putShare(future);

    const inserted = await repository.create(
      ownerId,
      'Fictional created share.'
    );
    const otherOwnerShare = createStoredShare(
      otherOwnerId,
      'Fictional other owner.'
    );
    await putShare(otherOwnerShare);

    const paddedIds: string[] = [];
    for (let index = 0; index < 5; index += 1) {
      const padded = createStoredShare(ownerId, 'Fictional paginated share.');
      padded.createdAt = new Date(now + 60_000 + index * 1000).toISOString();
      await putShare(padded, 280_000);
      paddedIds.unshift(padded.id);
    }

    const duplicateWrite = new PutCommand({
      TableName: tableName,
      Item: inserted,
      ConditionExpression: 'attribute_not_exists(id)'
    });
    await assert.rejects(
      documentClient.send(duplicateWrite),
      (error: unknown) =>
        error instanceof Error &&
        error.name === 'ConditionalCheckFailedException'
    );

    // The 1 MiB DynamoDB boundary creates multiple pages even with a requested limit of 20.
    const ids: string[] = [];
    let cursor: string | undefined;
    let pages = 0;
    do {
      const page = await repository.listByOwner(ownerId, { cursor });
      ids.push(...page.shares.map((share) => share.id));
      cursor = page.nextCursor ?? undefined;
      pages++;
    } while (cursor);
    assert.ok(pages > 1);
    assert.deepEqual(ids, [
      ...paddedIds,
      future.id,
      inserted.id,
      newer.id,
      older.id
    ]);
    assert.equal(await repository.findById(future.id).then(Boolean), true);
    // Old TTL metadata is ignored by private reads after the retention policy change.
    const old = createStoredShare(ownerId, 'Fictional retained history.');
    old.createdAt = new Date(now - 8 * 86400_000).toISOString();
    await documentClient.send(
      new PutCommand({
        TableName: tableName,
        Item: { ...old, expiresAt: Math.floor(now / 1000) - 1 }
      })
    );
    assert.ok(await repository.findByOwner(old.id, ownerId));

    await t.test(
      'HTTP save, owner isolation, public expiry and private retention use the database adapter',
      async (t) => {
        let clock = Date.now();
        t.mock.method(Date, 'now', () => clock);
        for (const method of [
          'create',
          'findById',
          'findByOwner',
          'listByOwner'
        ] as const) {
          t.mock.method(
            shareRepository,
            method,
            repository[method].bind(repository)
          );
        }
        const request = (path: string, cookie?: string) =>
          dispatch(
            new Request(`http://localhost${path}`, {
              headers: cookie ? { cookie } : {}
            })
          );
        const created = await dispatch(
          new Request('http://localhost/api/shares', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ text: 'Fictional HTTP database share.' })
          })
        );
        assert.equal(created.status, 201);
        const saved = await created.json();
        const cookie = created.headers.get('set-cookie')!.split(';')[0];
        assert.equal('ownerId' in saved, false);
        assert.equal('expiresAt' in saved, false);
        assert.equal(
          (await request(`/api/shares/${saved.id}`, cookie)).status,
          200
        );
        assert.equal((await request(`/api/shares/${saved.id}`)).status, 404);
        const foreign = await request('/api/shares');
        assert.deepEqual(await foreign.json(), []);
        assert.equal(
          (
            await request(
              `/api/shares/${saved.id}`,
              foreign.headers.get('set-cookie')!.split(';')[0]
            )
          ).status,
          404
        );
        const publicResponse = await request(`/api/public/shares/${saved.id}`);
        assert.equal(publicResponse.status, 200);
        assert.equal(publicResponse.headers.get('set-cookie'), null);
        assert.deepEqual(Object.keys(await publicResponse.json()).sort(), [
          'reflection',
          'text'
        ]);
        clock = Date.parse(saved.createdAt) + 7 * 86400_000;
        assert.equal(
          (await request(`/api/public/shares/${saved.id}`)).status,
          404
        );
        assert.equal(
          (await request(`/api/shares/${saved.id}`, cookie)).status,
          200
        );
        // Explicitly bound GSI visibility checks, rather than promising immediate history.
        let visible = false;
        for (let attempt = 0; attempt < 40; attempt++) {
          const history = await (await request('/api/shares', cookie)).json();
          if (history.some((share: { id: string }) => share.id === saved.id)) {
            visible = true;
            break;
          }
          await new Promise((resolve) => setTimeout(resolve, 25));
        }
        assert.ok(visible);
      }
    );
  }
);
