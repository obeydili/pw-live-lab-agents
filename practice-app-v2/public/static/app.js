// Trade Desk Lite front end. Each page sets <body data-page="..."> and gets one init function.
// Everything is rendered with textContent (never innerHTML), so order data cannot inject markup.

const api = async (path, options = {}) => {
  let response;
  try {
    response = await fetch(path, {
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      ...options,
    });
  } catch {
    // Network failure (or an aborted route): report it like a server error.
    return { status: 0, ok: false, body: null, headers: new Headers() };
  }
  const body = response.status === 204 ? null : await response.json().catch(() => null);
  return { status: response.status, ok: response.ok, body, headers: response.headers };
};

const el = (tag, props = {}, children = []) => {
  const node = document.createElement(tag);
  Object.assign(node, props);
  for (const child of children) node.append(child);
  return node;
};

const formatPrice = value => Number(value).toFixed(2);
const formatQuantity = value => Number(value).toLocaleString('en-US');
const statusClass = status => `badge badge-${status.toLowerCase().replace(/\s+/g, '-')}`;

const showMessage = (id, text) => {
  const node = document.getElementById(id);
  if (!node) return;
  node.textContent = text;
  node.hidden = !text;
};

/** Shows the page's loading spinner while `work` runs, then hides it again. */
const whileLoading = async work => {
  const spinner = document.querySelector('[data-testid="loading-spinner"]');
  if (spinner) spinner.hidden = false;
  try {
    return await work();
  } finally {
    if (spinner) spinner.hidden = true;
  }
};

const TOAST_MS = 4000;

/** A short notification that removes itself after 4 s (or at once with ×). Kept apart from #flash, which stays. */
const toast = (text, variant = 'success') => {
  const region = document.getElementById('toast-region');
  if (!region) return;
  const dismiss = el('button', { type: 'button', className: 'toast-dismiss', textContent: '×' });
  dismiss.setAttribute('aria-label', 'Dismiss notification');
  const node = el('div', { className: `toast toast-${variant}` }, [el('span', { textContent: text }), dismiss]);
  node.setAttribute('role', 'alert');
  node.setAttribute('data-testid', 'toast');
  const timer = window.setTimeout(() => node.remove(), TOAST_MS);
  dismiss.addEventListener('click', () => {
    window.clearTimeout(timer);
    node.remove();
  });
  region.append(node);
};

const initHeader = async () => {
  const { ok, body: user } = await api('/api/me');
  if (!ok) return null;
  document.getElementById('current-user').textContent = `${user.displayName} (${user.role})`;
  document.querySelectorAll('[data-role]').forEach(node => {
    node.hidden = node.dataset.role !== user.role;
  });
  document.getElementById('sign-out').addEventListener('click', async () => {
    await api('/api/auth/logout', { method: 'POST' });
    window.location.assign('/login');
  });
  return user;
};

const initLogin = () => {
  const form = document.getElementById('login-form');
  form.addEventListener('submit', async event => {
    event.preventDefault();
    showMessage('login-error', '');
    const { ok, body } = await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username: form.username.value.trim(), password: form.password.value }),
    });
    if (!ok) {
      showMessage('login-error', body?.error || 'Sign in failed.');
      return;
    }
    const next = new URLSearchParams(window.location.search).get('next');
    window.location.assign(next && next.startsWith('/') && !next.startsWith('//') ? next : '/orders');
  });
};

// The orders table's state, mirrored in the URL (defaults left out).
const ORDER_DEFAULTS = { status: '', symbol: '', q: '', sort: '-createdAt', page: 1, pageSize: 10 };
const SEARCH_DEBOUNCE_MS = 300;

const readOrdersUrl = () => {
  const params = new URLSearchParams(window.location.search);
  const number = (value, fallback) => (/^\d+$/.test(value ?? '') && Number(value) >= 1 ? Number(value) : fallback);
  return {
    status: params.get('status') ?? '',
    symbol: params.get('symbol') ?? '',
    q: params.get('q') ?? '',
    sort: params.get('sort') || ORDER_DEFAULTS.sort,
    page: number(params.get('page'), 1),
    pageSize: [10, 25, 50].includes(number(params.get('pageSize'), 10)) ? number(params.get('pageSize'), 10) : 10,
  };
};

