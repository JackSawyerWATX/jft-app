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
import { shareRepository } from '../../src/shares/server/storage/configured-repository';
import { DynamoDbShareRepository } from '../../src/shares/server/storage/dynamodb-repository';
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
