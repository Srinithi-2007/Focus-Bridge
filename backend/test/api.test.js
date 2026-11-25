'use strict';
// Route-level checks that run without a database: validation and auth guards reject before any DB call.
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { createApp } = require('../src/app');

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
        res.on('end', () => resolve({ status: res.statusCode, body: text ? JSON.parse(text) : null }));
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
