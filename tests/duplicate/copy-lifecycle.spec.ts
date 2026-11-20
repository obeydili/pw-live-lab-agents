import { test, expect } from '../../fixtures/index';
import { REJECTION_REASON, type Desk } from '../../fixtures/desk';
import type { ApiClient } from '../../helpers/api-client';
import { credentials } from '../../helpers/env';
import type { Order } from '../../types/order';
import {
  expectCopyOf,
  expectError,
  expectNoOrdersChanged,
  expectUnchanged,
} from '../support/duplicate-assertions';

const trader1 = credentials.trader1.username;
const approver = credentials.approver1.username;
const EDITED_QUANTITY = 77;

interface SourceAndCopy {
  source: Order;
  copy: Order;
}

async function duplicateFreshSource(desk: Desk): Promise<SourceAndCopy> {
  const trader = await desk.as('trader1');
  const source = await desk.createSource();
  const copy = await expectCopyOf(await trader.duplicateOrderResponse(source.id), source, trader1);
  return { source, copy };
}

test.describe('Duplicate order API: the copy lives its own life', () => {
  test(
    'should edit a copy independently when its owner patches it',
    { tag: ['@api', '@regression'], annotation: { type: 'plan', description: 'TC24 (state rules)' } },
    async ({ desk }) => {
      const trader = await desk.as('trader1');
      const { source, copy } = await duplicateFreshSource(desk);

      const updated = await trader.patchOrder(copy.id, { quantity: EDITED_QUANTITY });

      expect(updated.quantity).toBe(EDITED_QUANTITY);
      expect(updated.status).toBe('Pending Approval');
      expect(updated.clientOrderId).toBeNull();
      expect(Number.isNaN(Date.parse(updated.updatedAt ?? '')), 'updatedAt is a valid timestamp').toBe(false);
      expect({ ...updated, quantity: copy.quantity, updatedAt: null }, 'only quantity and updatedAt changed').toEqual(copy);
      expect(await trader.getOrder(copy.id)).toEqual(updated);
      await expectUnchanged(trader, source);
    },
  );

  test(
    'should edit a copy independently when its owner replaces it',
    { tag: ['@api', '@regression'], annotation: { type: 'plan', description: 'TC24 (state rules)' } },
    async ({ desk }) => {
      const trader = await desk.as('trader1');
      const { source, copy } = await duplicateFreshSource(desk);

      const updated = await trader.putOrder(copy.id, {
        symbol: copy.symbol,
        side: copy.side,
        quantity: EDITED_QUANTITY,
        limitPrice: copy.limitPrice,
      });

      expect(updated.quantity).toBe(EDITED_QUANTITY);
      expect(updated.status).toBe('Pending Approval');
      expect(updated.clientOrderId).toBeNull();
      expect(Number.isNaN(Date.parse(updated.updatedAt ?? '')), 'updatedAt is a valid timestamp').toBe(false);
      expect({ ...updated, quantity: copy.quantity, updatedAt: null }, 'only quantity and updatedAt changed').toEqual(copy);
      expect(await trader.getOrder(copy.id)).toEqual(updated);
      await expectUnchanged(trader, source);
    },
  );

  test(
    'should approve a copy independently when an approver acts',
    { tag: ['@api', '@regression'], annotation: { type: 'plan', description: 'TC25 (state rules)' } },
    async ({ desk }) => {
      const trader = await desk.as('trader1');
      const approverApi = await desk.as('approver1');
      const { source, copy } = await duplicateFreshSource(desk);

      const approved = await approverApi.approveOrder(copy.id);

      expect(approved.status).toBe('Approved');
      expect(approved.decidedBy).toBe(approver);
      expect(Number.isNaN(Date.parse(approved.decidedAt ?? '')), 'decidedAt is a valid timestamp').toBe(false);
      expect(approved.executionStatus).toBe('Working');
      await expect
        .poll(async () => (await trader.getOrder(copy.id)).executionStatus, {
          message: `execution of ${copy.id} should reach Filled`,
          timeout: 5_000,
        })
        .toBe('Filled');
      const filled = await trader.getOrder(copy.id);
      expect(Number.isNaN(Date.parse(filled.filledAt ?? '')), 'filledAt is a valid timestamp').toBe(false);
      await expectUnchanged(trader, source);
    },
  );

  test(
    'should reject a copy independently when an approver acts',
    { tag: ['@api', '@regression'], annotation: { type: 'plan', description: 'TC26 (state rules)' } },
    async ({ desk }) => {
      const trader = await desk.as('trader1');
      const approverApi = await desk.as('approver1');
      const { source, copy } = await duplicateFreshSource(desk);

      const rejected = await approverApi.rejectOrder(copy.id, REJECTION_REASON);

      expect(rejected.status).toBe('Rejected');
      expect(rejected.rejectionReason).toBe(REJECTION_REASON);
      expect(rejected.decidedBy).toBe(approver);
      expect(Number.isNaN(Date.parse(rejected.decidedAt ?? '')), 'decidedAt is a valid timestamp').toBe(false);
      expect(rejected.executionStatus).toBeNull();
      expect(rejected.filledAt).toBeNull();
      expect(await trader.getOrder(copy.id)).toEqual(rejected);
      await expectUnchanged(trader, source);
    },
  );

  test(
    'should remove only the copy when its owner cancels',
    { tag: ['@api', '@regression'], annotation: { type: 'plan', description: 'TC27 (state rules)' } },
    async ({ desk }) => {
      const trader = await desk.as('trader1');
      const { source, copy } = await duplicateFreshSource(desk);

      const res = await trader.deleteOrderResponse(copy.id);

      expect(res.status(), 'DELETE should answer 204 No Content').toBe(204);
      expect(await res.text(), 'DELETE has no body').toBe('');
      await expectError(await trader.getOrderResponse(copy.id), 404, `Order ${copy.id} not found.`);
      await expectUnchanged(trader, source);
    },
  );
});

