import 'server-only';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  type QueryCommandInput
} from '@aws-sdk/lib-dynamodb';
import { z } from 'zod';
import {
  createStoredShare,
  isShareActive,
  storedShareSchema,
  type StoredShare
} from './create-stored-share';
import type { ShareRepository } from './repository';

export const OWNER_INDEX_NAME = 'owner-created-at';

/** Only imported from the server storage layer; default AWS credentials, no keys. */
export class DynamoDbShareRepository implements ShareRepository {
  constructor(
    private readonly tableName: string,
    private readonly client: Pick<DynamoDBDocumentClient, 'send'>
  ) {}

  static forRegion(tableName: string, region: string) {
    const client = DynamoDBDocumentClient.from(new DynamoDBClient({ region }), {
      marshallOptions: { removeUndefinedValues: true }
    });
    return new DynamoDbShareRepository(tableName, client);
  }

  async create(ownerId: string, text: string): Promise<StoredShare> {
    const share = createStoredShare(ownerId, text);
    await this.client.send(
      new PutCommand({
        TableName: this.tableName,
        Item: share,
        ConditionExpression: 'attribute_not_exists(id)'
      })
    );
    return structuredClone(share);
  }

  async findById(id: string): Promise<StoredShare | null> {
    if (!z.uuid({ version: 'v4' }).safeParse(id).success) return null;
    const response = await this.client.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { id },
        ConsistentRead: true
      })
    );
    if (!response.Item) return null;
    const share = storedShareSchema.parse(response.Item);
    return share.id === id && isShareActive(share)
      ? structuredClone(share)
      : null;
  }

  async findByOwner(id: string, ownerId: string): Promise<StoredShare | null> {
    const share = await this.findById(id);
    return share?.ownerId === ownerId ? share : null;
  }

  async listByOwner(ownerId: string): Promise<StoredShare[]> {
    z.uuid().parse(ownerId);
    const shares: StoredShare[] = [];
    let cursor: QueryCommandInput['ExclusiveStartKey'];
    const now = Date.now();
    do {
      const response = await this.client.send(
        new QueryCommand({
          TableName: this.tableName,
          IndexName: OWNER_INDEX_NAME,
          KeyConditionExpression: 'ownerId = :owner',
          FilterExpression: 'expiresAt > :now',
          ExpressionAttributeValues: {
            ':owner': ownerId,
            ':now': Math.floor(now / 1000)
          },
          ScanIndexForward: false,
          ExclusiveStartKey: cursor
        })
      );
      for (const item of response.Items ?? []) {
        const share = storedShareSchema.parse(item);
        // Defense in depth: never trust the query result alone for authorization/TTL.
        if (share.ownerId === ownerId && isShareActive(share))
          shares.push(share);
      }
      cursor = response.LastEvaluatedKey;
    } while (cursor && Object.keys(cursor).length > 0);
    return structuredClone(
      shares
        .filter((share) => isShareActive(share))
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    );
  }
}
