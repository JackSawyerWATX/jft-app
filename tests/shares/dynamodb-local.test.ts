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

    assert.deepEqual(
      (await repository.listByOwner(ownerId)).map((share) => share.id),
      [...paddedIds, future.id, inserted.id, newer.id, older.id]
    );
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
  }
);
