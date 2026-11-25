'use strict';
// Regression test: Express 5 makes req.query read-only; validate() must still expose parsed query values.
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { z } = require('zod');
const validate = require('../src/middleware/validate');

test('validate() replaces query values on Express 5 and rejects bad input', async () => {
  const app = express();
  app.get('/q', validate(z.object({ page: z.string().regex(/^\d+$/) }), 'query'), (req, res) => res.json(req.query));
  app.use((err, _req, res, _next) => res.status(err.status || 500).json({ error: err.message }));
  const server = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  try {
    const ok = await fetch(`http://127.0.0.1:${server.address().port}/q?page=2`).then((r) => r.json());
    assert.deepEqual(ok, { page: '2' });
    const bad = await fetch(`http://127.0.0.1:${server.address().port}/q?page=abc`);
    assert.equal(bad.status, 400);
  } finally {
    server.close();
  }
});
