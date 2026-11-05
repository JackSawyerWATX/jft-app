// Test-only TLS termination: production Secure cookies must be exercised over HTTPS.
import { createServer } from 'node:https';
import { request as forward } from 'node:http';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const directory = mkdtempSync(join(tmpdir(), 'doorknob-test-tls-'));
const key = join(directory, 'key.pem');
const cert = join(directory, 'cert.pem');
try {
  execFileSync(
    'openssl',
    [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-days',
      '1',
      '-keyout',
      key,
      '-out',
      cert,
      '-subj',
      '/CN=localhost',
      '-addext',
      'subjectAltName=DNS:localhost,IP:127.0.0.1'
    ],
    { stdio: 'ignore' }
  );
  const server = createServer(
    { key: readFileSync(key), cert: readFileSync(cert) },
    (request, response) => {
      const upstream = forward(
        {
          hostname: '127.0.0.1',
          port: 3101,
          path: request.url,
          method: request.method,
          headers: {
            ...request.headers,
            'x-forwarded-proto': 'https',
            'x-forwarded-host': request.headers.host,
            'x-forwarded-port': '3100'
          }
        },
        (result) => {
          response.writeHead(result.statusCode ?? 502, result.headers);
          result.pipe(response);
        }
      );
      upstream.on('error', () => {
        if (!response.headersSent) response.writeHead(502);
        response.end();
      });
      response.on('close', () => upstream.destroy());
      request.pipe(upstream);
    }
  );
  // Certificate material is ephemeral and never enters logs, fixtures or reports.
  rmSync(directory, { recursive: true, force: true });
  server.listen(3100, '127.0.0.1');
} finally {
  rmSync(directory, { recursive: true, force: true });
}
