import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { startApp } from './helpers.js';

let app;
before(async () => { app = await startApp(); });
after(() => app.close());

test('GET /api/health answers 200 without auth', async () => {
  const response = await app.request('/api/health');
  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { ok: true, app: 'practice-app-v2' });
});
