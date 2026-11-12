import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { setTimeout as sleep } from 'node:timers/promises';
import { startApp } from './helpers.js';

const FILL_DELAY_MS = 120;
let app;
let trader;
let approver;
before(async () => {
  app = await startApp({ config: { fillDelayMs: FILL_DELAY_MS } });
  [trader, approver] = await Promise.all([app.login('trader1'), app.login('approver1')]);
});
after(() => app.close());
beforeEach(() => app.request('/api/test/reset', { method: 'POST' }));

const order = async id => (await app.request(`/api/orders/${id}`, { token: trader })).body;

/** Like expect.poll: asks until the check passes or the time runs out. */
const pollUntil = async (read, check, timeoutMs = 2000) => {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await read();
    if (check(value)) return value;
    if (Date.now() > deadline) throw new Error(`gave up; last value ${JSON.stringify(value)}`);
    await sleep(10);
  }
};

test('seed: approved orders are Filled at their decision time, the others have no execution', async () => {
  const filled = await order('ORD-1001');
  assert.equal(filled.executionStatus, 'Filled');
  assert.equal(filled.filledAt, filled.decidedAt);
  const pending = await order('ORD-1003');
  assert.equal(pending.executionStatus, null);
  assert.equal(pending.filledAt, null);
  const list = (await app.request('/api/orders', { token: trader })).body;
  assert.ok(list.every(item => 'executionStatus' in item && 'filledAt' in item));
});

test('approve answers at once (Approved, Working), then Partially Filled, then Filled with filledAt', async () => {
  const approved = await app.request('/api/orders/ORD-1003/approve', { method: 'POST', token: approver });
  assert.equal(approved.status, 200);
  assert.equal(approved.body.status, 'Approved');
  assert.equal(approved.body.executionStatus, 'Working');
  assert.equal((await order('ORD-1003')).executionStatus, 'Working');
  const seen = new Set();
  const done = await pollUntil(async () => {
    const current = await order('ORD-1003');
    seen.add(current.executionStatus);
    return current;
  }, current => current.executionStatus === 'Filled');
  assert.ok(seen.has('Partially Filled'), `saw ${[...seen].join(', ')}`);
  assert.match(done.filledAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(done.status, 'Approved');
});

test('reject leaves the execution empty', async () => {
  const rejected = await app.request('/api/orders/ORD-1003/reject', { method: 'POST', token: approver });
  assert.equal(rejected.body.executionStatus, null);
  await sleep(FILL_DELAY_MS + 30);
  assert.equal((await order('ORD-1003')).executionStatus, null);
});

test('a reset during execution: the pending timers leave the fresh seed order alone', async () => {
  await app.request('/api/orders/ORD-1003/approve', { method: 'POST', token: approver });
  await app.request('/api/test/reset', { method: 'POST' });
  await sleep(FILL_DELAY_MS + 30);
  const fresh = await order('ORD-1003');
  assert.equal(fresh.status, 'Pending Approval');
  assert.equal(fresh.executionStatus, null);
});

test('FILL_DELAY_MS=0 fills almost at once', async () => {
  const instant = await startApp({ config: { fillDelayMs: 0 } });
  try {
    const [t, a] = await Promise.all([instant.login('trader1'), instant.login('approver1')]);
    await instant.request('/api/orders/ORD-1003/approve', { method: 'POST', token: a });
    await sleep(20);
    assert.equal((await instant.request('/api/orders/ORD-1003', { token: t })).body.executionStatus, 'Filled');
  } finally {
    await instant.close();
  }
});
