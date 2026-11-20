// DEV-01: every change to an order is an event; GET /api/orders/:id/events returns them oldest first.
import assert from 'node:assert/strict';
import { after, before, beforeEach, mock, test } from 'node:test';
import { setTimeout as sleep } from 'node:timers/promises';
import { startApp } from './helpers.js';

const FILL_DELAY_MS = 120;
let app;
let trader;
let trader2;
let approver;
before(async () => {
  app = await startApp({ config: { fillDelayMs: FILL_DELAY_MS } });
  [trader, trader2, approver] = await Promise.all([app.login('trader1'), app.login('trader2'), app.login('approver1')]);
});
after(() => app.close());
beforeEach(() => app.request('/api/test/reset', { method: 'POST' }));

const ticket = { symbol: 'ACME', side: 'Buy', quantity: 10, limitPrice: 12.5 };
const events = async (id, token = trader) => app.request(`/api/orders/${id}/events`, { token });
const create = async (body = ticket) => (await app.request('/api/orders', { method: 'POST', token: trader, body })).body;

test('access: 401 without a token, 404 for an unknown order, any signed-in role can read', async () => {
  const anonymous = await app.request('/api/orders/ORD-1001/events');
  assert.equal(anonymous.status, 401);
  assert.deepEqual(anonymous.body, { error: 'Authentication required.' });
  const missing = await events('ORD-9999');
  assert.equal(missing.status, 404);
  assert.deepEqual(missing.body, { error: 'Order ORD-9999 not found.' });
  assert.equal((await events('ORD-1001', approver)).status, 200);
  assert.equal((await events('ORD-1001', trader2)).status, 200);
});

test('seed orders carry the history their fields tell: created, decided, filled', async () => {
  const pending = (await events('ORD-1003')).body;
  assert.deepEqual(pending.map(event => event.action), ['created']);
  assert.deepEqual(pending[0], {
    orderId: 'ORD-1003', at: '2026-01-07T16:00:00.000Z', actor: 'trader1', action: 'created',
    details: { symbol: 'CRSP', side: 'Buy', quantity: 50, limitPrice: 101.2, source: 'seed' },
  });
  const approved = (await events('ORD-1001')).body;
  assert.deepEqual(approved.map(event => [event.action, event.actor]), [['created', approved[0].actor], ['approved', approved[1].actor], ['execution', 'system']]);
  assert.deepEqual(approved[2].details, { from: null, to: 'Filled' });
});

test('create, edit (PATCH and PUT), approve and the fills, oldest first, with who and what', async () => {
  const order = await create();
  await app.request(`/api/orders/${order.id}`, { method: 'PATCH', token: trader, body: { quantity: 25, notes: 'bigger' } });
  // A PATCH that changes nothing records nothing.
  await app.request(`/api/orders/${order.id}`, { method: 'PATCH', token: trader, body: { quantity: 25 } });
  await app.request(`/api/orders/${order.id}`, { method: 'PUT', token: trader, body: { ...ticket, quantity: 30, limitPrice: 13 } });
  await app.request(`/api/orders/${order.id}/approve`, { method: 'POST', token: approver });
  await sleep(FILL_DELAY_MS + 80);

  const { status, body } = await events(order.id);
  assert.equal(status, 200);
  assert.deepEqual(body.map(event => [event.action, event.actor]), [
    ['created', 'trader1'], ['edited', 'trader1'], ['edited', 'trader1'], ['approved', 'approver1'],
    ['execution', 'system'], ['execution', 'system'], ['execution', 'system'],
  ]);
  assert.deepEqual(body[0].details, { symbol: 'ACME', side: 'Buy', quantity: 10, limitPrice: 12.5, source: 'api' });
  assert.deepEqual(body[1].details, { method: 'PATCH', changes: { quantity: { from: 10, to: 25 }, notes: { from: null, to: 'bigger' } } });
  assert.deepEqual(body[2].details, { method: 'PUT', changes: { quantity: { from: 25, to: 30 }, limitPrice: { from: 12.5, to: 13 }, notes: { from: 'bigger', to: null } } });
  assert.deepEqual(body.slice(4).map(event => event.details), [
    { from: null, to: 'Working' }, { from: 'Working', to: 'Partially Filled' }, { from: 'Partially Filled', to: 'Filled' },
  ]);
  const times = body.map(event => Date.parse(event.at));
  assert.deepEqual(times, [...times].sort((a, b) => a - b));
  assert.ok(body.every(event => event.orderId === order.id));
});