const ordersQuery = (view, { withDefaults }) => {
  const params = new URLSearchParams();
  for (const key of ['status', 'symbol', 'q', 'sort', 'page', 'pageSize']) {
    const value = key === 'q' ? view.q.trim() : view[key];
    if (withDefaults ? value !== '' : value !== '' && value !== ORDER_DEFAULTS[key]) params.set(key, String(value));
  }
  return params.toString();
};

const initOrders = async () => {
  const user = await initHeader();
  const tbody = document.getElementById('orders-body');
  const filters = document.getElementById('orders-filters');
  const statusSelect = document.getElementById('filter-status');
  const symbolSelect = document.getElementById('filter-symbol');
  const search = document.getElementById('filter-q');
  const pageSizeSelect = document.getElementById('page-size');
  const prev = document.getElementById('prev-page');
  const next = document.getElementById('next-page');
  const pageInfo = document.querySelector('[data-testid="page-info"]');
  const resultsCount = document.querySelector('[data-testid="results-count"]');
  const errorBox = document.getElementById('orders-error');
  const sortHeaders = [...document.querySelectorAll('th[data-sort]')];

  const cancelled = new URLSearchParams(window.location.search).get('cancelled');
  if (cancelled) showMessage('flash', `Order ${cancelled} cancelled.`);
  const view = readOrdersUrl();
  let totalPages = 1;
  let loadNumber = 0;
  let searchTimer;

  const { body: symbols } = await api('/api/symbols');
  for (const symbol of symbols || []) symbolSelect.append(el('option', { value: symbol, textContent: symbol }));

  const syncControls = () => {
    statusSelect.value = view.status;
    symbolSelect.value = view.symbol;
    if (document.activeElement !== search) search.value = view.q;
    pageSizeSelect.value = String(view.pageSize);
    const sortField = view.sort.replace(/^-/, '');
    for (const th of sortHeaders) {
      th.setAttribute('aria-sort', th.dataset.sort !== sortField ? 'none' : view.sort.startsWith('-') ? 'descending' : 'ascending');
    }
  };

  const renderRows = orders => {
    tbody.replaceChildren();
    for (const order of orders) {
      const badge = el('span', { className: statusClass(order.status), textContent: order.status });
      badge.setAttribute('data-testid', 'order-status');
      tbody.append(
        el('tr', {}, [
          el('td', { textContent: order.id }),
          el('td', { textContent: order.symbol }),
          el('td', { textContent: order.side }),
          el('td', { textContent: formatQuantity(order.quantity) }),
          el('td', { textContent: formatPrice(order.limitPrice) }),
          el('td', {}, [badge]),
          // Every row has the same "View" link name on purpose: practice scoping a locator to one row.
          el('td', {}, [el('a', { href: `/orders/${encodeURIComponent(order.id)}`, textContent: 'View' })]),
        ]),
      );
    }
  };

  const load = async () => {
    const number = ++loadNumber;
    syncControls();
    const urlQuery = ordersQuery(view, { withDefaults: false });
    history.replaceState(null, '', urlQuery ? `/orders?${urlQuery}` : '/orders');
    // The export takes the same filters and sort, without paging.
    const exportQuery = ordersQuery({ ...view, page: '', pageSize: '' }, { withDefaults: true });
    document.getElementById('export-csv').href = `/api/orders/export.csv?${exportQuery}`;
    const spinner = document.querySelector('[data-testid="loading-spinner"]');
    spinner.hidden = false;
    const { ok, body: orders, headers } = await api(`/api/orders?${ordersQuery(view, { withDefaults: true })}`);
    if (number !== loadNumber) return; // A newer request is on its way (and owns the spinner).
    spinner.hidden = true;
    if (!ok || !Array.isArray(orders)) {
      tbody.replaceChildren();
      errorBox.hidden = false;
      document.getElementById('orders-empty').hidden = true;
      document.getElementById('orders-no-match').hidden = true;
      return;
    }
    errorBox.hidden = true;
    const total = Number(headers.get('X-Total-Count') ?? orders.length);
    totalPages = Number(headers.get('X-Total-Pages') ?? 1);
    if (view.page > totalPages) {
      view.page = totalPages;
      load();
      return;
    }
    renderRows(orders);
    const filtered = !!(view.status || view.symbol || view.q.trim());
    document.getElementById('orders-empty').hidden = !(total === 0 && !filtered);
    document.getElementById('orders-no-match').hidden = !(total === 0 && filtered);
    pageInfo.textContent = `Page ${view.page} of ${totalPages}`;
    const first = total === 0 ? 0 : (view.page - 1) * view.pageSize + 1;
    resultsCount.textContent = total === 0
      ? 'Showing 0 of 0 orders'
      : `Showing ${first}–${first + orders.length - 1} of ${total} order${total === 1 ? '' : 's'}`;
    prev.disabled = view.page <= 1;
    next.disabled = view.page >= totalPages;
  };

  const change = patch => {
    Object.assign(view, patch);
    load();
  };

  statusSelect.addEventListener('change', () => change({ status: statusSelect.value, page: 1 }));
  symbolSelect.addEventListener('change', () => change({ symbol: symbolSelect.value, page: 1 }));
  search.addEventListener('input', () => {
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => change({ q: search.value, page: 1 }), SEARCH_DEBOUNCE_MS);
  });
  filters.addEventListener('submit', event => event.preventDefault());
  document.getElementById('clear-filters').addEventListener('click', () => {
    window.clearTimeout(searchTimer);
    search.value = '';
    change({ status: '', symbol: '', q: '', page: 1 });
  });
  for (const th of sortHeaders) {
    // Ascending, then descending, then back to the default (newest first).
    th.querySelector('button').addEventListener('click', () => {
      const field = th.dataset.sort;
      const nextSort = view.sort === field ? `-${field}` : view.sort === `-${field}` ? ORDER_DEFAULTS.sort : field;
      change({ sort: nextSort, page: 1 });
    });
  }
  prev.addEventListener('click', () => change({ page: Math.max(1, view.page - 1) }));
  next.addEventListener('click', () => change({ page: Math.min(totalPages, view.page + 1) }));
  pageSizeSelect.addEventListener('change', () => change({ pageSize: Number(pageSizeSelect.value), page: 1 }));
  document.getElementById('orders-retry').addEventListener('click', () => load());

  // Keyboard shortcuts; none of them fire while typing in a field (except Escape in the search box).
  const isTyping = target => target instanceof HTMLElement && (target.matches('input, select, textarea') || target.isContentEditable);
  search.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    window.clearTimeout(searchTimer);
    search.value = '';
    change({ q: '', page: 1 });
  });
  document.addEventListener('keydown', event => {
    if (isTyping(event.target)) return;
    if (event.key === '/' && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      search.focus();
    } else if (event.altKey && event.code === 'KeyN' && user?.role === 'trader') {
      event.preventDefault();
      window.location.assign('/orders/new');
    }
  });

  await load();
};

