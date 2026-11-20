// Trade Desk Lite: a small, fake order-ticket app to practice test automation against.
// In-memory store seeded from data/seed.json. Restarting the server (or POST /api/test/reset) resets orders.
import crypto from 'crypto';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(here, 'public');
const SESSION_COOKIE = 'tdl_session';
const SIDES = ['Buy', 'Sell'];
const TIME_IN_FORCE = ['Day', 'GTC', 'GTD'];

const todayUtc = () => new Date().toISOString().slice(0, 10);

/** "YYYY-MM-DD" that is a real calendar date (no 2026-02-30). */
const isCalendarDate = value => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
};
const MAX_QUANTITY = 1_000_000;

const loadSeed = () => JSON.parse(fs.readFileSync(path.join(here, 'data', 'seed.json'), 'utf8'));

const parseCookies = header =>
  Object.fromEntries(
    (header || '')
      .split(';')
      .map(part => part.trim().split('='))
      .filter(([name, value]) => name && value !== undefined)
      .map(([name, value]) => [name, decodeURIComponent(value)]),
  );

/** One rule per order field: the error message, or null when the value is fine. POST, PUT and PATCH share them. */
const FIELD_RULES = {
  symbol: (symbol, symbols) => (symbols.includes(symbol) ? null : 'Choose a valid symbol.'),
  side: side => (SIDES.includes(side) ? null : 'Side must be Buy or Sell.'),
  quantity: quantity =>
    Number.isInteger(quantity) && quantity >= 1 && quantity <= MAX_QUANTITY ? null : `Quantity must be a whole number from 1 to ${MAX_QUANTITY}.`,
  limitPrice: limitPrice => {
    const cents = typeof limitPrice === 'number' ? limitPrice * 100 : NaN;
    return limitPrice > 0 && Math.abs(Math.round(cents) - cents) <= 1e-6 ? null : 'Limit price must be greater than 0 with at most 2 decimals.';
  },
  clientOrderId: clientOrderId =>
    clientOrderId === undefined || clientOrderId === null || (typeof clientOrderId === 'string' && clientOrderId.length <= 64)
      ? null
      : 'clientOrderId must be a string of up to 64 characters.',
  timeInForce: timeInForce =>
    timeInForce === undefined || TIME_IN_FORCE.includes(timeInForce) ? null : 'Time in force must be Day, GTC or GTD.',
  // Depends on timeInForce: required (today or later, UTC) for GTD, not allowed otherwise.
  goodTillDate: (goodTillDate, _symbols, body) => {
    if (body?.timeInForce === 'GTD') {
      return isCalendarDate(goodTillDate) && goodTillDate >= todayUtc() ? null : 'Good till date is required for GTD and cannot be in the past.';
    }
    return goodTillDate === undefined || goodTillDate === null ? null : 'Good till date is only allowed for GTD.';
  },
  urgent: urgent => (urgent === undefined || typeof urgent === 'boolean' ? null : 'Urgent must be true or false.'),
  notes: notes =>
    notes === undefined || notes === null || (typeof notes === 'string' && notes.length <= 200) ? null : 'Notes must be up to 200 characters.',
};

/** The errors for the given fields of `body` (default: every field), as { field: message }. */
const validateOrder = (body, symbols, fields = Object.keys(FIELD_RULES)) => {
  const errors = {};
  for (const field of fields) {
    const message = FIELD_RULES[field](body?.[field], symbols, body);
    if (message) errors[field] = message;
  }
  return errors;
};

/** Fields a trader may change with PATCH or PUT (symbol is fixed once the order exists). */
const EDITABLE_FIELDS = ['side', 'quantity', 'limitPrice', 'clientOrderId', 'timeInForce', 'goodTillDate', 'urgent', 'notes'];

/** The V2-07 ticket fields when a request leaves them out. */
const TICKET_DEFAULTS = { timeInForce: 'Day', goodTillDate: null, urgent: false, notes: null };

/** The fields an order's "edited" event compares (DEV-01): what PATCH and PUT can change. */
const diffFields = (before, after) =>
  Object.fromEntries(
    EDITABLE_FIELDS.filter(field => before[field] !== after[field]).map(field => [field, { from: before[field] ?? null, to: after[field] ?? null }]),
  );