test('reject records the reason (or null), and a refused change records nothing', async () => {
  const withReason = await create();
  await app.request(`/api/orders/${withReason.id}/reject`, { method: 'POST', token: approver, body: { reason: '  Too large  ' } });
  const last = (await events(withReason.id)).body.at(-1);
  assert.deepEqual([last.actor, last.action, last.details], ['approver1', 'rejected', { reason: 'Too large' }]);

  const without = await create();
  await app.request(`/api/orders/${without.id}/reject`, { method: 'POST', token: approver });
  assert.deepEqual((await events(without.id)).body.at(-1).details, { reason: null });

  const other = await create();
  const refused = await app.request(`/api/orders/${other.id}`, { method: 'PATCH', token: trader2, body: { quantity: 99 } });
  assert.equal(refused.status, 403);
  const invalid = await app.request(`/api/orders/${other.id}`, { method: 'PATCH', token: trader, body: { quantity: 0 } });
  assert.equal(invalid.status, 400);
  assert.deepEqual((await events(other.id)).body.map(event => event.action), ['created']);
});

test('CSV import marks its orders, a cancelled order answers 404 like its details page, and reset clears new events', async () => {
  const imported = await app.request('/api/orders/import', {
    method: 'POST', token: trader, body: 'symbol,side,quantity,limitPrice\nACME,Sell,5,10\n', headers: { 'Content-Type': 'text/csv' },
  });
  const id = imported.body.created[0].id;
  assert.equal((await events(id)).body[0].details.source, 'import');

  const cancelled = await create();
  assert.equal((await app.request(`/api/orders/${cancelled.id}`, { method: 'DELETE', token: trader })).status, 204);
  assert.deepEqual((await events(cancelled.id)).body, { error: `Order ${cancelled.id} not found.` });

  await app.request('/api/test/reset', { method: 'POST' });
  assert.equal((await events(id)).status, 404);
});

test('existing responses keep their shape (no new fields on orders)', async () => {
  const order = await create();
  assert.deepEqual(Object.keys(order).sort(), [
    'clientOrderId', 'createdAt', 'createdBy', 'decidedAt', 'decidedBy', 'executionStatus', 'filledAt', 'goodTillDate', 'id',
    'limitPrice', 'notes', 'quantity', 'rejectionReason', 'side', 'status', 'symbol', 'timeInForce', 'updatedAt', 'urgent',
  ]);
});

test('events with the same timestamp keep the order they happened in (Date frozen, TEST-PLAN Q3)', async () => {
  // Freezing Date makes every event share one `at` for certain; a real clock can't force a tie.
  // Only Date is mocked: timers stay real, so the fills still run (fillDelayMs 0 here).
  const FROZEN = '2026-03-01T10:00:00.000Z';
  const frozenApp = await startApp({ config: { fillDelayMs: 0 } });
  mock.timers.enable({ apis: ['Date'], now: Date.parse(FROZEN) });
  try {
    const [owner, checker] = await Promise.all([frozenApp.login('trader1'), frozenApp.login('approver1')]);
    const created = await frozenApp.request('/api/orders', { method: 'POST', token: owner, body: ticket });
    assert.equal(created.status, 201);
    const id = created.body.id;
    assert.equal((await frozenApp.request(`/api/orders/${id}`, { method: 'PATCH', token: owner, body: { quantity: 11 } })).status, 200);
    assert.equal((await frozenApp.request(`/api/orders/${id}/approve`, { method: 'POST', token: checker })).status, 200);

    let list = [];
    for (let attempt = 0; attempt < 50; attempt += 1) {
      list = (await frozenApp.request(`/api/orders/${id}/events`, { token: owner })).body;
      if (list.at(-1)?.details?.to === 'Filled') break;
    }
    assert.deepEqual(list.map(event => event.at), Array(6).fill(FROZEN), 'every event shares one timestamp');
    assert.deepEqual(list.map(event => [event.action, event.details.to ?? null]), [
      ['created', null],
      ['edited', null],
      ['approved', null],
      ['execution', 'Working'],
      ['execution', 'Partially Filled'],
      ['execution', 'Filled'],
    ]);
  } finally {
    mock.timers.reset();
    await frozenApp.close();
  }
});

test('GET /api/test/events shows the cancelled event after the order is gone (TEST-PLAN Q1, option B)', async () => {
  const created = await app.request('/api/orders', { method: 'POST', token: trader, body: ticket });
  const id = created.body.id;
  assert.equal((await app.request(`/api/orders/${id}`, { method: 'DELETE', token: trader })).status, 204);
  assert.equal((await events(id)).status, 404);

  // No auth, like the other /api/test hooks.
  const raw = await app.request(`/api/test/events?orderId=${id}`);
  assert.equal(raw.status, 200);
  assert.deepEqual(raw.body.map(event => [event.action, event.actor]), [['created', 'trader1'], ['cancelled', 'trader1']]);
  const cancelled = raw.body[1];
  assert.deepEqual(Object.keys(cancelled).sort(), ['action', 'actor', 'at', 'details', 'orderId']);
  assert.equal(cancelled.orderId, id);
  assert.deepEqual(cancelled.details, {});
  assert.ok(Date.parse(cancelled.at) >= Date.parse(raw.body[0].at));

  assert.deepEqual((await app.request('/api/test/events?orderId=ORD-9999')).body, []);
  const missing = await app.request('/api/test/events');
  assert.equal(missing.status, 400);
  assert.deepEqual(missing.body, { error: 'Validation failed.', details: { orderId: 'orderId is required.' } });
});

