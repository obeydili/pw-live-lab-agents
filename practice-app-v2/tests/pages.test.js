// The pages carry the hooks the challenges target (behavior is checked in a browser by the Live Lab challenges).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, test } from 'node:test';
import { startApp } from './helpers.js';

let app;
let traderCookie;
before(async () => {
  app = await startApp();
  const login = await fetch(`${app.baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'trader1', password: 'Password123!' }),
  });
  traderCookie = login.headers.get('set-cookie').split(';')[0];
});
after(() => app.close());

const pageHtml = async (path, cookie = traderCookie) => {
  const response = await fetch(`${app.baseUrl}${path}`, { headers: { Cookie: cookie }, redirect: 'manual' });
  return { status: response.status, html: await response.text() };
};

const appJs = readFileSync(new URL('../public/static/app.js', import.meta.url), 'utf8');

test('V2-04: /orders has the filters, sortable headers, pagination and states', async () => {
  const { status, html } = await pageHtml('/orders');
  assert.equal(status, 200);
  for (const hook of [
    '<form role="search" aria-label="Filter orders"',
    '<option value="">All statuses</option>',
    '<option value="">All symbols</option>',
    '<label for="filter-q">Search orders</label>',
    'type="search" placeholder="Order ID, symbol or client ID"',
    '>Clear filters</button>',
    '<caption>All orders, newest first</caption>',
    'aria-sort="none" data-sort="id"><button type="button" class="sort">Order ID</button>',
    'data-sort="limitPrice"><button type="button" class="sort">Limit price</button>',
    '<nav aria-label="Pagination"',
    '>Previous page</button>',
    '>Next page</button>',
    'data-testid="page-info"',
    '<label for="page-size" class="inline-label">Rows per page</label>',
    'data-testid="results-count"',
    '<p id="orders-empty" hidden>No orders yet.</p>',
    '<p id="orders-no-match" hidden>No orders match your filters.</p>',
    'id="orders-error" class="error-box" role="alert" hidden',
    'Could not load orders.',
  ]) {
    assert.ok(html.includes(hook), hook);
  }
  // The search is debounced and the default sort is newest first.
  assert.ok(appJs.includes('const SEARCH_DEBOUNCE_MS = 300;'));
  assert.ok(appJs.includes("sort: '-createdAt'"));
  assert.ok(appJs.includes('history.replaceState'));
});

test('V2-04: /approvals has the load error state', async () => {
  const login = await fetch(`${app.baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'approver1', password: 'Password123!' }),
  });
  const { status, html } = await pageHtml('/approvals', login.headers.get('set-cookie').split(';')[0]);
  assert.equal(status, 200);
  assert.ok(html.includes('id="approvals-error" class="error-box" role="alert" hidden'));
  assert.ok(html.includes('Could not load approvals.'));
});

test('V2-06: every page but login has the toast region; list and detail pages have their spinner', async () => {
  const pages = { '/orders': 'Loading orders', '/orders/ORD-1001': 'Loading order', '/orders/new': null };
  for (const [path, spinner] of Object.entries(pages)) {
    const { html } = await pageHtml(path);
    assert.ok(html.includes('<div id="toast-region" class="toast-region" aria-live="polite"></div>'), path);
    if (spinner) assert.ok(html.includes(`<div class="spinner" role="progressbar" aria-label="${spinner}" data-testid="loading-spinner" hidden></div>`), path);
  }
  const login = await pageHtml('/login', '');
  assert.ok(!login.html.includes('toast-region'));
  assert.ok(appJs.includes('const TOAST_MS = 4000;'));
  assert.ok(appJs.includes("dismiss.setAttribute('aria-label', 'Dismiss notification')"));
});