/** The V2-07 fields of a valid request body, defaults filled in; an empty note is stored as null. */
const ticketFields = body => ({
  timeInForce: body.timeInForce ?? TICKET_DEFAULTS.timeInForce,
  goodTillDate: body.timeInForce === 'GTD' ? body.goodTillDate : null,
  urgent: body.urgent ?? TICKET_DEFAULTS.urgent,
  notes: body.notes ? body.notes : null,
});

const SORT_FIELDS = ['id', 'symbol', 'side', 'quantity', 'limitPrice', 'status', 'createdAt'];
const QUERY_MESSAGES = {
  symbol: 'Choose a valid symbol.',
  side: 'Side must be Buy or Sell.',
  sort: `Sort must be one of ${SORT_FIELDS.join(', ')}, optionally prefixed with -.`,
  page: 'Page must be a whole number of 1 or more.',
  pageSize: 'Page size must be a whole number from 1 to 100.',
};

/** One value per query parameter (?a=1&a=2 uses the first); undefined when absent. */
const queryValue = value => (Array.isArray(value) ? queryValue(value[0]) : value === undefined ? undefined : String(value));

const compareValues = (a, b) => {
  if (a === b) return 0;
  if (a === null || a === undefined) return -1;
  if (b === null || b === undefined) return 1;
  return a < b ? -1 : 1;
};

/**
 * Filters, searches and sorts orders for GET /api/orders and the CSV export.
 * Returns { items, total } (items is the page when page or pageSize is given) or { errors } for a 400.
 * Without sort, orders keep their insertion order; ties always break by id ascending.
 */
export const queryOrders = (orders, query = {}, symbols = []) => {
  const errors = {};
  const status = queryValue(query.status);
  const symbol = queryValue(query.symbol);
  const side = queryValue(query.side);
  const createdBy = queryValue(query.createdBy);
  const q = queryValue(query.q)?.trim().toLowerCase();
  const sort = queryValue(query.sort);
  const pageRaw = queryValue(query.page);
  const pageSizeRaw = queryValue(query.pageSize);

  if (symbol && !symbols.includes(symbol)) errors.symbol = QUERY_MESSAGES.symbol;
  if (side && !SIDES.includes(side)) errors.side = QUERY_MESSAGES.side;
  const sortField = sort?.startsWith('-') ? sort.slice(1) : sort;
  if (sort !== undefined && !SORT_FIELDS.includes(sortField)) errors.sort = QUERY_MESSAGES.sort;
  const paginate = pageRaw !== undefined || pageSizeRaw !== undefined;
  const page = pageRaw === undefined ? 1 : /^\d+$/.test(pageRaw) ? Number(pageRaw) : NaN;
  const pageSize = pageSizeRaw === undefined ? 10 : /^\d+$/.test(pageSizeRaw) ? Number(pageSizeRaw) : NaN;
  if (paginate && !(page >= 1)) errors.page = QUERY_MESSAGES.page;
  if (paginate && !(pageSize >= 1 && pageSize <= 100)) errors.pageSize = QUERY_MESSAGES.pageSize;
  if (Object.keys(errors).length > 0) return { errors };

  let items = orders.filter(order =>
    (!status || order.status === status) &&
    (!symbol || order.symbol === symbol) &&
    (!side || order.side === side) &&
    (!createdBy || order.createdBy === createdBy) &&
    (!q || [order.id, order.symbol, order.clientOrderId].some(value => value && value.toLowerCase().includes(q))),
  );
  if (sort !== undefined) {
    const direction = sort.startsWith('-') ? -1 : 1;
    items = [...items].sort((a, b) => direction * compareValues(a[sortField], b[sortField]) || compareValues(a.id, b.id));
  }
  const total = items.length;
  if (!paginate) return { items, total };
  return { items: items.slice((page - 1) * pageSize, page * pageSize), total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
};

/** A whole number from the environment, or the fallback. */
const envNumber = (name, fallback) => (/^\d+$/.test(process.env[name] ?? '') ? Number(process.env[name]) : fallback);

/** Defaults come from the environment; createApp({ config }) overrides them (tests use a short fill delay). */
const defaultConfig = () => ({ latencyMs: envNumber('LATENCY_MS', 0), fillDelayMs: envNumber('FILL_DELAY_MS', 4000) });

/** POST /api/test/config: the keys it accepts, with their whole-number range. */
const CONFIG_LIMITS = { latencyMs: 10_000, fillDelayMs: 60_000 };

// --- CSV (RFC 4180): export and import ---

const CSV_COLUMNS = ['id', 'clientOrderId', 'symbol', 'side', 'quantity', 'limitPrice', 'status', 'createdBy', 'createdAt'];
const IMPORT_HEADERS = ['symbol,side,quantity,limitPrice', 'symbol,side,quantity,limitPrice,clientOrderId'];
const MAX_IMPORT_ROWS = 100;

/** Quotes a field that holds a comma, a quote or a line break (quotes doubled); null becomes an empty field. */
const csvField = value => {
  if (value === null || value === undefined) return '';
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

export const toCsv = orders =>
  [CSV_COLUMNS.join(','), ...orders.map(order => CSV_COLUMNS.map(column => csvField(order[column])).join(','))].join('\r\n') + '\r\n';

/** Splits CSV text into records of fields, keeping the 1-based file line each record starts on. */
export const parseCsv = text => {
  const records = [];
  let fields = [];
  let field = '';
  let quoted = false;
  let line = 1;
  let startLine = 1;
  const endRecord = () => {
    fields.push(field);
    records.push({ line: startLine, fields });
    fields = [];
    field = '';
  };
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (char === '"') {
        quoted = false;
      } else {
        if (char === '\n') line++;
        field += char;
      }
    } else if (char === '"' && field === '') {
      quoted = true;
    } else if (char === ',') {
      fields.push(field);
      field = '';
    } else if (char === '\r' || char === '\n') {
      if (char === '\r' && text[i + 1] === '\n') i++;
      endRecord();
      line++;
      startLine = line;
    } else {
      field += char;
    }
  }
  if (field !== '' || fields.length > 0) endRecord();
  // Blank lines are not rows.
  return records.filter(record => !(record.fields.length === 1 && record.fields[0].trim() === ''));
};

