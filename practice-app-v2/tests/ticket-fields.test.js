import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { startApp } from './helpers.js';

let app;
let trader;
before(async () => {
  app = await startApp();
  trader = await app.login('trader1');
});
after(() => app.close());
beforeEach(() => app.request('/api/test/reset', { method: 'POST' }));

const ticket = { symbol: 'ACME', side: 'Buy', quantity: 10, limitPrice: 12.5 };
const post = body => app.request('/api/orders', { method: 'POST', token: trader, body });
const dayFromToday = days => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

test('a ticket without the new fields still gets 201, with the defaults', async () => {
  const { status, body } = await post(ticket);
  assert.equal(status, 201);
  assert.deepEqual({ timeInForce: body.timeInForce, goodTillDate: body.goodTillDate, urgent: body.urgent, notes: body.notes }, { timeInForce: 'Day', goodTillDate: null, urgent: false, notes: null });
});

test('GTD with a date, urgent and notes are stored; an empty note becomes null', async () => {
  const date = dayFromToday(3);
  const { status, body } = await post({ ...ticket, timeInForce: 'GTD', goodTillDate: date, urgent: true, notes: 'Hedge for Q1' });
  assert.equal(status, 201);
  assert.deepEqual([body.timeInForce, body.goodTillDate, body.urgent, body.notes], ['GTD', date, true, 'Hedge for Q1']);
  assert.equal((await post({ ...ticket, timeInForce: 'GTC', notes: '' })).body.notes, null);
  assert.equal((await post({ ...ticket, timeInForce: 'GTD', goodTillDate: dayFromToday(0) })).status, 201, 'today is allowed');
});

test('validation messages for the new fields', async () => {
  const cases = [
    [{ timeInForce: 'IOC' }, 'timeInForce', 'Time in force must be Day, GTC or GTD.'],
    [{ timeInForce: 'GTD' }, 'goodTillDate', 'Good till date is required for GTD and cannot be in the past.'],
    [{ timeInForce: 'GTD', goodTillDate: dayFromToday(-1) }, 'goodTillDate', 'Good till date is required for GTD and cannot be in the past.'],
    [{ timeInForce: 'GTD', goodTillDate: '2030-02-30' }, 'goodTillDate', 'Good till date is required for GTD and cannot be in the past.'],
    [{ timeInForce: 'Day', goodTillDate: dayFromToday(2) }, 'goodTillDate', 'Good till date is only allowed for GTD.'],
    [{ goodTillDate: dayFromToday(2) }, 'goodTillDate', 'Good till date is only allowed for GTD.'],
    [{ urgent: 'yes' }, 'urgent', 'Urgent must be true or false.'],
    [{ notes: 'x'.repeat(201) }, 'notes', 'Notes must be up to 200 characters.'],
  ];
  for (const [extra, key, message] of cases) {
    const response = await post({ ...ticket, ...extra });
    assert.equal(response.status, 400, JSON.stringify(extra));
    assert.deepEqual(response.body.details, { [key]: message }, JSON.stringify(extra));
  }
});

test('PATCH and PUT use the same rules; leaving GTD clears the date', async () => {
  const date = dayFromToday(5);
  const toGtd = await app.request('/api/orders/ORD-1003', { method: 'PATCH', token: trader, body: { timeInForce: 'GTD', goodTillDate: date } });
  assert.equal(toGtd.status, 200);
  assert.equal(toGtd.body.goodTillDate, date);
  const missingDate = await app.request('/api/orders/ORD-1003', { method: 'PATCH', token: trader, body: { goodTillDate: null } });
  assert.deepEqual(missingDate.body.details, { goodTillDate: 'Good till date is required for GTD and cannot be in the past.' });
  const back = await app.request('/api/orders/ORD-1003', { method: 'PATCH', token: trader, body: { timeInForce: 'Day' } });
  assert.equal(back.status, 200);
  assert.deepEqual([back.body.timeInForce, back.body.goodTillDate], ['Day', null]);
  const notes = await app.request('/api/orders/ORD-1003', { method: 'PATCH', token: trader, body: { notes: 'x'.repeat(201) } });
  assert.equal(notes.status, 400);
  const put = await app.request('/api/orders/ORD-1003', { method: 'PUT', token: trader, body: { symbol: 'CRSP', side: 'Buy', quantity: 5, limitPrice: 1, urgent: true } });
  assert.deepEqual([put.body.urgent, put.body.timeInForce, put.body.notes], [true, 'Day', null]);
});
