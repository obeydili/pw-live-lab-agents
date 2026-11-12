import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, beforeEach, test } from 'node:test';
import { parseCsv, toCsv } from '../server.js';
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

const fixture = name => readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8');
const importCsv = (body, token = trader, type = 'text/csv') =>
  app.request('/api/orders/import', { method: 'POST', token, body, headers: { 'Content-Type': type } });

test('export: CSV headers, file name with today (UTC), the header row and one row per order', async () => {
  const response = await app.request('/api/orders/export.csv', { token: approver });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'text/csv; charset=utf-8');
  assert.equal(response.headers.get('content-disposition'), `attachment; filename="orders-${new Date().toISOString().slice(0, 10)}.csv"`);
  const lines = response.text.trimEnd().split('\r\n');
  assert.equal(lines[0], 'id,clientOrderId,symbol,side,quantity,limitPrice,status,createdBy,createdAt');
  assert.equal(lines.length, 26);
  assert.equal(lines[1], 'ORD-1001,,ACME,Buy,100,42.5,Approved,trader1,2026-01-05T14:30:00.000Z');
});

test('export: filters and sort like GET /api/orders, page and pageSize ignored, bad values 400 JSON', async () => {
  const approved = await app.request('/api/orders/export.csv?status=Approved&sort=-createdAt&page=2&pageSize=1', { token: trader });
  const rows = approved.text.trimEnd().split('\r\n').slice(1);
  const listed = await app.request('/api/orders?status=Approved&page=1', { token: trader });
  assert.equal(String(rows.length), listed.headers.get('x-total-count'));
  assert.ok(rows.every(row => row.split(',')[6] === 'Approved'));
  assert.ok(rows[0].startsWith('ORD-1021,'), rows[0]);
  const bad = await app.request('/api/orders/export.csv?side=Hold', { token: trader });
  assert.equal(bad.status, 400);
  assert.deepEqual(bad.body.details, { side: 'Side must be Buy or Sell.' });
  assert.equal((await app.request('/api/orders/ORD-1001', { token: trader })).body.id, 'ORD-1001', 'the :id route still works');
});

test('export escapes commas, quotes and line breaks (RFC 4180) and writes null as an empty field', () => {
  const csv = toCsv([{ id: 'ORD-1', clientOrderId: 'a,"b"\nc', symbol: 'ACME', side: 'Buy', quantity: 1, limitPrice: 2, status: 'Approved', createdBy: 't', createdAt: 'x' }, { id: 'ORD-2', clientOrderId: null }]);
  const lines = csv.split('\r\n');
  assert.equal(lines[1], 'ORD-1,"a,""b""\nc",ACME,Buy,1,2,Approved,t,x');
  assert.equal(lines[2], 'ORD-2,,,,,,,,');
  assert.deepEqual(parseCsv(csv)[1].fields[1], 'a,"b"\nc');
});

test('import: a valid file creates every row', async () => {
  const { status, body } = await importCsv(fixture('orders-valid.csv'));
  assert.equal(status, 200);
  assert.equal(body.created.length, 3);
  assert.deepEqual(body.errors, []);
  assert.deepEqual(body.created.map(order => [order.id, order.symbol, order.clientOrderId, order.createdBy]), [
    ['ORD-1026', 'ACME', 'IMPORT-1', 'trader1'],
    ['ORD-1027', 'BLUE', null, 'trader1'],
    ['ORD-1028', 'ECHO', 'IMPORT-3', 'trader1'],
  ]);
  assert.equal(body.created[2].quantity, 12000);
});

test('import: partial success reports the bad rows by file line', async () => {
  const { status, body } = await importCsv(fixture('orders-mixed.csv'));
  assert.equal(status, 200);
  assert.equal(body.created.length, 2);
  assert.deepEqual(body.errors, [
    { line: 4, details: { quantity: 'Quantity must be a whole number from 1 to 1000000.' } },
    { line: 5, details: { symbol: 'Choose a valid symbol.' } },
  ]);
  const duplicate = await importCsv('symbol,side,quantity,limitPrice,clientOrderId\nACME,Buy,1,1,V2-SEED-07\nACME,Buy,1,1,NEW\nACME,Buy,1,1,NEW\n');
  assert.deepEqual(duplicate.body.errors.map(error => [error.line, error.details.clientOrderId]), [
    [2, 'clientOrderId V2-SEED-07 already exists.'],
    [4, 'clientOrderId NEW already exists.'],
  ]);
});

test('import refusals: 400 bad header, 400 no rows, 413 over 100 rows, 415 not CSV, 403 approver', async () => {
  assert.deepEqual((await importCsv(fixture('orders-bad-header.csv'))).body, { error: 'CSV header must be symbol,side,quantity,limitPrice[,clientOrderId].' });
  const noRows = await importCsv('symbol,side,quantity,limitPrice\n\n');
  assert.equal(noRows.status, 400);
  assert.deepEqual(noRows.body, { error: 'CSV has no data rows.' });
  const tooMany = await importCsv(`symbol,side,quantity,limitPrice\n${'ACME,Buy,1,1\n'.repeat(101)}`);
  assert.equal(tooMany.status, 413);
  assert.deepEqual(tooMany.body, { error: 'CSV can have at most 100 rows.' });
  const json = await importCsv(JSON.stringify({ csv: 'x' }), trader, 'application/json');
  assert.equal(json.status, 415);
  assert.deepEqual(json.body, { error: 'Content-Type must be text/csv.' });
  assert.equal((await importCsv(fixture('orders-valid.csv'), approver)).status, 403);
  assert.equal((await app.request('/api/orders', { token: trader })).body.length, 25, 'nothing was created');
});
