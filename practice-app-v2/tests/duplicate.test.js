// DEV-02: POST /api/orders/:id/duplicate copies an order into a new Pending Approval one; the source is unchanged.
import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { startApp } from './helpers.js';

let app;
let trader;
let trader2;
let approver;
before(async () => {
  app = await startApp();
  [trader, trader2, approver] = await Promise.all([app.login('trader1'), app.login('trader2'), app.login('approver1')]);
});
after(() => app.close());
beforeEach(() => app.request('/api/test/reset', { method: 'POST' }));

const duplicate = (id, token = trader, body) => app.request(`/api/orders/${id}/duplicate`, { method: 'POST', token, body });
const order = async id => (await app.request(`/api/orders/${id}`, { token: trader })).body;
const count = async () => (await app.request('/api/orders', { token: trader })).body.length;
const nullFields = ['decidedBy', 'decidedAt', 'updatedAt', 'executionStatus', 'filledAt', 'rejectionReason'];

test('AC1: 201 with a new Pending Approval order for the current trader, copied fields, nothing else carried over', async () => {
  // A ticket with every field, created by trader2 and approved: a trader may duplicate any existing order.
  const gtd = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
  const source = (await app.request('/api/orders', {
    method: 'POST', token: trader2,
    body: { symbol: 'ACME', side: 'Sell', quantity: 40, limitPrice: 99.95, clientOrderId: 'unique-1', timeInForce: 'GTD', goodTillDate: gtd, urgent: true, notes: 'from the desk' },
  })).body;
  await app.request(`/api/orders/${source.id}/approve`, { method: 'POST', token: approver });

  const before = Date.now();
  const { status, body } = await duplicate(source.id);
  assert.equal(status, 201);
  assert.notEqual(body.id, source.id);
  assert.equal(Number(body.id.slice(4)), Number(source.id.slice(4)) + 1);
  assert.equal(body.status, 'Pending Approval');
  assert.equal(body.createdBy, 'trader1');
  assert.ok(Date.parse(body.createdAt) >= before - 5);
  assert.equal(body.clientOrderId, null);
  for (const field of nullFields) assert.equal(body[field], null, field);
  assert.deepEqual(
    { symbol: body.symbol, side: body.side, quantity: body.quantity, limitPrice: body.limitPrice, timeInForce: body.timeInForce, goodTillDate: body.goodTillDate, urgent: body.urgent, notes: body.notes },
    { symbol: 'ACME', side: 'Sell', quantity: 40, limitPrice: 99.95, timeInForce: 'GTD', goodTillDate: gtd, urgent: true, notes: 'from the desk' },
  );
  assert.deepEqual(await order(body.id), body);
});

test('AC1: seed orders in every status (defaults for the ticket fields), and the request body is ignored', async () => {
  for (const id of ['ORD-1001', 'ORD-1003']) {
    const { status, body } = await duplicate(id, trader, { symbol: 'NOPE', quantity: 1 });
    assert.equal(status, 201, id);
    const source = await order(id);
    assert.deepEqual([body.symbol, body.quantity, body.timeInForce, body.goodTillDate, body.urgent, body.notes], [source.symbol, source.quantity, 'Day', null, false, null]);
  }
  const rejected = (await app.request('/api/orders?status=Rejected', { token: trader })).body[0];
  assert.equal((await duplicate(rejected.id)).status, 201);
});

test('AC2: the source is unchanged, and a second duplicate gets another new id', async () => {
  const before = await order('ORD-1003');
  const first = (await duplicate('ORD-1003')).body;
  const second = (await duplicate('ORD-1003')).body;
  assert.notEqual(first.id, second.id);
  assert.deepEqual(await order('ORD-1003'), before);
});

test('AC3: 401 without auth, 403 for an approver, 404 for an unknown id; nothing is created', async () => {
  const total = await count();
  const anonymous = await app.request('/api/orders/ORD-1003/duplicate', { method: 'POST' });
  assert.equal(anonymous.status, 401);
  assert.deepEqual(anonymous.body, { error: 'Authentication required.' });
  const asApprover = await duplicate('ORD-1003', approver);
  assert.equal(asApprover.status, 403);
  assert.deepEqual(asApprover.body, { error: 'Only a trader can do this.' });
  const missing = await duplicate('ORD-9999');
  assert.equal(missing.status, 404);
  assert.deepEqual(missing.body, { error: 'Order ORD-9999 not found.' });
  assert.equal(await count(), total);
});

test('AC4: copied fields that no longer pass POST validation give 400 with details; nothing is created and the source is unchanged', async () => {
  // A GTD order whose date has since passed (set on the stored order through the seed, as time would).
  const seed = (await import('../data/seed.json', { with: { type: 'json' } })).default;
  const seeded = await startApp({ seed: { ...seed, orders: [
    { id: 'ORD-5000', clientOrderId: null, symbol: 'ACME', side: 'Buy', quantity: 1, limitPrice: 1, status: 'Pending Approval', createdBy: 'trader1', createdAt: '2020-01-01T00:00:00.000Z', decidedBy: null, decidedAt: null, timeInForce: 'GTD', goodTillDate: '2020-01-02', urgent: true, notes: 'kept as is' },
  ], nextOrderNumber: 5001 } });
  try {
    const token = await seeded.login('trader1');
    const read = async path => {
      const response = await seeded.request(path, { token });
      assert.equal(response.status, 200, path);
      return response.body;
    };
    const sourceBefore = await read('/api/orders/ORD-5000');
    const eventsBefore = await read('/api/orders/ORD-5000/events');

    const response = await seeded.request('/api/orders/ORD-5000/duplicate', { method: 'POST', token });
    assert.equal(response.status, 400);
    assert.deepEqual(response.body, { error: 'Validation failed.', details: { goodTillDate: 'Good till date is required for GTD and cannot be in the past.' } });

    // NO-CREATE: still only the source. UNCHANGED: every field of the source, and its history.
    assert.deepEqual((await read('/api/orders')).map(item => item.id), ['ORD-5000']);
    assert.deepEqual(await read('/api/orders/ORD-5000'), sourceBefore);
    assert.deepEqual(await read('/api/orders/ORD-5000/events'), eventsBefore);
  } finally {
    await seeded.close();
  }
});

test('a unique clientOrderId on the source never conflicts, and the copy records where it came from (DEV-01)', async () => {
  const source = (await app.request('/api/orders', { method: 'POST', token: trader, body: { symbol: 'ACME', side: 'Buy', quantity: 1, limitPrice: 1, clientOrderId: 'only-once' } })).body;
  const copy = await duplicate(source.id);
  assert.equal(copy.status, 201);
  const created = (await app.request(`/api/orders/${copy.body.id}/events`, { token: trader })).body[0];
  assert.deepEqual(created.details, { symbol: 'ACME', side: 'Buy', quantity: 1, limitPrice: 1, source: 'duplicate', duplicatedFrom: source.id });
});
