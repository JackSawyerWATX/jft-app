import { expect, test } from './fixtures/test';
import SwaggerParser from '@apidevtools/swagger-parser';

// Exercise actual Next.js exports and framework routing, not just app.fetch.
test('serves OpenAPI and honors resource HTTP methods, headers, and sessions', async ({
  request
}) => {
  const specification = await request.get('/api/openapi.json');
  expect(specification.status()).toBe(200);
  expect(specification.headers()['set-cookie']).toBeUndefined();
  const document = await specification.json();
  expect(document.openapi).toBe('3.1.0');
  await SwaggerParser.validate(document, { resolve: { external: false } });
  const created = await request.post('/api/shares', {
    headers: { 'Content-Type': 'Application/JSON; charset="UTF-8"' },
    data: JSON.stringify({ text: 'A fictional HTTP contract thought.' })
  });
  expect(created.status()).toBe(201);
  const share = await created.json();
  const ownerCookie = created.headers()['set-cookie'].split(';')[0];
  const location = `/api/shares/${share.id}`;
  expect(created.headers().location).toBe(location);
  expect(share.ownerId).toBeUndefined();
  expect((await request.get(location)).status()).toBe(200);
  for (const [path, allow] of [
    ['/api/shares', 'GET, HEAD, POST, OPTIONS'],
    [location, 'GET, HEAD, OPTIONS']
  ]) {
    const head = await request.head(path, { headers: { Cookie: ownerCookie } });
    expect(head.status()).toBe(200);
    expect(await head.body()).toHaveLength(0);
    expect(head.headers()['cache-control']).toBe('private, no-store');
    const options = await request.fetch(path, {
      method: 'OPTIONS',
      headers: { Cookie: 'doorknob-session=forged' }
    });
    expect(options.status()).toBe(204);
    expect(options.headers().allow).toBe(allow);
    expect(options.headers()['set-cookie']).toBeUndefined();
    expect(options.headers()['access-control-allow-origin']).toBeUndefined();
    for (const method of ['PUT', 'PATCH', 'DELETE']) {
      const rejected = await request.fetch(path, { method });
      expect(rejected.status()).toBe(405);
      expect(rejected.headers().allow).toBe(allow);
      expect((await rejected.json()).error.code).toBe('METHOD_NOT_ALLOWED');
    }
    const invalid = await request.get(path, {
      headers: { Cookie: 'doorknob-session=forged' }
    });
    expect(invalid.status()).toBe(path === '/api/shares' ? 200 : 404);
    expect(invalid.headers()['set-cookie']).toBeDefined();
    expect(invalid.headers()['www-authenticate']).toBeUndefined();
  }
});
