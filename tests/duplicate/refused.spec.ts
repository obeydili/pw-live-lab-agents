import { randomUUID } from 'node:crypto';
import { test } from '../../fixtures/index';
import { readJson } from '../../helpers/readJson';
import type { ErrorResponse } from '../../types/order';
import { expectError, expectNoOrdersChanged, expectUnchanged } from '../support/duplicate-assertions';

const UNKNOWN_ID = 'ORD-999999';
const ID_VARIANTS = ['an existing', 'an unknown'] as const;

// Every case here runs on its own private app instance (isolatedDesk), because "no order was created"
// can only be proven when nothing else writes to the app.
test.describe('Duplicate order API: refused requests', () => {
  for (const variant of ID_VARIANTS) {
    test(
      `should require authentication before id lookup when ${variant} id is sent without a token`,
      { tag: ['@api', '@regression'], annotation: { type: 'plan', description: 'TC07 (AC3)' } },
      async ({ isolatedDesk }) => {
        const trader = await isolatedDesk.as('trader1');
        const anonymous = await isolatedDesk.anonymous();
        const source = await isolatedDesk.createSource();
        const id = variant === 'an existing' ? source.id : UNKNOWN_ID;

        await expectNoOrdersChanged(isolatedDesk, async () => {
          await expectError(await anonymous.duplicateOrderResponse(id), 401, 'Authentication required.');
        });

        await expectUnchanged(trader, source);
      },
    );

    test(
      `should reject an approver before id lookup when ${variant} id is sent`,
      { tag: ['@api', '@regression'], annotation: { type: 'plan', description: 'TC08 (AC3)' } },
      async ({ isolatedDesk }) => {
        const trader = await isolatedDesk.as('trader1');
        const approver = await isolatedDesk.as('approver1');
        const source = await isolatedDesk.createSource();
        const id = variant === 'an existing' ? source.id : UNKNOWN_ID;

        await expectNoOrdersChanged(isolatedDesk, async () => {
          await expectError(await approver.duplicateOrderResponse(id), 403, 'Only a trader can do this.');
        });

        await expectUnchanged(trader, source);
      },
    );
  }

  test(
    'should leave orders unchanged when an invalid token is supplied',
    { tag: ['@api', '@regression'], annotation: { type: 'plan', description: 'TC09 (AC3, response values excepted by Omer)' } },
    async ({ isolatedDesk }) => {
      const trader = await isolatedDesk.as('trader1');
      const source = await isolatedDesk.createSource();
      const invalid = await isolatedDesk.withToken(`invalid-${randomUUID()}`);

      await expectNoOrdersChanged(isolatedDesk, async () => {
        const res = await invalid.duplicateOrderResponse(source.id);
        const body = await readJson<ErrorResponse>(res);
        test.info().annotations.push({
          type: 'observed invalid-token response',
          description: `${res.status()} ${JSON.stringify(body)}`,
        });
      });

      await expectUnchanged(trader, source);
    },
  );

  test(
    'should refuse duplication when the source id was never created',
    { tag: ['@api', '@regression'], annotation: { type: 'plan', description: 'TC10 (AC3)' } },
    async ({ isolatedDesk }) => {
      const trader = await isolatedDesk.as('trader1');
      await expectError(await trader.getOrderResponse(UNKNOWN_ID), 404, `Order ${UNKNOWN_ID} not found.`);

      await expectNoOrdersChanged(isolatedDesk, async () => {
        await expectError(await trader.duplicateOrderResponse(UNKNOWN_ID), 404, `Order ${UNKNOWN_ID} not found.`);
      });

      await expectError(await trader.getOrderResponse(UNKNOWN_ID), 404, `Order ${UNKNOWN_ID} not found.`);
    },
  );

  test(
    'should refuse duplication when the source order was deleted',
    { tag: ['@api', '@regression'], annotation: { type: 'plan', description: 'TC10 (AC3)' } },
    async ({ isolatedDesk }) => {
      const trader = await isolatedDesk.as('trader1');
      const source = await isolatedDesk.createSource();
      await trader.deleteOrder(source.id);
      await expectError(await trader.getOrderResponse(source.id), 404, `Order ${source.id} not found.`);

      await expectNoOrdersChanged(isolatedDesk, async () => {
        await expectError(await trader.duplicateOrderResponse(source.id), 404, `Order ${source.id} not found.`);
      });

      await expectError(await trader.getOrderResponse(source.id), 404, `Order ${source.id} not found.`);
    },
  );

  test(
    'should reject malformed JSON before duplicating',
    { tag: ['@api', '@regression'], annotation: { type: 'plan', description: 'TC29 (existing parser contract)' } },
    async ({ isolatedDesk }) => {
      const trader = await isolatedDesk.as('trader1');
      const source = await isolatedDesk.createSource();

      await expectNoOrdersChanged(isolatedDesk, async () => {
        const res = await trader.duplicateOrderResponse(source.id, { body: '{"quantity": ' });
        await expectError(res, 400, 'Malformed JSON body.');
      });

      await expectUnchanged(trader, source);
    },
  );
});

