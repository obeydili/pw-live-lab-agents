// The contract the app had before Phase 2, plus V2-01's seed. Later tickets must keep all of it.
import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { startApp } from './helpers.js';

let app;
let trader;
let approver;
before(async () => {
  app = await startApp();
  trader = await app.login('trader1');
  approver = await app.login('approver1');
});
after(() => app.close());
beforeEach(() => app.request('/api/test/reset', { method: 'POST' }));

const ticket = { symbol: 'ACME', side: 'Buy', quantity: 10, limitPrice: 12.5 };

test('login: 200 with a token and the user, 401 for a wrong password', async () => {
  const ok = await app.request('/api/auth/login', { method: 'POST', body: { username: 'trader2', password: 'Password123!' } });
  assert.equal(ok.status, 200);
  assert.equal(typeof ok.body.token, 'string');
  assert.deepEqual(ok.body.user, { username: 'trader2', role: 'trader', displayName: 'Trader Two' });
  assert.match(ok.headers.get('set-cookie'), /^tdl_session=/);
  const bad = await app.request('/api/auth/login', { method: 'POST', body: { username: 'trader1', password: 'nope' } });
  assert.equal(bad.status, 401);
  assert.deepEqual(bad.body, { error: 'Invalid username or password.' });
});

test('no token: 401', async () => {
  const response = await app.request('/api/orders');
  assert.equal(response.status, 401);
  assert.deepEqual(response.body, { error: 'Authentication required.' });
});

test('GET /api/orders returns the 25 seed orders in seed order, the first three unchanged', async () => {
  const { status, body } = await app.request('/api/orders', { token: trader });
  assert.equal(status, 200);
  assert.equal(body.length, 25);
  assert.deepEqual(body.map(order => order.id), Array.from({ length: 25 }, (_, i) => `ORD-${1001 + i}`));
  assert.deepEqual(body[2], {
    id: 'ORD-1003', clientOrderId: null, symbol: 'CRSP', side: 'Buy', quantity: 50, limitPrice: 101.2,
    status: 'Pending Approval', createdBy: 'trader1', createdAt: '2026-01-07T16:00:00.000Z', decidedBy: null, decidedAt: null,
    updatedAt: null, executionStatus: null, filledAt: null,
    rejectionReason: null, timeInForce: 'Day', goodTillDate: null, urgent: false, notes: null,
  });
  const pending = await app.request('/api/orders?status=Pending%20Approval', { token: trader });
  assert.equal(pending.body.length, 9);
  assert.ok(pending.body.every(order => order.status === 'Pending Approval'));
});

test('POST /api/orders: 201 (createdBy is the trader), 400 with details, 403 for an approver, 409 for a duplicate clientOrderId', async () => {
  const trader2 = await app.login('trader2');
  const created = await app.request('/api/orders', { method: 'POST', token: trader2, body: { ...ticket, clientOrderId: 'mine-1' } });
  assert.equal(created.status, 201);
  assert.equal(created.body.id, 'ORD-1026');
  assert.equal(created.body.createdBy, 'trader2');
  assert.equal(created.body.status, 'Pending Approval');

  const invalid = await app.request('/api/orders', { method: 'POST', token: trader, body: { ...ticket, side: 'Hold', quantity: 0 } });
  assert.equal(invalid.status, 400);
  assert.equal(invalid.body.error, 'Validation failed.');
  assert.deepEqual(Object.keys(invalid.body.details).sort(), ['quantity', 'side']);

  const forbidden = await app.request('/api/orders', { method: 'POST', token: approver, body: ticket });
  assert.equal(forbidden.status, 403);
  assert.deepEqual(forbidden.body, { error: 'Only a trader can do this.' });

  const duplicate = await app.request('/api/orders', { method: 'POST', token: trader, body: { ...ticket, clientOrderId: 'V2-SEED-07' } });
  assert.equal(duplicate.status, 409);
  assert.deepEqual(duplicate.body, { error: 'clientOrderId V2-SEED-07 already exists.' });
});

test('GET /api/orders/:id: 404 for an unknown id', async () => {
  const response = await app.request('/api/orders/ORD-9999', { token: trader });
  assert.equal(response.status, 404);
  assert.deepEqual(response.body, { error: 'Order ORD-9999 not found.' });
});

test('approve: 200, then 409; a trader gets 403', async () => {
  const traderTry = await app.request('/api/orders/ORD-1003/approve', { method: 'POST', token: trader });
  assert.equal(traderTry.status, 403);
  assert.deepEqual(traderTry.body, { error: 'Only a approver can do this.' });
  const approved = await app.request('/api/orders/ORD-1003/approve', { method: 'POST', token: approver });
  assert.equal(approved.status, 200);
  assert.equal(approved.body.status, 'Approved');
  assert.equal(approved.body.decidedBy, 'approver1');
  const again = await app.request('/api/orders/ORD-1003/approve', { method: 'POST', token: approver });
  assert.equal(again.status, 409);
  assert.deepEqual(again.body, { error: 'Order ORD-1003 is already Approved.' });
});

test('POST /api/test/reset: 200 { ok: true, orders: 25 } and the seed is back', async () => {
  await app.request('/api/orders', { method: 'POST', token: trader, body: ticket });
  const reset = await app.request('/api/test/reset', { method: 'POST' });
  assert.equal(reset.status, 200);
  assert.deepEqual(reset.body, { ok: true, orders: 25 });
  assert.equal((await app.request('/api/orders', { token: trader })).body.length, 25);
});

test('unknown /api route: 404 JSON; pages redirect signed-out visitors', async () => {
  const unknown = await app.request('/api/nope', { token: trader });
  assert.equal(unknown.status, 404);
  assert.deepEqual(unknown.body, { error: 'Not found.' });
  const page = await fetch(`${app.baseUrl}/orders`, { redirect: 'manual' });
  assert.equal(page.status, 302);
  assert.equal(page.headers.get('location'), '/login?next=%2Forders');
});
