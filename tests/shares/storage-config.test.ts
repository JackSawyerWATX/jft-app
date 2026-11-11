import '@hono/zod-openapi';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createShareRepository } from '../../src/shares/server/storage/configured-repository';
import { InMemoryShareRepository } from '../../src/shares/server/storage/memory-repository';
import { DynamoDbShareRepository } from '../../src/shares/server/storage/dynamodb-repository';

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