const initOrderNew = async () => {
  await initHeader();
  const form = document.getElementById('order-form');
  const submit = document.getElementById('submit-order');
  const { body: symbols } = await api('/api/symbols');
  for (const symbol of symbols || []) form.symbol.append(el('option', { value: symbol, textContent: symbol }));

  // The quote widget in the iframe follows the chosen symbol; "Use last price" in it fills Limit price here.
  const quoteFrame = document.getElementById('quote-frame');
  form.symbol.addEventListener('change', () => {
    quoteFrame.src = form.symbol.value ? `/widgets/quote?symbol=${encodeURIComponent(form.symbol.value)}` : '/widgets/quote';
  });
  window.addEventListener('message', event => {
    if (event.origin !== window.location.origin || event.data?.type !== 'use-price') return;
    form.limitPrice.value = Number(event.data.price).toFixed(2);
    form.dispatchEvent(new Event('input', { bubbles: true }));
  });

  // Tooltip: shown on hover and focus, hidden on leave, blur and Escape. The button sits outside the label,
  // so the input's accessible name stays "Limit price".
  const info = document.querySelector('button.info');
  const tip = document.getElementById('limit-price-tip');
  const showTip = () => { tip.hidden = false; };
  const hideTip = () => { tip.hidden = true; };
  info.addEventListener('mouseenter', showTip);
  info.addEventListener('focus', showTip);
  info.addEventListener('mouseleave', () => { if (document.activeElement !== info) hideTip(); });
  info.addEventListener('blur', hideTip);
  document.addEventListener('keydown', event => { if (event.key === 'Escape') hideTip(); });

  const dateField = document.getElementById('good-till-date-field');
  const notesCounter = document.querySelector('[data-testid="notes-counter"]');
  form.goodTillDate.min = new Date().toISOString().slice(0, 10);

  const readTicket = () => ({
    symbol: form.symbol.value,
    side: form.querySelector('input[name="side"]:checked')?.value,
    quantity: Number(form.quantity.value),
    limitPrice: Number(form.limitPrice.value),
    timeInForce: form.timeInForce.value,
    goodTillDate: form.timeInForce.value === 'GTD' ? form.goodTillDate.value : null,
    urgent: form.urgent.checked,
    notes: form.notes.value,
  });

  const isValid = ticket =>
    !!ticket.symbol &&
    !!ticket.side &&
    Number.isInteger(ticket.quantity) && ticket.quantity >= 1 && ticket.quantity <= 1_000_000 &&
    ticket.limitPrice > 0 && /^\d+(\.\d{1,2})?$/.test(form.limitPrice.value.trim()) &&
    (ticket.timeInForce !== 'GTD' || !!ticket.goodTillDate);

  // Submit stays disabled until the ticket is valid; the date shows only for GTD, and the notes count as you type.
  form.addEventListener('input', () => {
    dateField.hidden = form.timeInForce.value !== 'GTD';
    notesCounter.textContent = `${form.notes.value.length} / 200`;
    submit.disabled = !isValid(readTicket());
  });

  form.addEventListener('submit', async event => {
    event.preventDefault();
    const ticket = readTicket();
    if (!isValid(ticket)) return;
    submit.disabled = true;
    showMessage('order-error', '');
    const { ok, body } = await api('/api/orders', { method: 'POST', body: JSON.stringify(ticket) });
    if (!ok) {
      const details = body?.details ? Object.values(body.details).join(' ') : '';
      showMessage('order-error', `${body?.error || 'Order failed.'} ${details}`.trim());
      submit.disabled = false;
      return;
    }
    window.location.assign(`/orders/${encodeURIComponent(body.id)}?created=1`);
  });
};

