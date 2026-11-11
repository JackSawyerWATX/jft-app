import 'server-only';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand
} from '@aws-sdk/lib-dynamodb';
import { z } from 'zod';
import {
  createStoredShare,
  storedShareSchema,
  type StoredShare
} from './create-stored-share';
import {
  historyOptionsSchema,
  decodeHistoryCursor,
  encodeHistoryCursor,
  type HistoryOptions,
  type HistoryPage
} from './history-page';
import type { ShareRepository } from './repository';

export const OWNER_INDEX_NAME = 'owner-created-at';

export class DynamoDbShareRepository implements ShareRepository {
  constructor(
    private readonly tableName: string,
    private readonly client: Pick<DynamoDBDocumentClient, 'send'>
  ) {}

  static forRegion(tableName: string, region: string) {
    const client = DynamoDBDocumentClient.from(new DynamoDBClient({ region }));
    return new DynamoDbShareRepository(tableName, client);
  }

  async create(ownerId: string, text: string): Promise<StoredShare> {
    const share = createStoredShare(ownerId, text);
    await this.client.send(
      new PutCommand({
        TableName: this.tableName,
        Item: share,
        // A new share must never overwrite an existing share with the same ID.
        ConditionExpression: 'attribute_not_exists(id)'
      })
    );
    return share;
  }

  async findById(id: string): Promise<StoredShare | null> {
    if (!z.uuid({ version: 'v4' }).safeParse(id).success) return null;

    const { Item } = await this.client.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { id },
        ConsistentRead: true
      })
    );
    if (!Item) return null;
    const share = storedShareSchema.parse(Item);
    return share;
  }

  async findByOwner(id: string, ownerId: string): Promise<StoredShare | null> {
    const share = await this.findById(id);
    // A share ID identifies the record; private access still requires the owning session.
    return share?.ownerId === ownerId ? share : null;
  }

  async listByOwner(
    ownerId: string,
    options: HistoryOptions = {}
  ): Promise<HistoryPage> {
    const { limit, cursor } = historyOptionsSchema.parse(options);
    const { Items, LastEvaluatedKey } = await this.client.send(
      new QueryCommand({
        TableName: this.tableName,
        IndexName: OWNER_INDEX_NAME,
        KeyConditionExpression: 'ownerId = :owner',
        ExpressionAttributeValues: { ':owner': ownerId },
        ScanIndexForward: false,
        Limit: limit,
        ExclusiveStartKey: cursor
          ? { ...decodeHistoryCursor(cursor), ownerId }
          : undefined
      })
    );
    return {
      shares: (Items ?? []).map((item) => storedShareSchema.parse(item)),
      nextCursor: LastEvaluatedKey
        ? encodeHistoryCursor({
            id: LastEvaluatedKey.id,
            createdAt: LastEvaluatedKey.createdAt
          })
        : null
    };
  }
}
