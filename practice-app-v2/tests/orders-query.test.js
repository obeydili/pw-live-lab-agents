import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { startApp } from './helpers.js';

let app;
let token;
before(async () => {
  app = await startApp();
  token = await app.login('trader1');
});
after(() => app.close());

const get = path => app.request(path, { token });

test('without parameters the list is unchanged: all 25, insertion order, no paging headers', async () => {
  const response = await get('/api/orders');
  assert.equal(response.body.length, 25);
  assert.equal(response.body[0].id, 'ORD-1001');
  assert.equal(response.body[24].id, 'ORD-1025');
  assert.equal(response.headers.get('x-total-count'), null);
});

test('?status=Pending%20Approval behaves as before; an unknown status gives []', async () => {
  const pending = await get('/api/orders?status=Pending%20Approval');
  assert.equal(pending.body.length, 9);
  assert.ok(pending.body.every(order => order.status === 'Pending Approval'));
  assert.deepEqual((await get('/api/orders?status=Cancelled')).body, []);
});

test('symbol + side + sort=-limitPrice: only ACME Buy orders, priciest first', async () => {
  const { status, body } = await get('/api/orders?symbol=ACME&side=Buy&sort=-limitPrice');
  assert.equal(status, 200);
  assert.ok(body.length >= 2);
  assert.ok(body.every(order => order.symbol === 'ACME' && order.side === 'Buy'));
  const prices = body.map(order => order.limitPrice);
  assert.deepEqual(prices, [...prices].sort((a, b) => b - a));
});

test('createdBy and q filters; q is trimmed, case-insensitive, and matches id, symbol or clientOrderId', async () => {
  const byTrader2 = await get('/api/orders?createdBy=trader2');
  assert.equal(byTrader2.body.length, 8);
  assert.deepEqual((await get('/api/orders?createdBy=nobody')).body, []);
  assert.deepEqual((await get('/api/orders?q=%20v2-seed-07%20')).body.map(order => order.id), ['ORD-1010']);
  assert.deepEqual((await get('/api/orders?q=ord-1002')).body.map(order => order.id), ['ORD-1002']);
  assert.ok((await get('/api/orders?q=acme')).body.every(order => order.symbol === 'ACME'));
  assert.equal((await get('/api/orders?q=%20%20')).body.length, 25);
});

test('sorting: ascending and descending, ties broken by id ascending', async () => {
  const bySide = (await get('/api/orders?sort=side')).body;
  const buys = bySide.filter(order => order.side === 'Buy').map(order => order.id);
  assert.deepEqual(buys, [...buys].sort());
  assert.equal(bySide[0].side, 'Buy');
  const newest = (await get('/api/orders?sort=-createdAt')).body;
  assert.equal(newest[0].id, 'ORD-1025');
  const statusDesc = (await get('/api/orders?sort=-status')).body;
  assert.equal(statusDesc[0].status, 'Rejected');
  const rejectedIds = statusDesc.filter(order => order.status === 'Rejected').map(order => order.id);
  assert.deepEqual(rejectedIds, [...rejectedIds].sort());
});

test('pagination: page 3 of 10 has 5 items and the paging headers; past the end is [] with headers', async () => {
  const third = await get('/api/orders?page=3&pageSize=10');
  assert.equal(third.status, 200);
  assert.equal(third.body.length, 5);
  assert.equal(third.headers.get('x-total-count'), '25');
  assert.equal(third.headers.get('x-total-pages'), '3');
  assert.equal(third.headers.get('x-page'), '3');
  assert.equal(third.headers.get('x-page-size'), '10');
  const defaults = await get('/api/orders?page=1');
  assert.equal(defaults.body.length, 10);
  const past = await get('/api/orders?page=9&pageSize=10&status=Approved');
  assert.deepEqual(past.body, []);
  assert.equal(past.headers.get('x-total-count'), '9');
  const none = await get('/api/orders?pageSize=5&createdBy=nobody');
  assert.equal(none.headers.get('x-total-pages'), '1');
});

test('bad parameters: 400 with the matching details key and message', async () => {
  const cases = [
    ['pageSize=0', 'pageSize', 'Page size must be a whole number from 1 to 100.'],
    ['pageSize=101', 'pageSize', 'Page size must be a whole number from 1 to 100.'],
    ['page=abc', 'page', 'Page must be a whole number of 1 or more.'],
    ['page=0', 'page', 'Page must be a whole number of 1 or more.'],
    ['sort=price', 'sort', 'Sort must be one of id, symbol, side, quantity, limitPrice, status, createdAt, optionally prefixed with -.'],
    ['side=Hold', 'side', 'Side must be Buy or Sell.'],
    ['symbol=XYZ', 'symbol', 'Choose a valid symbol.'],
  ];
  for (const [query, key, message] of cases) {
    const response = await get(`/api/orders?${query}`);
    assert.equal(response.status, 400, query);
    assert.equal(response.body.error, 'Validation failed.');
    assert.deepEqual(response.body.details, { [key]: message }, query);
  }
});