const initOrderDetails = async () => {
  const user = await initHeader();
  const id = decodeURIComponent(window.location.pathname.split('/').pop());
  const { ok, body: order } = await whileLoading(() => api(`/api/orders/${encodeURIComponent(id)}`));
  if (!ok) {
    showMessage('order-error', order?.error || 'Order not found.');
    return;
  }
  document.getElementById('order-heading').textContent = `Order ${order.id}`;
  if (new URLSearchParams(window.location.search).get('created') === '1') {
    showMessage('flash', `Order ${order.id} submitted for approval.`);
  }
  renderOrderFields(order);
  renderOrderActions(order, user);
  pollExecution(order);
  // Opens in a new tab on purpose: practice context.waitForEvent('page') / page.waitForEvent('popup').
  const quoteLink = document.getElementById('open-quote');
  quoteLink.href = `/quotes/${encodeURIComponent(order.symbol)}`;
  quoteLink.hidden = false;
};

/** Native dialogs on purpose: confirm to cancel (owner), prompt for a rejection reason (approver), alert on a blank one. */
const renderOrderActions = (order, user) => {
  const actions = document.getElementById('order-actions');
  actions.replaceChildren();
  const pending = order.status === 'Pending Approval';
  const refresh = async () => {
    const { ok, body: fresh } = await api(`/api/orders/${encodeURIComponent(order.id)}`);
    if (!ok) return;
    renderOrderFields(fresh);
    renderOrderActions(fresh, user);
    pollExecution(fresh);
  };

  if (pending && user?.role === 'trader' && order.createdBy === user.username) {
    actions.append(el('button', {
      type: 'button',
      className: 'secondary',
      textContent: 'Cancel order',
      onclick: async () => {
        if (!window.confirm(`Cancel order ${order.id}? This cannot be undone.`)) return;
        const result = await api(`/api/orders/${encodeURIComponent(order.id)}`, { method: 'DELETE' });
        if (!result.ok) {
          toast(result.body?.error || 'Could not cancel the order.', 'error');
          return;
        }
        window.location.assign(`/orders?cancelled=${encodeURIComponent(order.id)}`);
      },
    }));
  }

  if (pending && user?.role === 'approver') {
    const decide = async (action, body) => {
      const result = await api(`/api/orders/${encodeURIComponent(order.id)}/${action}`, { method: 'POST', ...(body ? { body: JSON.stringify(body) } : {}) });
      toast(result.ok ? `Order ${order.id} ${action === 'approve' ? 'approved' : 'rejected'}.` : result.body?.error || 'Action failed.', result.ok ? 'success' : 'error');
      await refresh();
    };
    actions.append(
      el('button', { type: 'button', textContent: 'Approve', onclick: () => decide('approve') }),
      el('button', {
        type: 'button',
        className: 'secondary',
        textContent: 'Reject with reason…',
        onclick: async () => {
          const reason = window.prompt('Reason for rejection:');
          if (reason === null) return;
          if (!reason.trim()) {
            window.alert('A rejection reason is required.');
            return;
          }
          await decide('reject', { reason });
        },
      }),
    );
  }
  actions.hidden = actions.childElementCount === 0;
};

