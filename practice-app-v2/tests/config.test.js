import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { startApp } from './helpers.js';

let app;
let token;
before(async () => {
  app = await startApp({ config: { latencyMs: 0, fillDelayMs: 4000 } });
  token = await app.login('trader1');
});
after(() => app.close());
beforeEach(() => app.request('/api/test/reset', { method: 'POST' }));

const setConfig = body => app.request('/api/test/config', { method: 'POST', body });
const timed = async run => {
  const start = Date.now();
  const result = await run();
  return { result, ms: Date.now() - start };
};

test('GET/POST /api/test/config need no auth and answer the whole config', async () => {
  assert.deepEqual((await app.request('/api/test/config')).body, { latencyMs: 0, fillDelayMs: 4000 });
  const updated = await setConfig({ latencyMs: 50 });
  assert.equal(updated.status, 200);
  assert.deepEqual(updated.body, { latencyMs: 50, fillDelayMs: 4000 });
  assert.deepEqual((await setConfig({ fillDelayMs: 0 })).body, { latencyMs: 50, fillDelayMs: 0 });
});

test('config validation: out of range, not a whole number, unknown keys', async () => {
  const negative = await setConfig({ latencyMs: -1 });
  assert.equal(negative.status, 400);
  assert.deepEqual(negative.body, { error: 'Validation failed.', details: { latencyMs: 'latencyMs must be a whole number from 0 to 10000.' } });
  assert.deepEqual((await setConfig({ fillDelayMs: 60001, speed: 1 })).body.details, {
    fillDelayMs: 'fillDelayMs must be a whole number from 0 to 60000.',
    speed: 'Unknown field.',
  });
  assert.equal((await setConfig({ latencyMs: 1.5 })).status, 400);
  assert.deepEqual((await app.request('/api/test/config')).body, { latencyMs: 0, fillDelayMs: 4000 }, 'nothing changed');
});

test('latency slows authenticated API calls only; health, auth and test helpers stay fast', async () => {
  await setConfig({ latencyMs: 300 });
  const orders = await timed(() => app.request('/api/orders', { token }));
  assert.equal(orders.result.status, 200);
  assert.ok(orders.ms >= 290, `orders took ${orders.ms} ms`);
  for (const [path, init] of [
    ['/api/health', {}],
    ['/api/auth/login', { method: 'POST', body: { username: 'trader1', password: 'Password123!' } }],
    ['/api/test/config', {}],
  ]) {
    const { ms } = await timed(() => app.request(path, init));
    assert.ok(ms < 200, `${path} took ${ms} ms`);
  }
});

test('reset restores the default config and keeps its response shape', async () => {
  await setConfig({ latencyMs: 2000, fillDelayMs: 10 });
  const reset = await app.request('/api/test/reset', { method: 'POST' });
  assert.deepEqual(reset.body, { ok: true, orders: 25 });
  assert.deepEqual((await app.request('/api/test/config')).body, { latencyMs: 0, fillDelayMs: 4000 });
});
