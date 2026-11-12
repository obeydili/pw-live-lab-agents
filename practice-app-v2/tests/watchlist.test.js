import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { startApp } from './helpers.js';

let app;
let trader;
let approver;
before(async () => {
  app = await startApp();
  [trader, approver] = await Promise.all([app.login('trader1'), app.login('approver1')]);
});
after(() => app.close());
beforeEach(() => app.request('/api/test/reset', { method: 'POST' }));

const put = (symbols, token = trader) => app.request('/api/watchlist', { method: 'PUT', token, body: { symbols } });

test('GET starts empty; PUT replaces the whole list, in order; it is per user', async () => {
  assert.deepEqual((await app.request('/api/watchlist', { token: trader })).body, { symbols: [] });
  assert.deepEqual((await put(['ECHO', 'ACME'])).body, { symbols: ['ECHO', 'ACME'] });
  assert.deepEqual((await put(['BLUE'])).body, { symbols: ['BLUE'] });
  assert.deepEqual((await app.request('/api/watchlist', { token: trader })).body, { symbols: ['BLUE'] });
  assert.deepEqual((await app.request('/api/watchlist', { token: approver })).body, { symbols: [] });
  assert.deepEqual((await put([])).body, { symbols: [] });
});

test('PUT refuses duplicates, unknown symbols and anything that is not an array', async () => {
  for (const symbols of [['ACME', 'ACME'], ['XYZ'], 'ACME', undefined]) {
    const response = await put(symbols);
    assert.equal(response.status, 400, JSON.stringify(symbols));
    assert.deepEqual(response.body, { error: 'Validation failed.', details: { symbols: 'Symbols must be an array of unique, valid symbols.' } });
  }
});

test('reset clears every watchlist; signed out is 401', async () => {
  await put(['ACME']);
  await app.request('/api/test/reset', { method: 'POST' });
  assert.deepEqual((await app.request('/api/watchlist', { token: trader })).body, { symbols: [] });
  assert.equal((await app.request('/api/watchlist')).status, 401);
});