const renderOrderFields = order => {
  const values = {
    symbol: order.symbol,
    side: order.side,
    quantity: formatQuantity(order.quantity),
    limitPrice: formatPrice(order.limitPrice),
    status: order.status,
    createdBy: order.createdBy,
    decidedBy: order.decidedBy || '—',
    executionStatus: order.executionStatus || '—',
    filledAt: order.filledAt || '—',
    timeInForce: order.timeInForce || 'Day',
    goodTillDate: order.goodTillDate || '—',
    urgent: order.urgent ? 'Yes' : 'No',
    notes: order.notes || '—',
    rejectionReason: order.rejectionReason || '—',
  };
  document.querySelectorAll('[data-field]').forEach(node => {
    node.textContent = values[node.dataset.field] ?? '—';
  });
  document.querySelector('[data-testid="order-status"]').className = statusClass(order.status);
};

/** While an order is Working or Partially Filled, ask again every second until it is Filled (or the page goes away). */
const EXECUTION_POLL_MS = 1000;
const isExecuting = order => order.executionStatus === 'Working' || order.executionStatus === 'Partially Filled';

const pollExecution = initial => {
  if (!isExecuting(initial)) return;
  const timer = window.setInterval(async () => {
    const { ok, status, body: order } = await api(`/api/orders/${encodeURIComponent(initial.id)}`);
    if (status === 404) window.clearInterval(timer);
    if (!ok) return;
    renderOrderFields(order);
    if (!isExecuting(order)) window.clearInterval(timer);
  }, EXECUTION_POLL_MS);
  window.addEventListener('pagehide', () => window.clearInterval(timer), { once: true });
};

