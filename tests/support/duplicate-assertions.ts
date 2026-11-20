import { expect } from '@playwright/test';
import type { ApiClient } from '../../helpers/api-client';
import { readJson } from '../../helpers/readJson';
import type { OrderDetailsPage } from '../../pages/order-details.page';
import type { JsonResponse } from '../../types/api';
import type { Desk } from '../../fixtures/desk';
import type {
  ErrorResponse,
  Order,
  OrderEvent,
  ValidationErrorResponse,
} from '../../types/order';

export const ORDER_FIELDS = [
  'id',
  'clientOrderId',
  'symbol',
  'side',
  'quantity',
  'limitPrice',
  'status',
  'createdBy',
  'createdAt',
  'decidedBy',
  'decidedAt',
  'updatedAt',
  'executionStatus',
  'filledAt',
  'rejectionReason',
  'timeInForce',
  'goodTillDate',
  'urgent',
  'notes',
].sort();

const COPIED_FIELDS = [
  'symbol',
  'side',
  'quantity',
  'limitPrice',
  'timeInForce',
  'goodTillDate',
  'urgent',
  'notes',
] as const;

const RESET_FIELDS = [
  'clientOrderId',
  'decidedBy',
  'decidedAt',
  'updatedAt',
  'executionStatus',
  'filledAt',
  'rejectionReason',
] as const;

/** A timestamp window taken around a request, on the test's clock. */
export interface Window {
  start: number;
  end: number;
}

export async function measure<T>(action: () => Promise<T>): Promise<{ result: T; window: Window }> {
  const start = Date.now();
  const result = await action();
  return { result, window: { start, end: Date.now() } };
}

export async function expectError(
  res: JsonResponse,
  status: number,
  error: string,
): Promise<void> {
  expect(res.status(), `status of ${res.url()}`).toBe(status);
  expect(await readJson<ErrorResponse>(res), `error body of ${res.url()}`).toEqual({ error });
}

export async function expectValidationError(
  res: JsonResponse,
  details: Record<string, string>,
): Promise<void> {
  expect(res.status(), `status of ${res.url()}`).toBe(400);
  expect(await readJson<ValidationErrorResponse>(res), `error body of ${res.url()}`).toEqual({
    error: 'Validation failed.',
    details,
  });
}

/** COPY(S,T): the body of a successful duplicate, checked against its source and the caller. */
export async function expectCopyOf(
  res: JsonResponse,
  source: Order,
  caller: string,
  window?: Window,
): Promise<Order> {
  expect(res.status(), 'duplicate should answer 201 Created').toBe(201);
  const copy = await readJson<Order>(res);
  expect(Object.keys(copy).sort(), 'copy should have exactly the Order fields').toEqual(ORDER_FIELDS);
  expect(copy.id, 'copy id').toMatch(/^ORD-\d+$/);
  expect(copy.id, 'copy id should differ from the source').not.toBe(source.id);
  expect(copy.createdBy, 'copy belongs to the caller').toBe(caller);
  expect(copy.status).toBe('Pending Approval');
  RESET_FIELDS.forEach((field) => expect(copy[field], `${field} should be reset`).toBeNull());
  COPIED_FIELDS.forEach((field) =>
    expect(copy[field], `${field} should be copied from ${source.id}`).toEqual(source[field]),
  );
  expect(typeof copy.quantity).toBe('number');
  expect(typeof copy.limitPrice).toBe('number');
  expect(typeof copy.urgent).toBe('boolean');
  const createdAt = Date.parse(copy.createdAt);
  expect(Number.isNaN(createdAt), `createdAt ${copy.createdAt} should be a valid timestamp`).toBe(false);
  if (window !== undefined) {
    expect(createdAt, 'createdAt should be within the request window').toBeGreaterThanOrEqual(window.start);
    expect(createdAt, 'createdAt should be within the request window').toBeLessThanOrEqual(window.end);
  }
  return copy;
}

/** The copy is readable by id and in the order list, and both reads equal the duplicate response. */
export async function expectCopyPersisted(api: ApiClient, copy: Order): Promise<void> {
  expect(await api.getOrder(copy.id), 'GET by id should equal the duplicate response').toEqual(copy);
  const listed = (await listAllPages(api)).find(({ id }) => id === copy.id);
  expect(listed, `${copy.id} should be in the order list`).toEqual(copy);
}

async function listAllPages(api: ApiClient): Promise<Order[]> {
  const pages: Order[][] = [];
  do {
    pages.push(await api.listOrders({ page: pages.length + 1, pageSize: 100 }));
  } while (pages[pages.length - 1].length === 100);
  return pages.flat();
}

/** EVENT(C,S,T): the untouched copy has exactly one creation event that names its source. */
export async function expectDuplicateCreatedEvent(
  api: ApiClient,
  copy: Order,
  source: Order,
  caller: string,
): Promise<void> {
  const events = await api.getOrderEvents(copy.id);
  expect(events, 'an untouched copy has exactly one event').toHaveLength(1);
  expect(events[0]).toEqual({
    orderId: copy.id,
    at: copy.createdAt,
    actor: caller,
    action: 'created',
    details: {
      symbol: copy.symbol,
      side: copy.side,
      quantity: copy.quantity,
      limitPrice: copy.limitPrice,
      source: 'duplicate',
      duplicatedFrom: source.id,
    },
  } satisfies OrderEvent);
}

/** UNCHANGED(S): the source order (and its events) read back exactly as captured. */
export async function expectUnchanged(
  api: ApiClient,
  source: Order,
  sourceEvents?: OrderEvent[],
): Promise<void> {
  expect(await api.getOrder(source.id), `${source.id} should be unchanged`).toEqual(source);
  if (sourceEvents !== undefined) {
    expect(await api.getOrderEvents(source.id), `events of ${source.id} should be unchanged`).toEqual(
      sourceEvents,
    );
  }
}

/** NO-CREATE: runs a refused request on an isolated app and proves no order was added or changed. */
export async function expectNoOrdersChanged(desk: Desk, refused: () => Promise<void>): Promise<void> {
  const before = await desk.listAll();
  await refused();
  const after = await desk.listAll();
  expect(after.map(({ id }) => id).sort(), 'the set of order ids should not change').toEqual(
    before.map(({ id }) => id).sort(),
  );
  expect(after, 'no existing order should change').toEqual(before);
}

/** The flash must be exposed as a status and carry the exact text. */
export async function expectFlash(details: OrderDetailsPage, text: string): Promise<void> {
  await expect(details.flash, 'flash should be a status region').toHaveRole('status');
  await expect(details.flash).toHaveText(text);
}

/** A toast must be exposed as an alert and contain the text. */
export async function expectToast(details: OrderDetailsPage, text: string): Promise<void> {
  await expect(details.toast, 'toast should be an alert').toHaveRole('alert');
  await expect(details.toast).toContainText(text);
}
