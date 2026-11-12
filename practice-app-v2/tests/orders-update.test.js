import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { startApp } from './helpers.js';

let app;
let trader1;
let trader2;
let approver;
before(async () => {
  app = await startApp();
  [trader1, trader2, approver] = await Promise.all([app.login('trader1'), app.login('trader2'), app.login('approver1')]);
});
after(() => app.close());
beforeEach(() => app.request('/api/test/reset', { method: 'POST' }));

const call = (method, path, token, body) => app.request(path, { method, token, body });

test('every order carries updatedAt: null until it changes', async () => {
  const { body } = await call('GET', '/api/orders', trader1);
  assert.ok(body.every(order => order.updatedAt === null));
  const created = await call('POST', '/api/orders', trader1, { symbol: 'ACME', side: 'Buy', quantity: 1, limitPrice: 1 });
  assert.equal(created.body.updatedAt, null);
});

test('PATCH: the owner changes one field and gets the full order with updatedAt', async () => {
  const response = await call('PATCH', '/api/orders/ORD-1003', trader1, { quantity: 75 });
  assert.equal(response.status, 200);
  assert.equal(response.body.quantity, 75);
  assert.equal(response.body.symbol, 'CRSP');
  assert.equal(response.body.side, 'Buy');
  assert.match(response.body.updatedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal((await call('GET', '/api/orders/ORD-1003', trader1)).body.quantity, 75);
});

test('PATCH refusals in order: 404, 403 not owner, 409 not pending, 403 for an approver', async () => {
  assert.deepEqual((await call('PATCH', '/api/orders/ORD-9999', trader1, { quantity: 1 })).body, { error: 'Order ORD-9999 not found.' });
  const notOwner = await call('PATCH', '/api/orders/ORD-1003', trader2, { quantity: 1 });
  assert.equal(notOwner.status, 403);
  assert.deepEqual(notOwner.body, { error: 'You can only change your own orders.' });
  const decided = await call('PATCH', '/api/orders/ORD-1001', trader1, { quantity: 1 });
  assert.equal(decided.status, 409);
  assert.deepEqual(decided.body, { error: 'Order ORD-1001 is already Approved.' });
  const approverTry = await call('PATCH', '/api/orders/ORD-1003', approver, { quantity: 1 });
  assert.equal(approverTry.status, 403);
  assert.deepEqual(approverTry.body, { error: 'Only a trader can do this.' });
  // Not pending is checked before validation.
  assert.equal((await call('PATCH', '/api/orders/ORD-1001', trader1, { symbol: 'BLUE' })).status, 409);
});

test('PATCH validation: symbol, unknown keys, bad values, empty body, and a clientOrderId of another order', async () => {
  const symbol = await call('PATCH', '/api/orders/ORD-1003', trader1, { symbol: 'BLUE' });
  assert.equal(symbol.status, 400);
  assert.deepEqual(symbol.body, { error: 'Validation failed.', details: { symbol: 'Symbol cannot be changed.' } });
  const unknown = await call('PATCH', '/api/orders/ORD-1003', trader1, { colour: 'red', quantity: 0 });
  assert.deepEqual(unknown.body.details, { colour: 'Unknown field.', quantity: 'Quantity must be a whole number from 1 to 1000000.' });
  const empty = await call('PATCH', '/api/orders/ORD-1003', trader1, {});
  assert.equal(empty.status, 400);
  assert.deepEqual(empty.body, { error: 'Nothing to update.' });
  const duplicate = await call('PATCH', '/api/orders/ORD-1003', trader1, { clientOrderId: 'V2-SEED-07' });
  assert.equal(duplicate.status, 409);
  assert.deepEqual(duplicate.body, { error: 'clientOrderId V2-SEED-07 already exists.' });
});

test('PUT replaces the editable fields; clientOrderId left out becomes null', async () => {
  await call('PATCH', '/api/orders/ORD-1003', trader1, { clientOrderId: 'mine' });
  const response = await call('PUT', '/api/orders/ORD-1003', trader1, { symbol: 'CRSP', side: 'Sell', quantity: 5, limitPrice: 99.5 });
  assert.equal(response.status, 200);
  assert.deepEqual(
    { side: response.body.side, quantity: response.body.quantity, limitPrice: response.body.limitPrice, clientOrderId: response.body.clientOrderId },
    { side: 'Sell', quantity: 5, limitPrice: 99.5, clientOrderId: null },
  );
  assert.ok(response.body.updatedAt);
});

test('PUT validation: a missing side, a different symbol, and 403/409 like PATCH', async () => {
  const missing = await call('PUT', '/api/orders/ORD-1003', trader1, { symbol: 'CRSP', quantity: 5, limitPrice: 1 });
  assert.equal(missing.status, 400);
  assert.deepEqual(missing.body.details, { side: 'Side must be Buy or Sell.' });
  const symbol = await call('PUT', '/api/orders/ORD-1003', trader1, { symbol: 'BLUE', side: 'Buy', quantity: 5, limitPrice: 1 });
  assert.deepEqual(symbol.body.details, { symbol: 'Symbol cannot be changed.' });
  assert.equal((await call('PUT', '/api/orders/ORD-1003', trader2, { symbol: 'CRSP', side: 'Buy', quantity: 5, limitPrice: 1 })).status, 403);
  assert.equal((await call('PUT', '/api/orders/ORD-1002', trader1, { symbol: 'BLUE', side: 'Buy', quantity: 5, limitPrice: 1 })).status, 409);
});

test('DELETE: 204 with no body, then GET and a second DELETE are 404', async () => {
  const deleted = await call('DELETE', '/api/orders/ORD-1003', trader1);
  assert.equal(deleted.status, 204);
  assert.equal(deleted.text, '');
  assert.equal((await call('GET', '/api/orders/ORD-1003', trader1)).status, 404);
  assert.equal((await call('DELETE', '/api/orders/ORD-1003', trader1)).status, 404);
  assert.equal((await call('DELETE', '/api/orders/ORD-1009', trader1)).status, 403, 'ORD-1009 is trader2\'s');
});

test('logout with a Bearer token ends that token; cookie logout still works', async () => {
  const token = await app.login('trader1');
  assert.equal((await call('GET', '/api/me', token)).status, 200);
  const logout = await call('POST', '/api/auth/logout', token);
  assert.equal(logout.status, 204);
  assert.equal((await call('GET', '/api/me', token)).status, 401);

  const login = await fetch(`${app.baseUrl}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'trader2', password: 'Password123!' }) });
  const cookie = login.headers.get('set-cookie').split(';')[0];
  assert.equal((await app.request('/api/me', { headers: { Cookie: cookie } })).status, 200);
  const cookieLogout = await app.request('/api/auth/logout', { method: 'POST', headers: { Cookie: cookie } });
  assert.equal(cookieLogout.status, 204);
  assert.match(cookieLogout.headers.get('set-cookie'), /tdl_session=;/);
  assert.equal((await app.request('/api/me', { headers: { Cookie: cookie } })).status, 401);
});

test('a malformed JSON body gets 400 JSON', async () => {
  const response = await app.request('/api/orders', { method: 'POST', token: trader1, body: '{bad json', headers: { 'Content-Type': 'application/json' } });
  assert.equal(response.status, 400);
  assert.deepEqual(response.body, { error: 'Malformed JSON body.' });
  const login = await app.request('/api/auth/login', { method: 'POST', body: '{bad', headers: { 'Content-Type': 'application/json' } });
  assert.deepEqual(login.body, { error: 'Malformed JSON body.' });
});
