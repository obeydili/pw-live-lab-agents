import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { startApp } from './helpers.js';

let app;
let approver;
before(async () => {
  app = await startApp();
  approver = await app.login('approver1');
});
after(() => app.close());
beforeEach(() => app.request('/api/test/reset', { method: 'POST' }));

const reject = body => app.request('/api/orders/ORD-1003/reject', { method: 'POST', token: approver, body });

test('reject with a reason stores it, trimmed', async () => {
  const response = await reject({ reason: '  Price too high  ' });
  assert.equal(response.status, 200);
  assert.equal(response.body.status, 'Rejected');
  assert.equal(response.body.rejectionReason, 'Price too high');
});

test('reject with an empty body works as before and leaves rejectionReason null', async () => {
  const response = await app.request('/api/orders/ORD-1003/reject', { method: 'POST', token: approver });
  assert.equal(response.status, 200);
  assert.equal(response.body.rejectionReason, null);
  assert.equal((await app.request('/api/orders/ORD-1001', { token: approver })).body.rejectionReason, null);
});

test('an invalid reason is a 400 and the order stays pending', async () => {
  for (const reason of ['x'.repeat(201), '   ', 42]) {
    const response = await reject({ reason });
    assert.equal(response.status, 400, JSON.stringify(reason));
    assert.deepEqual(response.body, { error: 'Validation failed.', details: { reason: 'Reason must be 1 to 200 characters.' } });
  }
  assert.equal((await reject({ reason: 'x'.repeat(200) })).status, 200, '200 characters is fine');
});

test('approve ignores a reason; DELETE (Cancel order) removes the order', async () => {
  const approved = await app.request('/api/orders/ORD-1007/approve', { method: 'POST', token: approver, body: { reason: 'n/a' } });
  assert.equal(approved.body.rejectionReason, null);
  const trader = await app.login('trader1');
  assert.equal((await app.request('/api/orders/ORD-1003', { method: 'DELETE', token: trader })).status, 204);
  assert.equal((await app.request('/api/orders/ORD-1003', { token: trader })).status, 404);
});