test('V2-07: the ticket has Time in force, a hidden Good till date, Mark as urgent and Notes with a counter; details show them', async () => {
  const { html } = await pageHtml('/orders/new');
  const order = ['<label for="limitPrice">Limit price</label>', '<label for="timeInForce">Time in force</label>', '<div id="good-till-date-field" hidden>', '<input type="date" id="goodTillDate" name="goodTillDate">', 'Mark as urgent</label>', '<label for="notes">Notes (optional)</label>', '<textarea id="notes" name="notes" maxlength="200"', '<p data-testid="notes-counter" class="help">0 / 200</p>', '<p id="order-error"'];
  let at = -1;
  for (const hook of order) {
    const next = html.indexOf(hook);
    assert.ok(next > at, `${hook} is missing or out of order`);
    at = next;
  }
  for (const option of ['<option value="Day" selected>Day</option>', '<option value="GTC">Good till cancelled</option>', '<option value="GTD">Good till date</option>']) {
    assert.ok(html.includes(option), option);
  }
  const details = (await pageHtml('/orders/ORD-1001')).html;
  for (const field of ['timeInForce', 'goodTillDate', 'urgent', 'notes', 'executionStatus', 'filledAt']) assert.ok(details.includes(`data-field="${field}"`), field);
});

test('V2-08: /orders has Export CSV, the import page is trader-only, and every page links to it for traders', async () => {
  const orders = (await pageHtml('/orders')).html;
  assert.ok(orders.includes('<a id="export-csv" href="/api/orders/export.csv?sort=-createdAt" download>Export CSV</a>'));
  assert.ok(orders.includes('<a href="/orders/import" data-role="trader">Import orders</a>'));
  const { status, html } = await pageHtml('/orders/import');
  assert.equal(status, 200);
  for (const hook of ['data-page="orders-import"', '<h1>Import orders</h1>', '<label for="csv-file">Orders CSV file</label>', '<input type="file" id="csv-file" name="csvFile" accept=".csv,text/csv">', '<p data-testid="selected-file" class="help">No file chosen</p>', '>Upload</button>', '<caption>Import results</caption>', 'data-testid="import-summary"']) {
    assert.ok(html.includes(hook), hook);
  }
  const login = await fetch(`${app.baseUrl}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'approver1', password: 'Password123!' }) });
  const approverPage = await pageHtml('/orders/import', login.headers.get('set-cookie').split(';')[0]);
  assert.equal(approverPage.status, 403);
  assert.ok(approverPage.html.includes('Not allowed'));
});

test('V2-09: the details page has the actions area and the Rejection reason row; the dialog texts are in place', async () => {
  const { html } = await pageHtml('/orders/ORD-1003');
  assert.ok(html.includes('<dt>Rejection reason</dt><dd data-field="rejectionReason"></dd>'));
  assert.ok(html.includes('<div id="order-actions" class="actions" hidden></div>'));
  for (const text of ["textContent: 'Cancel order'", 'Cancel order ${order.id}? This cannot be undone.', "textContent: 'Reject with reason…'", "window.prompt('Reason for rejection:')", "window.alert('A rejection reason is required.')", "window.alert('Choose a CSV file first.')", 'Order ${cancelled} cancelled.']) {
    assert.ok(appJs.includes(text), text);
  }
});

test('V2-11: the Limit price tooltip, the shortcuts help, the watchlist page and its nav link', async () => {
  const ticket = (await pageHtml('/orders/new')).html;
  // Named "About limit price" by hidden text, not aria-label, so getByLabel('Limit price') still finds only the input.
  assert.ok(ticket.includes('<label for="limitPrice">Limit price</label>\n        <button type="button" class="info" aria-describedby="limit-price-tip"><span aria-hidden="true">?</span><span class="visually-hidden">About limit price</span></button>'));
  assert.ok(!ticket.includes('aria-label="About limit price"'));
  assert.ok(ticket.includes('<div id="limit-price-tip" role="tooltip" hidden>The highest price you will pay to buy, or the lowest you will accept to sell.</div>'));
  const orders = (await pageHtml('/orders')).html;
  assert.ok(orders.includes('data-testid="shortcuts-help"'));
  assert.ok(orders.includes('<a href="/watchlist">Watchlist</a>'));
  const { status, html } = await pageHtml('/watchlist');
  assert.equal(status, 200);
  assert.ok(html.includes('<ul aria-label="Available symbols"'));
  assert.ok(html.includes('<ul aria-label="My watchlist"'));
  for (const text of ["li.setAttribute('data-testid', `symbol-${symbol}`)", "{ draggable: true, className: 'symbol-item' }", "toast('Watchlist saved.')", "event.altKey && event.code === 'KeyN'"]) {
    assert.ok(appJs.includes(text), text);
  }
});