const initApprovals = async () => {
  await initHeader();
  const tbody = document.getElementById('approvals-body');

  const errorBox = document.getElementById('approvals-error');
  document.getElementById('approvals-retry').addEventListener('click', () => render());

  const render = async () => {
    const { ok, body: orders } = await whileLoading(() => api('/api/orders?status=Pending%20Approval'));
    tbody.replaceChildren();
    errorBox.hidden = ok;
    if (!ok) {
      document.getElementById('approvals-empty').hidden = true;
      return;
    }
    for (const order of orders) {
      const decide = action => async () => {
        const result = await api(`/api/orders/${encodeURIComponent(order.id)}/${action}`, { method: 'POST' });
        const message = result.ok ? `Order ${order.id} ${action === 'approve' ? 'approved' : 'rejected'}.` : result.body?.error || 'Action failed.';
        showMessage('flash', message);
        toast(message, result.ok ? 'success' : 'error');
        await render();
      };
      // Every row repeats the same Approve/Reject button names on purpose: practice filtering by row.
      tbody.append(
        el('tr', {}, [
          el('td', { textContent: order.id }),
          el('td', { textContent: order.symbol }),
          el('td', { textContent: order.side }),
          el('td', { textContent: formatQuantity(order.quantity) }),
          el('td', { textContent: formatPrice(order.limitPrice) }),
          el('td', { textContent: order.createdBy }),
          el('td', { className: 'row-actions' }, [
            el('button', { type: 'button', textContent: 'Approve', onclick: decide('approve') }),
            el('button', { type: 'button', className: 'secondary', textContent: 'Reject', onclick: decide('reject') }),
          ]),
        ]),
      );
    }
    document.getElementById('approvals-empty').hidden = orders.length > 0;
  };

  await render();
};

const initOrdersImport = async () => {
  await initHeader();
  const form = document.getElementById('import-form');
  const input = document.getElementById('csv-file');
  const selected = document.querySelector('[data-testid="selected-file"]');
  const results = document.getElementById('import-results');
  const tbody = document.getElementById('import-body');
  const summary = document.querySelector('[data-testid="import-summary"]');
  const upload = document.getElementById('upload');

  input.addEventListener('change', () => {
    selected.textContent = input.files[0]?.name ?? 'No file chosen';
  });

  form.addEventListener('submit', async event => {
    event.preventDefault();
    const file = input.files[0];
    if (!file) {
      window.alert('Choose a CSV file first.');
      return;
    }
    showMessage('import-error', '');
    upload.disabled = true;
    try {
      // A CSV body, not JSON: the api() helper always sends JSON.
      const response = await fetch('/api/orders/import', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'text/csv' },
        body: await file.text(),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        showMessage('import-error', body?.error || `Import failed (${response.status}).`);
        toast(body?.error || 'Import failed.', 'error');
        return;
      }
      const rows = [
        ...body.created.map((order, i) => ({ line: body.createdLines?.[i] ?? 0, result: `Created ${order.id}` })),
        ...body.errors.map(error => ({ line: error.line, result: Object.values(error.details).join(' ') })),
      ].sort((a, b) => a.line - b.line);
      tbody.replaceChildren(...rows.map(row => el('tr', {}, [el('td', { textContent: String(row.line) }), el('td', { textContent: row.result })])));
      const text = `${body.created.length} created, ${body.errors.length} failed`;
      summary.textContent = text;
      results.hidden = false;
      toast(text, body.errors.length === 0 ? 'success' : 'error');
    } finally {
      upload.disabled = false;
    }
  });
};

const initQuote = async () => {
  await initHeader();
  const symbol = decodeURIComponent(window.location.pathname.split('/').pop());
  const heading = `${symbol} quote`;
  document.getElementById('quote-heading').textContent = heading;
  document.title = `${heading} · Trade Desk Lite`;
  const { ok, body: quote } = await api(`/api/quotes/${encodeURIComponent(symbol)}`);
  if (!ok) {
    showMessage('quote-error', quote?.error || 'Quote not available.');
    return;
  }
  for (const field of ['last', 'bid', 'ask']) document.querySelector(`[data-field="${field}"]`).textContent = formatPrice(quote[field]);
  document.querySelector('[data-field="asOf"]').textContent = quote.asOf;
};