export function createApp({ seed = loadSeed(), config: configOverrides = {} } = {}) {
  const app = express();
  const sessions = new Map(); // token -> username
  const initialConfig = { ...defaultConfig(), ...configOverrides };
  // Changed at runtime by POST /api/test/config; reset() restores the defaults.
  const config = { ...initialConfig };
  let state;

  const reset = () => {
    Object.assign(config, initialConfig);
    state = structuredClone({ orders: seed.orders, nextOrderNumber: seed.nextOrderNumber });
    state.watchlists = {}; // username -> symbols, in the user's order
    // DEV-01: every order's activity, oldest first (one list; GET /api/orders/:id/events filters it).
    // Every order carries updatedAt (null until changed); the seed file itself stays as it is.
    state.orders = state.orders.map(order => ({
      ...order,
      updatedAt: order.updatedAt ?? null,
      // Approved seed orders are long filled; the rest have no execution yet.
      executionStatus: order.status === 'Approved' ? 'Filled' : null,
      filledAt: order.status === 'Approved' ? order.decidedAt : null,
      rejectionReason: order.rejectionReason ?? null,
      ...TICKET_DEFAULTS,
      ...Object.fromEntries(Object.keys(TICKET_DEFAULTS).filter(key => order[key] !== undefined).map(key => [key, order[key]])),
    }));
    // Seed orders get the history their fields already tell: created, decided, and (approved) filled.
    state.events = state.orders.flatMap(order => [
      { orderId: order.id, at: order.createdAt, actor: order.createdBy, action: 'created', details: { symbol: order.symbol, side: order.side, quantity: order.quantity, limitPrice: order.limitPrice, source: 'seed' } },
      ...(order.decidedBy
        ? [{ orderId: order.id, at: order.decidedAt, actor: order.decidedBy, action: order.status === 'Approved' ? 'approved' : 'rejected', details: order.status === 'Rejected' ? { reason: order.rejectionReason } : {} }]
        : []),
      ...(order.filledAt ? [{ orderId: order.id, at: order.filledAt, actor: 'system', action: 'execution', details: { from: null, to: 'Filled' } }] : []),
    ]);
  };
  reset();

  /** DEV-01: appends one activity event for an order (oldest first, so the list is never re-sorted). */
  const recordEvent = (order, actor, action, details = {}) => {
    state.events.push({ orderId: order.id, at: new Date().toISOString(), actor, action, details });
  };

  const findUser = username => seed.users.find(user => user.username === username);
  const publicUser = user => ({ username: user.username, role: user.role, displayName: user.displayName });

  const currentUser = req => {
    const bearer = req.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
    const token = bearer || parseCookies(req.get('cookie'))[SESSION_COOKIE];
    const username = token && sessions.get(token);
    return username ? findUser(username) : undefined;
  };

  app.use(express.json());
  app.use('/static', express.static(path.join(publicDir, 'static')));

  // --- API: open routes ---

  app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body || {};
    const user = findUser(username);
    if (!user || user.password !== password) {
      res.status(401).json({ error: 'Invalid username or password.' });
      return;
    }
    const token = crypto.randomBytes(24).toString('hex');
    sessions.set(token, user.username);
    res.cookie(SESSION_COOKIE, token, { httpOnly: true, sameSite: 'lax', path: '/' });
    res.json({ token, user: publicUser(user) });
  });

  app.post('/api/auth/logout', (req, res) => {
    const token = parseCookies(req.get('cookie'))[SESSION_COOKIE];
    if (token) sessions.delete(token);
    // A Bearer token is ended too, so "the token is dead after logout" can be tested over the API.
    const bearer = req.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (bearer) sessions.delete(bearer);
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    res.status(204).end();
  });

  // Liveness for tools such as the Live Lab: no auth, no side effects, never slowed down.
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, app: 'practice-app-v2' });
  });

  // Test helper: restore seed orders. Sessions survive, so saved storageState files keep working.
  app.post('/api/test/reset', (_req, res) => {
    reset();
    res.json({ ok: true, orders: state.orders.length });
  });

  // Test helper: one order's raw activity log, including after the order is cancelled (deleted), when the public
  // GET /api/orders/:id/events answers 404. An unknown id gives [].
  app.get('/api/test/events', (req, res) => {
    const { orderId } = req.query;
    if (typeof orderId !== 'string' || !orderId) {
      res.status(400).json({ error: 'Validation failed.', details: { orderId: 'orderId is required.' } });
      return;
    }
    res.json(state.events.filter(event => event.orderId === orderId));
  });

  // Test helper: slow the server down (latencyMs) or change how long an approved order takes to fill (fillDelayMs).
  app.get('/api/test/config', (_req, res) => res.json({ ...config }));

  app.post('/api/test/config', (req, res) => {
    const body = req.body;
    const errors = {};
    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
      errors.body = 'Send a JSON object with latencyMs and/or fillDelayMs.';
    } else {
      for (const [key, value] of Object.entries(body)) {
        if (!(key in CONFIG_LIMITS)) errors[key] = 'Unknown field.';
        else if (!Number.isInteger(value) || value < 0 || value > CONFIG_LIMITS[key]) {
          errors[key] = `${key} must be a whole number from 0 to ${CONFIG_LIMITS[key]}.`;
        }
      }
    }
    if (Object.keys(errors).length > 0) {
      res.status(400).json({ error: 'Validation failed.', details: errors });
      return;
    }
    Object.assign(config, body);
    res.json({ ...config });
  });

  // --- API: authenticated routes (Bearer token or session cookie) ---

  app.use('/api', (req, res, next) => {
    const user = currentUser(req);
    if (!user) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    req.user = user;
    next();
  });

  // Latency for every authenticated API response (auth, test helpers and health are registered above, so never slowed).
  app.use('/api', (_req, _res, next) => {
    if (config.latencyMs > 0) setTimeout(next, config.latencyMs);
    else next();
  });

  const requireRole = role => (req, res, next) => {
    if (req.user.role !== role) {
      res.status(403).json({ error: `Only a ${role} can do this.` });
      return;
    }
    next();
  };

  app.get('/api/me', (req, res) => res.json(publicUser(req.user)));

  app.get('/api/symbols', (_req, res) => res.json(seed.symbols));

  // Per-user watchlist: PUT replaces the whole list.
  app.get('/api/watchlist', (req, res) => res.json({ symbols: state.watchlists[req.user.username] ?? [] }));

  app.put('/api/watchlist', (req, res) => {
    const symbols = req.body?.symbols;
    const valid = Array.isArray(symbols) && symbols.every(symbol => seed.symbols.includes(symbol)) && new Set(symbols).size === symbols.length;
    if (!valid) {
      res.status(400).json({ error: 'Validation failed.', details: { symbols: 'Symbols must be an array of unique, valid symbols.' } });
      return;
    }
    state.watchlists[req.user.username] = [...symbols];
    res.json({ symbols: state.watchlists[req.user.username] });
  });

  // A fake, fixed market quote per symbol; asOf is the time of the request.
  app.get('/api/quotes/:symbol', (req, res) => {
    const quote = seed.quotes?.[req.params.symbol];
    if (!seed.symbols.includes(req.params.symbol) || !quote) {
      res.status(404).json({ error: `Symbol ${req.params.symbol} not found.` });
      return;
    }
    res.json({ symbol: req.params.symbol, last: quote.last, bid: quote.bid, ask: quote.ask, asOf: new Date().toISOString() });
  });

  app.get('/api/orders', (req, res) => {
    const result = queryOrders(state.orders, req.query, seed.symbols);
    if (result.errors) {
      res.status(400).json({ error: 'Validation failed.', details: result.errors });
      return;
    }
    if (result.page !== undefined) {
      res.set({
        'X-Total-Count': String(result.total),
        'X-Page': String(result.page),
        'X-Page-Size': String(result.pageSize),
        'X-Total-Pages': String(result.totalPages),
      });
    }
    res.json(result.items);
  });

  // Literal routes before /api/orders/:id (Express 5 would read "export.csv" as an id).
  app.get('/api/orders/export.csv', (req, res) => {
    const { page: _page, pageSize: _pageSize, ...filters } = req.query;
    const result = queryOrders(state.orders, filters, seed.symbols);
    if (result.errors) {
      res.status(400).json({ error: 'Validation failed.', details: result.errors });
      return;
    }
    res.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="orders-${todayUtc()}.csv"`,
    });
    res.send(toCsv(result.items));
  });

  // Each valid row becomes an order (same rules as POST); the other rows are reported by file line.
  app.post('/api/orders/import', requireRole('trader'), express.text({ type: 'text/csv', limit: '100kb' }), (req, res) => {
    if (!req.is('text/csv')) {
      res.status(415).json({ error: 'Content-Type must be text/csv.' });
      return;
    }
    const records = parseCsv(typeof req.body === 'string' ? req.body.replace(/^\uFEFF/, '') : '');
    const header = records.shift();
    const columns = header?.fields.map(name => name.trim());
    if (!columns || !IMPORT_HEADERS.includes(columns.join(','))) {
      res.status(400).json({ error: 'CSV header must be symbol,side,quantity,limitPrice[,clientOrderId].' });
      return;
    }
    if (records.length === 0) {
      res.status(400).json({ error: 'CSV has no data rows.' });
      return;
    }
    if (records.length > MAX_IMPORT_ROWS) {
      res.status(413).json({ error: `CSV can have at most ${MAX_IMPORT_ROWS} rows.` });
      return;
    }
    const created = [];
    const createdLines = [];
    const errors = [];
    for (const record of records) {
      if (record.fields.length !== columns.length) {
        errors.push({ line: record.line, details: { row: `Expected ${columns.length} values, got ${record.fields.length}.` } });
        continue;
      }
      const raw = Object.fromEntries(columns.map((column, i) => [column, record.fields[i].trim()]));
      const number = value => (value === '' ? NaN : Number(value));
      const row = {
        symbol: raw.symbol,
        side: raw.side,
        quantity: number(raw.quantity),
        limitPrice: number(raw.limitPrice),
        clientOrderId: raw.clientOrderId ? raw.clientOrderId : null,
      };
      const rowErrors = validateOrder(row, seed.symbols);
      if (!rowErrors.clientOrderId && row.clientOrderId && state.orders.some(order => order.clientOrderId === row.clientOrderId)) {
        rowErrors.clientOrderId = `clientOrderId ${row.clientOrderId} already exists.`;
      }
      if (Object.keys(rowErrors).length > 0) {
        errors.push({ line: record.line, details: rowErrors });
        continue;
      }
      created.push(createOrder(row, req.user, { source: 'import' }));
      createdLines.push(record.line);
    }
    res.json({ created, errors, createdLines });
  });

  app.post('/api/orders', requireRole('trader'), (req, res) => {
    const errors = validateOrder(req.body, seed.symbols);
    if (Object.keys(errors).length > 0) {
      res.status(400).json({ error: 'Validation failed.', details: errors });
      return;
    }
    const { clientOrderId = null } = req.body;
    if (clientOrderId && state.orders.some(order => order.clientOrderId === clientOrderId)) {
      res.status(409).json({ error: `clientOrderId ${clientOrderId} already exists.` });
      return;
    }
    res.status(201).json(createOrder(req.body, req.user, { source: 'api' }));
  });

  /** Adds a new Pending Approval order from a validated body (POST, CSV import, duplicate) and records "created". */
  const createOrder = (body, user, eventDetails = {}) => {
    const { symbol, side, quantity, limitPrice, clientOrderId = null } = body;
    const order = {
      id: `ORD-${state.nextOrderNumber++}`,
      clientOrderId,
      symbol,
      side,
      quantity,
      limitPrice,
      status: 'Pending Approval',
      createdBy: user.username,
      createdAt: new Date().toISOString(),
      decidedBy: null,
      decidedAt: null,
      updatedAt: null,
      executionStatus: null,
      filledAt: null,
      rejectionReason: null,
      ...ticketFields(body),
    };
    state.orders.push(order);
    recordEvent(order, user.username, 'created', { symbol, side, quantity, limitPrice, ...eventDetails });
    return order;
  };

  app.get('/api/orders/:id', (req, res) => {
    const order = state.orders.find(o => o.id === req.params.id);
    if (!order) {
      res.status(404).json({ error: `Order ${req.params.id} not found.` });
      return;
    }
    res.json(order);
  });

  // DEV-01: an order's activity, oldest first. Same access as GET /api/orders/:id (any signed-in user).
  app.get('/api/orders/:id/events', (req, res) => {
    const order = state.orders.find(o => o.id === req.params.id);
    if (!order) {
      res.status(404).json({ error: `Order ${req.params.id} not found.` });
      return;
    }
    res.json(state.events.filter(event => event.orderId === order.id));
  });

  const isDuplicateClientId = (clientOrderId, exceptId) =>
    !!clientOrderId && state.orders.some(order => order.clientOrderId === clientOrderId && order.id !== exceptId);

  /** PATCH, PUT and DELETE: 404 → 403 (not the owner) → 409 (no longer pending), in that order. */
  const findOwnPendingOrder = (req, res) => {
    const order = state.orders.find(o => o.id === req.params.id);
    if (!order) {
      res.status(404).json({ error: `Order ${req.params.id} not found.` });
      return null;
    }
    if (order.createdBy !== req.user.username) {
      res.status(403).json({ error: 'You can only change your own orders.' });
      return null;
    }
    if (order.status !== 'Pending Approval') {
      res.status(409).json({ error: `Order ${order.id} is already ${order.status}.` });
      return null;
    }
    return order;
  };

  const isPlainObject = value => typeof value === 'object' && value !== null && !Array.isArray(value);

  // Partial update: only the keys sent change.
  app.patch('/api/orders/:id', requireRole('trader'), (req, res) => {
    const order = findOwnPendingOrder(req, res);
    if (!order) return;
    const body = req.body;
    if (!isPlainObject(body) || Object.keys(body).length === 0) {
      res.status(400).json({ error: 'Nothing to update.' });
      return;
    }
    const errors = {};
    for (const key of Object.keys(body)) {
      if (key === 'symbol') errors.symbol = 'Symbol cannot be changed.';
      else if (!EDITABLE_FIELDS.includes(key)) errors[key] = 'Unknown field.';
    }
    // Time in force and good till date are checked together, against what the order will be after the patch.
    const merged = { timeInForce: order.timeInForce, goodTillDate: order.goodTillDate, ...body };
    if ('timeInForce' in body && body.timeInForce !== 'GTD' && !('goodTillDate' in body)) merged.goodTillDate = null;
    const fields = Object.keys(body).filter(key => EDITABLE_FIELDS.includes(key));
    if ((fields.includes('timeInForce') || fields.includes('goodTillDate')) && !fields.includes('goodTillDate')) fields.push('goodTillDate');
    Object.assign(errors, validateOrder(merged, seed.symbols, fields));
    if (Object.keys(errors).length > 0) {
      res.status(400).json({ error: 'Validation failed.', details: errors });
      return;
    }
    if (isDuplicateClientId(body.clientOrderId, order.id)) {
      res.status(409).json({ error: `clientOrderId ${body.clientOrderId} already exists.` });
      return;
    }
    const before = { ...order };
    for (const key of Object.keys(body)) order[key] = body[key];
    order.goodTillDate = merged.goodTillDate ?? null;
    if ('notes' in body && !body.notes) order.notes = null;
    order.updatedAt = new Date().toISOString();
    const changes = diffFields(before, order);
    if (Object.keys(changes).length > 0) recordEvent(order, req.user.username, 'edited', { method: 'PATCH', changes });
    res.json(order);
  });

  // Full replacement of the editable fields; a missing clientOrderId becomes null.
  app.put('/api/orders/:id', requireRole('trader'), (req, res) => {
    const order = findOwnPendingOrder(req, res);
    if (!order) return;
    const body = isPlainObject(req.body) ? req.body : {};
    const errors = validateOrder(body, seed.symbols);
    if (!errors.symbol && body.symbol !== order.symbol) errors.symbol = 'Symbol cannot be changed.';
    if (Object.keys(errors).length > 0) {
      res.status(400).json({ error: 'Validation failed.', details: errors });
      return;
    }
    const clientOrderId = body.clientOrderId ?? null;
    if (isDuplicateClientId(clientOrderId, order.id)) {
      res.status(409).json({ error: `clientOrderId ${clientOrderId} already exists.` });
      return;
    }
    const before = { ...order };
    Object.assign(order, { side: body.side, quantity: body.quantity, limitPrice: body.limitPrice, clientOrderId, ...ticketFields(body) });
    order.updatedAt = new Date().toISOString();
    const changes = diffFields(before, order);
    if (Object.keys(changes).length > 0) recordEvent(order, req.user.username, 'edited', { method: 'PUT', changes });
    res.json(order);
  });

  app.delete('/api/orders/:id', requireRole('trader'), (req, res) => {
    const order = findOwnPendingOrder(req, res);
    if (!order) return;
    state.orders = state.orders.filter(o => o.id !== order.id);
    // Kept in the log; the order itself is gone, so GET /api/orders/:id/events answers 404 from now on.
    recordEvent(order, req.user.username, 'cancelled');
    res.status(204).end();
  });

  const decide = status => (req, res) => {
    const order = state.orders.find(o => o.id === req.params.id);
    if (!order) {
      res.status(404).json({ error: `Order ${req.params.id} not found.` });
      return;
    }
    if (order.status !== 'Pending Approval') {
      res.status(409).json({ error: `Order ${order.id} is already ${order.status}.` });
      return;
    }
    // Reject takes an optional reason (1-200 characters once trimmed); an empty body works as before.
    const reason = status === 'Rejected' ? req.body?.reason : undefined;
    if (reason !== undefined && reason !== null && (typeof reason !== 'string' || !reason.trim() || reason.trim().length > 200)) {
      res.status(400).json({ error: 'Validation failed.', details: { reason: 'Reason must be 1 to 200 characters.' } });
      return;
    }
    if (typeof reason === 'string') order.rejectionReason = reason.trim();
    order.status = status;
    order.decidedBy = req.user.username;
    order.decidedAt = new Date().toISOString();
    recordEvent(order, req.user.username, status === 'Approved' ? 'approved' : 'rejected', status === 'Rejected' ? { reason: order.rejectionReason } : {});
    if (status === 'Approved') startExecution(order);
    res.json(order);
  };

  /**
   * An approved order fills on its own, so tests have something to poll for: Working now, Partially Filled after
   * half of fillDelayMs, Filled after fillDelayMs. Each step looks the order up again and does nothing if it is gone
   * (deleted, or replaced by a reset).
   */
  const startExecution = order => {
    order.executionStatus = 'Working';
    recordEvent(order, 'system', 'execution', { from: null, to: 'Working' });
    const step = (delay, update) =>
      setTimeout(() => {
        const current = state.orders.find(o => o.id === order.id);
        if (current === order) update(current);
      }, delay).unref();
    const delay = config.fillDelayMs;
    step(delay / 2, current => {
      if (current.executionStatus !== 'Working') return;
      current.executionStatus = 'Partially Filled';
      recordEvent(current, 'system', 'execution', { from: 'Working', to: 'Partially Filled' });
    });
    step(delay, current => {
      const from = current.executionStatus;
      current.executionStatus = 'Filled';
      current.filledAt = new Date().toISOString();
      recordEvent(current, 'system', 'execution', { from, to: 'Filled' });
    });
  };

  app.post('/api/orders/:id/approve', requireRole('approver'), decide('Approved'));
  app.post('/api/orders/:id/reject', requireRole('approver'), decide('Rejected'));

  // DEV-02: a new Pending Approval order with the source's symbol, side, quantity, price and ticket fields.
  // Any request body is ignored; clientOrderId is never copied (a unique client id would 409); the source is unchanged.
  app.post('/api/orders/:id/duplicate', requireRole('trader'), (req, res) => {
    const source = state.orders.find(o => o.id === req.params.id);
    if (!source) {
      res.status(404).json({ error: `Order ${req.params.id} not found.` });
      return;
    }
    const body = {
      symbol: source.symbol,
      side: source.side,
      quantity: source.quantity,
      limitPrice: source.limitPrice,
      clientOrderId: null,
      timeInForce: source.timeInForce,
      goodTillDate: source.goodTillDate,
      urgent: source.urgent,
      notes: source.notes,
    };
    // Same rules as POST /api/orders: e.g. a GTD source whose date has passed can't be copied as it is.
    const errors = validateOrder(body, seed.symbols);
    if (Object.keys(errors).length > 0) {
      res.status(400).json({ error: 'Validation failed.', details: errors });
      return;
    }
    res.status(201).json(createOrder(body, req.user, { source: 'duplicate', duplicatedFrom: source.id }));
  });

  app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found.' }));

  // API errors always answer JSON: a body that isn't valid JSON is the client's mistake (400).
  app.use('/api', (err, _req, res, _next) => {
    if (err.type === 'entity.parse.failed') {
      res.status(400).json({ error: 'Malformed JSON body.' });
      return;
    }
    if (err.type === 'entity.too.large') {
      res.status(413).json({ error: 'Request body is too large.' });
      return;
    }
    console.error(err);
    res.status(500).json({ error: 'Internal server error.' });
  });

  // --- Pages ---

  const page = name => (_req, res) => res.sendFile(path.join(publicDir, `${name}.html`));

  const requirePageUser = role => (req, res, next) => {
    const user = currentUser(req);
    if (!user) {
      res.redirect(`/login?next=${encodeURIComponent(req.originalUrl)}`);
      return;
    }
    if (role && user.role !== role) {
      res.status(403).sendFile(path.join(publicDir, 'forbidden.html'));
      return;
    }
    next();
  };

  app.get('/', (req, res) => res.redirect(currentUser(req) ? '/orders' : '/login'));
  app.get('/login', page('login'));
  app.get('/orders', requirePageUser(), page('orders'));
  app.get('/orders/new', requirePageUser('trader'), page('order-new'));
  app.get('/orders/import', requirePageUser('trader'), page('orders-import'));
  app.get('/orders/:id', requirePageUser(), page('order-details'));
  app.get('/approvals', requirePageUser('approver'), page('approvals'));
  app.get('/quotes/:symbol', requirePageUser(), page('quote'));
  app.get('/watchlist', requirePageUser(), page('watchlist'));
  app.get('/widgets/quote', requirePageUser(), page('widget-quote'));

  return app;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  const port = Number(process.env.PORT) || 3300;
  createApp().listen(port, () => {
    console.log(`Trade Desk Lite running on http://localhost:${port}`);
  });
}