// Edit restrictions are checked on a private app instance: "nothing changed" needs no other writers.
test.describe('Duplicate order API: ordinary edit restrictions on a copy', () => {
  test(
    'should refuse an edit when another trader patches the copy',
    { tag: ['@api', '@regression'], annotation: { type: 'plan', description: 'TC28 (R3)' } },
    async ({ isolatedDesk }) => {
      const other = await isolatedDesk.as('trader2');
      await expectEditRefused(isolatedDesk, other, 403, 'You can only change your own orders.');
    },
  );

  test(
    'should refuse an edit when an approver patches the copy',
    { tag: ['@api', '@regression'], annotation: { type: 'plan', description: 'TC28 (R3)' } },
    async ({ isolatedDesk }) => {
      const approverApi = await isolatedDesk.as('approver1');
      await expectEditRefused(isolatedDesk, approverApi, 403, 'Only a trader can do this.');
    },
  );

  test(
    'should refuse an edit when the owner patches an approved copy',
    { tag: ['@api', '@regression'], annotation: { type: 'plan', description: 'TC28 (R3)' } },
    async ({ isolatedDesk }) => {
      const owner = await isolatedDesk.as('trader1');
      await expectEditRefused(isolatedDesk, owner, 409, (id) => `Order ${id} is already Approved.`, async (id) => {
        await isolatedDesk.approveAndSettle(id);
      });
    },
  );

  test(
    'should refuse an edit when the owner patches a rejected copy',
    { tag: ['@api', '@regression'], annotation: { type: 'plan', description: 'TC28 (R3)' } },
    async ({ isolatedDesk }) => {
      const owner = await isolatedDesk.as('trader1');
      await expectEditRefused(isolatedDesk, owner, 409, (id) => `Order ${id} is already Rejected.`, async (id) => {
        await (await isolatedDesk.as('approver1')).rejectOrder(id, REJECTION_REASON);
      });
    },
  );
});

type ErrorMessage = string | ((copyId: string) => string);

/** Duplicates a fresh order, optionally decides the copy, then proves one refused PATCH changed nothing. */
async function expectEditRefused(
  desk: Desk,
  actor: ApiClient,
  status: number,
  message: ErrorMessage,
  decide: (copyId: string) => Promise<void> = async () => {},
): Promise<void> {
  const trader = await desk.as('trader1');
  const { source, copy: created } = await duplicateFreshSource(desk);
  await decide(created.id);
  const copy = await trader.getOrder(created.id);
  const copyEvents = await trader.getOrderEvents(copy.id);
  const sourceEvents = await trader.getOrderEvents(source.id);
  const expected = typeof message === 'string' ? message : message(copy.id);

  await expectNoOrdersChanged(desk, async () => {
    await expectError(await actor.patchOrderResponse(copy.id, { quantity: EDITED_QUANTITY }), status, expected);
  });

  await expectUnchanged(trader, copy, copyEvents);
  await expectUnchanged(trader, source, sourceEvents);
}