/** The iframe widget: no header; "Use last price" tells the parent page (same origin only). */
const initWidgetQuote = async () => {
  const symbol = new URLSearchParams(window.location.search).get('symbol');
  if (!symbol) {
    document.getElementById('widget-empty').hidden = false;
    return;
  }
  const { ok, body: quote } = await api(`/api/quotes/${encodeURIComponent(symbol)}`);
  if (!ok) {
    showMessage('widget-error', quote?.error || 'Quote not available.');
    return;
  }
  document.querySelector('[data-testid="quote-symbol"]').textContent = quote.symbol;
  document.querySelector('[data-testid="last-price"]').textContent = formatPrice(quote.last);
  document.querySelector('[data-testid="bid-price"]').textContent = formatPrice(quote.bid);
  document.querySelector('[data-testid="ask-price"]').textContent = formatPrice(quote.ask);
  document.getElementById('widget-quote').hidden = false;
  document.getElementById('use-last-price').addEventListener('click', () => {
    window.parent.postMessage({ type: 'use-price', price: quote.last }, window.location.origin);
  });
};

/** Two lists: drag (HTML5) or use the buttons to move symbols; the watchlist can be reordered. Each change is saved. */
const initWatchlist = async () => {
  await initHeader();
  const availableList = document.querySelector('[data-list="available"]');
  const watchList = document.querySelector('[data-list="watchlist"]');
  const [{ body: symbols }, { body: saved }] = await Promise.all([api('/api/symbols'), api('/api/watchlist')]);
  let watched = saved?.symbols ?? [];

  const save = async next => {
    const previous = watched;
    watched = next;
    render();
    const result = await api('/api/watchlist', { method: 'PUT', body: JSON.stringify({ symbols: next }) });
    if (result.ok) {
      toast('Watchlist saved.');
    } else {
      watched = previous;
      render();
      toast(result.body?.error || 'Could not save the watchlist.', 'error');
    }
  };

  const item = (symbol, inWatchlist) => {
    const button = el('button', {
      type: 'button',
      className: 'plain small',
      textContent: inWatchlist ? 'Remove' : 'Add',
      onclick: () => save(inWatchlist ? watched.filter(s => s !== symbol) : [...watched, symbol]),
    });
    button.setAttribute('aria-label', `${inWatchlist ? 'Remove' : 'Add'} ${symbol} ${inWatchlist ? 'from' : 'to'} watchlist`);
    const li = el('li', { draggable: true, className: 'symbol-item' }, [el('span', { textContent: symbol }), button]);
    li.dataset.symbol = symbol;
    li.setAttribute('data-testid', `symbol-${symbol}`);
    li.addEventListener('dragstart', event => {
      event.dataTransfer.setData('text/plain', symbol);
      event.dataTransfer.effectAllowed = 'move';
    });
    return li;
  };

  const render = () => {
    availableList.replaceChildren(...(symbols || []).filter(symbol => !watched.includes(symbol)).map(symbol => item(symbol, false)));
    watchList.replaceChildren(...watched.map(symbol => item(symbol, true)));
  };

  for (const list of [availableList, watchList]) {
    list.addEventListener('dragover', event => {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
    });
    list.addEventListener('drop', event => {
      event.preventDefault();
      const symbol = event.dataTransfer.getData('text/plain');
      if (!(symbols || []).includes(symbol)) return;
      if (list === availableList) {
        if (watched.includes(symbol)) save(watched.filter(s => s !== symbol));
        return;
      }
      // Dropped on an item: insert before it; on the list itself: at the end.
      const before = event.target.closest('li')?.dataset.symbol;
      const rest = watched.filter(s => s !== symbol);
      const at = before && before !== symbol ? rest.indexOf(before) : rest.length;
      const next = [...rest.slice(0, at), symbol, ...rest.slice(at)];
      if (next.join() !== watched.join()) save(next);
    });
  }

  render();
};

const PAGES = {
  login: initLogin,
  orders: initOrders,
  'order-new': initOrderNew,
  'order-details': initOrderDetails,
  approvals: initApprovals,
  'orders-import': initOrdersImport,
  quote: initQuote,
  'widget-quote': initWidgetQuote,
  watchlist: initWatchlist,
  forbidden: initHeader,
};

PAGES[document.body.dataset.page]?.();
