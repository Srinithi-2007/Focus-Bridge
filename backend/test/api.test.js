'use strict';
// Route-level checks that run without a database: validation and auth guards reject before any DB call.
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { createApp, normalizeOrigin } = require('../src/app');

function startServer() {
  const app = createApp();
  return new Promise((resolve) => {
    const server = app.listen(0, () => resolve(server));
  });
}

async function request(server, method, path, body, headers = {}) {
  const { port } = server.address();
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request(
      { host: '127.0.0.1', port, method, path, headers: { 'Content-Type': 'application/json', ...headers } },
      (res) => {
        let text = '';
        res.on('data', (c) => (text += c));
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: text ? JSON.parse(text) : null }));
      }
    );
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

test('health endpoint responds', async () => {
  const server = await startServer();
  try {
    const r = await request(server, 'GET', '/api/health');
    assert.equal(r.status, 200);
  } finally {
    server.close();
  }
});

test('org registration rejects a weak password before touching the database', async () => {
  const server = await startServer();
  try {
    const r = await request(server, 'POST', '/api/auth/register-organization', {
      organizationName: 'Acme', firstName: 'A', lastName: 'B', email: 'a@b.co', password: 'weak',
    });
    assert.equal(r.status, 400);
    assert.equal(r.body.error.message, 'Validation failed');
  } finally {
    server.close();
  }
});

test('admin routes require authentication', async () => {
  const server = await startServer();
  try {
    const r = await request(server, 'GET', '/api/admin/users');
    assert.equal(r.status, 401);
  } finally {
    server.close();
  }
});

test('a forged token with the wrong signature is rejected', async () => {
  const server = await startServer();
  try {
    const r = await request(server, 'GET', '/api/auth/me', null, {
      Authorization: 'Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.invalidsig',
    });
    assert.equal(r.status, 401);
  } finally {
    server.close();
  }
});

test('normalizeOrigin helper removes trailing slashes and normalizes case', () => {
  assert.equal(normalizeOrigin('https://focus-bridge-seven.vercel.app'), 'https://focus-bridge-seven.vercel.app');
  assert.equal(normalizeOrigin('https://focus-bridge-seven.vercel.app/'), 'https://focus-bridge-seven.vercel.app');
  assert.equal(normalizeOrigin('https://focus-bridge-seven.vercel.app///'), 'https://focus-bridge-seven.vercel.app');
  assert.equal(normalizeOrigin('HTTPS://FOCUS-BRIDGE-SEVEN.VERCEL.APP/'), 'https://focus-bridge-seven.vercel.app');
  assert.equal(normalizeOrigin('http://localhost:3000/'), 'http://localhost:3000');
  assert.equal(normalizeOrigin(''), '');
  assert.equal(normalizeOrigin(null), '');
  assert.equal(normalizeOrigin(undefined), '');
});

test('CORS: allows production origin without trailing slash', async () => {
  const server = await startServer();
  try {
    const r = await request(server, 'GET', '/api/health', null, {
      Origin: 'https://focus-bridge-seven.vercel.app',
    });
    assert.equal(r.status, 200);
    assert.equal(r.headers['access-control-allow-origin'], 'https://focus-bridge-seven.vercel.app');
  } finally {
    server.close();
  }
});

test('CORS: allows production origin with trailing slash', async () => {
  const server = await startServer();
  try {
    const r = await request(server, 'GET', '/api/health', null, {
      Origin: 'https://focus-bridge-seven.vercel.app/',
    });
    assert.equal(r.status, 200);
    assert.equal(r.headers['access-control-allow-origin'], 'https://focus-bridge-seven.vercel.app/');
  } finally {
    server.close();
  }
});

test('CORS: allows legitimate FocusBridge Vercel preview deployment origins', async () => {
  const server = await startServer();
  try {
    const previewOrigins = [
      'https://focus-bridge-git-main-srinithis-projects.vercel.app',
      'https://focus-bridge-abc123xyz.vercel.app',
      'https://focusbridge-preview-branch.vercel.app',
    ];
    for (const origin of previewOrigins) {
      const r = await request(server, 'GET', '/api/health', null, { Origin: origin });
      assert.equal(r.status, 200, `Expected 200 for preview origin ${origin}`);
      assert.equal(r.headers['access-control-allow-origin'], origin);
    }
  } finally {
    server.close();
  }
});

test('CORS: blocks random external origin and returns HTTP 403 instead of 500', async () => {
  const server = await startServer();
  try {
    const r = await request(server, 'GET', '/api/health', null, {
      Origin: 'https://random-origin.com',
    });
    assert.equal(r.status, 403, 'CORS rejection must return HTTP 403');
    assert.ok(r.body && r.body.error, 'Response must have structured error');
    assert.equal(r.body.error.message, 'CORS blocked for origin: https://random-origin.com');
  } finally {
    server.close();
  }
});

test('CORS: blocks unrelated Vercel apps and returns HTTP 403 instead of 500', async () => {
  const server = await startServer();
  try {
    const r = await request(server, 'GET', '/api/health', null, {
      Origin: 'https://malicious-other-app.vercel.app',
    });
    assert.equal(r.status, 403, 'CORS rejection must return HTTP 403');
    assert.equal(r.body.error.message, 'CORS blocked for origin: https://malicious-other-app.vercel.app');
  } finally {
    server.close();
  }
});
