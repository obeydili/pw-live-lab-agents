import { test, expect } from '../../fixtures/index';
import { credentials } from '../../helpers/env';
import { buildOrder, utcDate } from '../../data/orders';
import type { CreateOrderRequest, OrderStatus } from '../../types/order';
import {
  expectCopyOf,
  expectCopyPersisted,
  expectDuplicateCreatedEvent,
  expectUnchanged,
  measure,
} from '../support/duplicate-assertions';

const trader1 = credentials.trader1.username;
const trader2 = credentials.trader2.username;
const STATUSES = ['Pending Approval', 'Approved', 'Rejected'] as const satisfies readonly OrderStatus[];
const OWNERS = ['own', 'other'] as const;

test.describe('Duplicate order API: create', () => {
  for (const status of STATUSES) {
    for (const owner of OWNERS) {
      test(
        `should create a fresh pending copy when a ${status} order of ${owner === 'own' ? 'the same' : 'another'} trader is duplicated`,
        { tag: ['@api', '@smoke'], annotation: { type: 'plan', description: 'TC01 (AC1, AC2)' } },
        async ({ desk }) => {
          const trader = await desk.as('trader1');
          const source = await desk.createSource({ profile: 'full', status, owner });
          const sourceEvents = await trader.getOrderEvents(source.id);
          if (status !== 'Pending Approval') {
            expect(source.decidedBy, 'a decided source carries decision data').not.toBeNull();
          }

          const { result: res, window } = await measure(() => trader.duplicateOrderResponse(source.id));
          const copy = await expectCopyOf(res, source, trader1, window);

          await expectCopyPersisted(trader, copy);
          await expectUnchanged(trader, source, sourceEvents);
        },
      );
    }
  }

  test(
    'should apply create defaults when optional ticket inputs were omitted',
    { tag: ['@api', '@regression'], annotation: { type: 'plan', description: 'TC02 (AC1)' } },
    async ({ desk }) => {
      const trader = await desk.as('trader1');
      const source = await desk.createSource({ profile: 'default' });
      expect([source.timeInForce, source.goodTillDate, source.urgent, source.notes]).toEqual([
        'Day',
        null,
        false,
        null,
      ]);

      const copy = await expectCopyOf(await trader.duplicateOrderResponse(source.id), source, trader1);

      expect([copy.timeInForce, copy.goodTillDate, copy.urgent, copy.notes]).toEqual(['Day', null, false, null]);
      await expectCopyPersisted(trader, copy);
      await expectUnchanged(trader, source);
    },
  );

  test(
    'should retain GTC semantics when a source has no date and an empty note',
    { tag: ['@api', '@regression'], annotation: { type: 'plan', description: 'TC03 (AC1)' } },
    async ({ desk }) => {
      const trader = await desk.as('trader1');
      const source = await desk.createSource({ profile: 'gtc' });

      const copy = await expectCopyOf(await trader.duplicateOrderResponse(source.id), source, trader1);

      expect([copy.timeInForce, copy.goodTillDate, copy.urgent, copy.notes]).toEqual(['GTC', null, false, null]);
      await expectCopyPersisted(trader, copy);
      await expectUnchanged(trader, source);
    },
  );

  test(
    'should ignore supplied order overrides when duplicating',
    { tag: ['@api', '@regression'], annotation: { type: 'plan', description: 'TC04 (AC1)' } },
    async ({ desk }) => {
      const trader = await desk.as('trader1');
      const source = await desk.createSource({ profile: 'full' });
      const overrides = {
        quantity: 0,
        symbol: 'INVALID',
        status: 'Approved',
        createdBy: trader2,
        clientOrderId: source.id,
        notes: 'override',
        unknownField: true,
      };

      const res = await trader.duplicateOrderResponse(source.id, { body: overrides });

      const copy = await expectCopyOf(res, source, trader1);
      await expectCopyPersisted(trader, copy);
      await expectUnchanged(trader, source);
    },
  );

  test(
    'should create distinct orders when the same unique-client-id source is duplicated twice',
    { tag: ['@api', '@smoke'], annotation: { type: 'plan', description: 'TC05 (AC2)' } },
    async ({ desk }) => {
      const trader = await desk.as('trader1');
      const source = await desk.createSource();
      expect(source.clientOrderId, 'the source has a unique client id').not.toBeNull();

      const first = await expectCopyOf(await trader.duplicateOrderResponse(source.id), source, trader1);
      const second = await expectCopyOf(await trader.duplicateOrderResponse(source.id), source, trader1);

      expect(new Set([source.id, first.id, second.id]).size, 'source and both copies have distinct ids').toBe(3);
      await expectCopyPersisted(trader, first);
      await expectCopyPersisted(trader, second);
      await expectUnchanged(trader, source);
    },
  );

  test(
    'should start an independent creation history when duplicating a decided source',
    { tag: ['@api', '@smoke'], annotation: { type: 'plan', description: 'TC06 (AC6)' } },
    async ({ desk }) => {
      const trader = await desk.as('trader1');
      const source = await desk.createSource({ status: 'Rejected' });
      const sourceEvents = await trader.getOrderEvents(source.id);

      const copy = await expectCopyOf(await trader.duplicateOrderResponse(source.id), source, trader1);

      await expectCopyPersisted(trader, copy);
      await expectDuplicateCreatedEvent(trader, copy, source, trader1);
      await expectUnchanged(trader, source, sourceEvents);
    },
  );

  test(
    'should allocate independent copies when two traders duplicate concurrently',
    { tag: ['@api', '@regression'], annotation: { type: 'plan', description: 'TC12 (AC1, AC2, AC6)' } },
    async ({ desk }) => {
      const [first, second] = await Promise.all([desk.as('trader1'), desk.as('trader2')]);
      const source = await desk.createSource({ profile: 'full' });
      const sourceEvents = await first.getOrderEvents(source.id);

      const [res1, res2] = await Promise.all([
        first.duplicateOrderResponse(source.id),
        second.duplicateOrderResponse(source.id),
      ]);
      const copy1 = await expectCopyOf(res1, source, trader1);
      const copy2 = await expectCopyOf(res2, source, trader2);

      expect(new Set([source.id, copy1.id, copy2.id]).size, 'three distinct ids').toBe(3);
      await expectCopyPersisted(first, copy1);
      await expectCopyPersisted(first, copy2);
      await expectDuplicateCreatedEvent(first, copy1, source, trader1);
      await expectDuplicateCreatedEvent(first, copy2, source, trader2);
      await expectUnchanged(first, source, sourceEvents);
    },
  );

  const BOUNDARIES: ReadonlyArray<{ name: string; overrides: () => Partial<CreateOrderRequest> }> = [
    { name: 'quantity is 1', overrides: () => ({ quantity: 1 }) },
    { name: 'quantity is 1,000,000', overrides: () => ({ quantity: 1_000_000 }) },
    { name: 'limit price is 0.01', overrides: () => ({ limitPrice: 0.01 }) },
    { name: 'notes are 200 characters', overrides: () => ({ notes: 'n'.repeat(200) }) },
    { name: 'good-till date is today (UTC)', overrides: () => ({ timeInForce: 'GTD', goodTillDate: utcDate(0) }) },
  ];

  for (const { name, overrides: boundary } of BOUNDARIES) {
    test(
      `should retain the boundary value when ${name}`,
      { tag: ['@api', '@regression'], annotation: { type: 'plan', description: 'TC21 (AC1)' } },
      async ({ desk }) => {
        const trader = await desk.as('trader1');
        const overrides = boundary();
        const source = await desk.createSource({ overrides });
        expect(source, 'the source holds the requested boundary value').toMatchObject(overrides);
        test.skip(
          overrides.goodTillDate !== undefined && overrides.goodTillDate !== utcDate(0),
          'UTC midnight passed during setup, so the boundary date is no longer today',
        );

        const copy = await expectCopyOf(await trader.duplicateOrderResponse(source.id), source, trader1);

        await expectCopyPersisted(trader, copy);
        await expectUnchanged(trader, source);
      },
    );
  }

  test(
    'should share the existing id allocator with ordinary creation',
    { tag: ['@api', '@regression'], annotation: { type: 'plan', description: 'TC22 (AC1)' } },
    async ({ isolatedDesk }) => {
      const trader = await isolatedDesk.as('trader1');
      const source = await isolatedDesk.createSource();
      const suffix = (id: string): number => Number(id.replace('ORD-', ''));

      const copy = await expectCopyOf(await trader.duplicateOrderResponse(source.id), source, trader1);
      const ordinaryInput = buildOrder();
      const ordinary = await trader.createOrder(ordinaryInput);

      expect(suffix(copy.id), 'the copy takes the next number after its source').toBe(suffix(source.id) + 1);
      expect(suffix(ordinary.id), 'ordinary creation takes the number after the copy').toBe(suffix(copy.id) + 1);
      expect(ordinary.clientOrderId, 'the ordinary order keeps its own submitted client id').toBe(
        ordinaryInput.clientOrderId,
      );
      await expectCopyPersisted(trader, copy);
      expect(await trader.getOrder(ordinary.id)).toEqual(ordinary);
    },
  );
});

