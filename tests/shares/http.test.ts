import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HTTPException } from 'hono/http-exception';
import { handleApiError } from '../../src/shares/server/http';

test('unrecognized HTTP exceptions remain generic internal failures', async () => {
  for (const status of [400, 404, 413, 415] as const) {
    const response = handleApiError(
      new HTTPException(status, { message: 'Fictional internal detail.' })
    );
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), {
      error: {
        code: 'INTERNAL_ERROR',
        message: 'The request could not be completed. Please try again.'
      }
    });
  }
});