test('GET /api/test/events matches the public events route for a live order, and reset clears it', async () => {
  const id = (await app.request('/api/orders', { method: 'POST', token: trader, body: ticket })).body.id;
  assert.deepEqual((await app.request(`/api/test/events?orderId=${id}`)).body, (await events(id)).body);
  await app.request('/api/test/reset', { method: 'POST' });
  assert.deepEqual((await app.request(`/api/test/events?orderId=${id}`)).body, []);
});

test('each event uses the exact timestamp its order records, even when clock reads differ (BUG-1)', async () => {
  // Every `new Date()` without arguments returns the next millisecond, so two clock reads in one request always
  // differ, deterministically. Before the fix, created.at was one millisecond after createdAt.
  const RealDate = Date;
  let tick = RealDate.parse('2026-03-01T10:00:00.000Z');
  class TickingDate extends RealDate {
    constructor(...args) {
      if (args.length === 0) super(tick++);
      else super(...args);
    }
    static now() {
      return tick++;
    }
  }
  const tickingApp = await startApp({ config: { fillDelayMs: 0 } });
  globalThis.Date = TickingDate;
  try {
    const [owner, checker] = await Promise.all([tickingApp.login('trader1'), tickingApp.login('approver1')]);
    const read = async id => ({
      order: (await tickingApp.request(`/api/orders/${id}`, { token: owner })).body,
      events: (await tickingApp.request(`/api/orders/${id}/events`, { token: owner })).body,
    });

    // Created through POST, then edited (PATCH and PUT), approved and filled.
    const id = (await tickingApp.request('/api/orders', { method: 'POST', token: owner, body: ticket })).body.id;
    let { order, events } = await read(id);
    assert.equal(events[0].action, 'created');
    assert.equal(events[0].at, order.createdAt);

    await tickingApp.request(`/api/orders/${id}`, { method: 'PATCH', token: owner, body: { quantity: 11 } });
    ({ order, events } = await read(id));
    assert.equal(events.at(-1).action, 'edited');
    assert.equal(events.at(-1).at, order.updatedAt);
    await tickingApp.request(`/api/orders/${id}`, { method: 'PUT', token: owner, body: { ...ticket, quantity: 12 } });
    ({ order, events } = await read(id));
    assert.equal(events.at(-1).details.method, 'PUT');
    assert.equal(events.at(-1).at, order.updatedAt);

    await tickingApp.request(`/api/orders/${id}/approve`, { method: 'POST', token: checker });
    for (let attempt = 0; attempt < 50 && order.executionStatus !== 'Filled'; attempt += 1) ({ order, events } = await read(id));
    assert.equal(order.executionStatus, 'Filled');
    assert.equal(events.find(event => event.action === 'approved').at, order.decidedAt);
    assert.equal(events.find(event => event.details.to === 'Filled').at, order.filledAt);

    // Rejected, duplicated (DEV-02 TC06) and imported orders.
    const rejectedId = (await tickingApp.request('/api/orders', { method: 'POST', token: owner, body: ticket })).body.id;
    await tickingApp.request(`/api/orders/${rejectedId}/reject`, { method: 'POST', token: checker, body: { reason: 'Too big' } });
    ({ order, events } = await read(rejectedId));
    assert.equal(events.at(-1).action, 'rejected');
    assert.equal(events.at(-1).at, order.decidedAt);

    const copy = (await tickingApp.request(`/api/orders/${rejectedId}/duplicate`, { method: 'POST', token: owner })).body;
    ({ order, events } = await read(copy.id));
    assert.deepEqual(events.map(event => event.action), ['created']);
    assert.equal(events[0].at, order.createdAt);
    assert.equal(events[0].at, copy.createdAt);

    const imported = (await tickingApp.request('/api/orders/import', {
      method: 'POST', token: owner, headers: { 'Content-Type': 'text/csv' }, body: 'symbol,side,quantity,limitPrice\nACME,Buy,5,10\n',
    })).body.created[0];
    ({ order, events } = await read(imported.id));
    assert.equal(events[0].at, order.createdAt);
  } finally {
    globalThis.Date = RealDate;
    await tickingApp.close();
  }
});
