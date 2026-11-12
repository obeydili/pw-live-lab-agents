import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, test } from 'node:test';
import { startApp } from './helpers.js';

let app;
let token;
before(async () => {
  app = await startApp();
  token = await app.login('trader1');
});
after(() => app.close());

const seed = JSON.parse(readFileSync(new URL('../data/seed.json', import.meta.url), 'utf8'));

test('seed quotes: every symbol, bid < last < ask, at most 2 decimals', () => {
  assert.deepEqual(Object.keys(seed.quotes).sort(), [...seed.symbols].sort());
  for (const [symbol, { last, bid, ask }] of Object.entries(seed.quotes)) {
    assert.ok(bid < last && last < ask, symbol);
    for (const value of [last, bid, ask]) assert.equal(Math.round(value * 100) / 100, value, `${symbol} ${value}`);
  }
});

test('GET /api/quotes/:symbol: 200 with asOf, 404 for an unknown symbol, 401 signed out', async () => {
  const before = Date.now();
  const { status, body } = await app.request('/api/quotes/BLUE', { token });
  assert.equal(status, 200);
  assert.deepEqual({ ...body, asOf: undefined }, { symbol: 'BLUE', ...seed.quotes.BLUE, asOf: undefined });
  assert.ok(Date.parse(body.asOf) >= before - 1000);
  const unknown = await app.request('/api/quotes/XYZ', { token });
  assert.equal(unknown.status, 404);
  assert.deepEqual(unknown.body, { error: 'Symbol XYZ not found.' });
  assert.equal((await app.request('/api/quotes/BLUE')).status, 401);
});

test('the quote page, the widget and the ticket iframe are served to signed-in users', async () => {
  const login = await fetch(`${app.baseUrl}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'trader1', password: 'Password123!' }) });
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const html = async path => (await fetch(`${app.baseUrl}${path}`, { headers: { Cookie: cookie } })).text();
  const quote = await html('/quotes/ACME');
  for (const hook of ['data-page="quote"', '<nav aria-label="Main">', 'data-field="last"', 'data-field="bid"', 'data-field="ask"', 'id="quote-error" class="error" role="alert" hidden']) assert.ok(quote.includes(hook), hook);
  const widget = await html('/widgets/quote?symbol=ACME');
  for (const hook of ['data-page="widget-quote"', '<h2>Market quote</h2>', 'data-testid="last-price"', 'data-testid="bid-price"', 'data-testid="ask-price"', '>Use last price</button>', 'Choose a symbol to see a quote.']) assert.ok(widget.includes(hook), hook);
  assert.ok(!widget.includes('<nav'), 'the widget has no header or nav');
  assert.ok((await html('/orders/new')).includes('<iframe id="quote-frame" title="Market quote" src="/widgets/quote"></iframe>'));
  assert.ok((await html('/orders/ORD-1001')).includes('<a id="open-quote" href="/orders" target="_blank" rel="noopener" hidden>Open quote</a>'));
  const signedOut = await fetch(`${app.baseUrl}/widgets/quote`, { redirect: 'manual' });
  assert.equal(signedOut.status, 302);
  const js = readFileSync(new URL('../public/static/app.js', import.meta.url), 'utf8');
  assert.ok(js.includes("window.parent.postMessage({ type: 'use-price', price: quote.last }, window.location.origin)"));
  assert.ok(js.includes("event.origin !== window.location.origin || event.data?.type !== 'use-price'"));
});
