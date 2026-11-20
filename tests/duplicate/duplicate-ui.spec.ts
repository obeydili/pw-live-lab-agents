import { test, expect } from '../../fixtures/index';
import { credentials } from '../../helpers/env';
import { OrderDetailsPage } from '../../pages/order-details.page';
import { readJson } from '../../helpers/readJson';
import type { ErrorResponse, Order, OrderStatus } from '../../types/order';
import { DUPLICATE_URL, captureDuplicate } from '../support/duplicate-network';
import {
  expectCopyOf,
  expectCopyPersisted,
  expectDuplicateCreatedEvent,
  expectFlash,
  expectNoOrdersChanged,
  expectToast,
  expectUnchanged,
} from '../support/duplicate-assertions';

const trader1 = credentials.trader1.username;
const STATUSES = ['Pending Approval', 'Approved', 'Rejected'] as const satisfies readonly OrderStatus[];
const PAST_GTD_MESSAGE = 'Good till date is required for GTD and cannot be in the past.';

const copyFlash = (copyId: string, sourceId: string): string => `Order ${copyId} created as a copy of ${sourceId}.`;

test.describe('Duplicate order UI', () => {
  test(
    'should navigate to the new copy when the trader activates Duplicate order with the keyboard',
    { tag: ['@hybrid', '@smoke'], annotation: { type: 'plan', description: 'TC13 (AC5)' } },
    async ({ desk, openSession }) => {
      const trader = await desk.as('trader1');
      const source = await desk.createSource({ profile: 'full' });
      const page = await openSession('trader1');
      const details = new OrderDetailsPage(page);
      await details.open(source.id);
      await expect(details.duplicateButton).toBeEnabled();

      const duplicate = await captureDuplicate(page);
      await details.activateDuplicateWithKeyboard();

      const copy = await expectCopyOf(await duplicate.response, source, trader1);
      await expect(page, 'should land on the copy with the duplicated flag').toHaveURL(
        new RegExp(`/orders/${copy.id}\\?duplicated=1$`),
      );
      await expectFlash(details, copyFlash(copy.id, source.id));
      expect(duplicate.requestCount(), 'exactly one duplicate request was sent').toBe(1);
      await expectCopyPersisted(trader, copy);
      await expectUnchanged(trader, source);
    },
  );

  for (const status of STATUSES) {
    for (const owner of ['own', 'other'] as const) {
      test(
        `should show Duplicate order to a trader when a ${status} order of ${owner === 'own' ? 'the same' : 'another'} trader loads`,
        { tag: ['@ui', '@regression'], annotation: { type: 'plan', description: 'TC14 (AC5)' } },
        async ({ desk, openSession }) => {
          const source = await desk.createSource({ status, owner });
          const page = await openSession('trader1');
          const details = new OrderDetailsPage(page);

          await details.open(source.id);

          await expect(details.duplicateButton, 'a trader can duplicate any order').toBeVisible();
          await expect(details.duplicateButton).toBeEnabled();
          await expect(page.getByTestId('duplicate-order')).toHaveCount(1);
          if (status === 'Pending Approval' && owner === 'own') {
            await expect(details.actionButtons, 'Cancel order comes before Duplicate order').toHaveText([
              'Cancel order',
              'Duplicate order',
            ]);
          }
        },
      );
    }

    test(
      `should hide Duplicate order from an approver when a ${status} order loads`,
      { tag: ['@ui', '@regression'], annotation: { type: 'plan', description: 'TC14 (AC5)' } },
      async ({ desk, openSession }) => {
        const source = await desk.createSource({ status });
        const page = await openSession('approver1');
        const details = new OrderDetailsPage(page);

        await details.open(source.id);

        await expect(page.getByRole('heading', { name: source.id })).toBeVisible();
        await expect(details.loadingSpinner).toBeHidden();
        await expect(details.duplicateButton).toHaveCount(0);
      },
    );
  }

  test(
    'should hide duplication until source details finish loading',
    { tag: ['@ui', '@regression'], annotation: { type: 'plan', description: 'TC15 (AC5)' } },
    async ({ desk, openSession }) => {
      const source = await desk.createSource();
      const page = await openSession('trader1');
      const details = new OrderDetailsPage(page);
      let release: () => void = () => {};
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      await page.route(new RegExp(`/api/orders/${source.id}$`), async (route) => {
        await gate;
        await route.continue();
      });

      await details.open(source.id);
      await expect(details.loadingSpinner).toBeVisible();
      await expect(details.duplicateButton, 'no Duplicate order while loading').toHaveCount(0);

      release();

      await expect(details.loadingSpinner).toBeHidden();
      await expect(details.duplicateButton).toBeEnabled();
    },
  );

  test(
    'should prevent a second submission while duplication is in flight',
    { tag: ['@hybrid', '@regression'], annotation: { type: 'plan', description: 'TC16 (AC5)' } },
    async ({ desk, openSession }) => {
      const trader = await desk.as('trader1');
      const source = await desk.createSource({ profile: 'full' });
      const page = await openSession('trader1');
      const details = new OrderDetailsPage(page);
      await details.open(source.id);
      let release: () => void = () => {};
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const duplicate = await captureDuplicate(page, gate);

      await details.clickDuplicate();
      await expect(details.duplicateButton, 'disabled while the request runs').toBeDisabled();
      await page.keyboard.press('Enter');
      release();

      const copy = await expectCopyOf(await duplicate.response, source, trader1);
      await expect(page).toHaveURL(new RegExp(`/orders/${copy.id}\\?duplicated=1$`));
      await expectFlash(details, copyFlash(copy.id, source.id));
      expect(duplicate.requestCount(), 'only one duplicate request reached the server').toBe(1);
      await expectCopyPersisted(trader, copy);
      await expectUnchanged(trader, source);
    },
  );

  test(
    'should recover source attribution when sessionStorage has no copy source',
    { tag: ['@hybrid', '@regression'], annotation: { type: 'plan', description: 'TC17 (AC5, AC6)' } },
    async ({ desk, openSession }) => {
      const trader = await desk.as('trader1');
      const source = await desk.createSource({ profile: 'full' });
      const copy = await expectCopyOf(await trader.duplicateOrderResponse(source.id), source, trader1);
      const page = await openSession('trader1');
      const details = new OrderDetailsPage(page);

      await details.open(copy.id, '?duplicated=1');
      await expectFlash(details, copyFlash(copy.id, source.id));
      await page.reload();

      await expectFlash(details, copyFlash(copy.id, source.id));
      await expectDuplicateCreatedEvent(trader, copy, source, trader1);
      expect(await trader.getOrder(copy.id)).toEqual(copy);
    },
  );

  test(
    'should hide the duplicate flash when the flag is absent',
    { tag: ['@ui', '@regression'], annotation: { type: 'plan', description: 'TC18 (AC5)' } },
    async ({ desk, openSession }) => {
      const trader = await desk.as('trader1');
      const source = await desk.createSource();
      const copy = await expectCopyOf(await trader.duplicateOrderResponse(source.id), source, trader1);
      const page = await openSession('trader1');
      const details = new OrderDetailsPage(page);

      await details.open(copy.id);

      await expect(page.getByRole('heading', { name: copy.id })).toBeVisible();
      await expect(details.flash).toHaveRole('status');
      await expect(details.flash).toBeHidden();
      await expectUnchanged(trader, source);
      expect(await trader.getOrder(copy.id)).toEqual(copy);
    },
  );

  test(
    'should render validation details and allow retry when the endpoint refuses',
    { tag: ['@ui', '@regression'], annotation: { type: 'plan', description: 'TC19 (AC5; UI handling only, not AC4 backend)' } },
    async ({ desk, openSession }) => {
      const trader = await desk.as('trader1');
      const source = await desk.createSource();
      const page = await openSession('trader1');
      const details = new OrderDetailsPage(page);
      await details.open(source.id);
      await page.route(DUPLICATE_URL, (route) =>
        route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Validation failed.', details: { goodTillDate: PAST_GTD_MESSAGE } }),
        }),
      );

      await details.clickDuplicate();

      await expectToast(details, `Validation failed. ${PAST_GTD_MESSAGE}`);
      await expect(page, 'stays on the source order').toHaveURL(new RegExp(`/orders/${source.id}$`));
      await expect(details.duplicateButton, 'enabled again for a retry').toBeEnabled();
      await expectUnchanged(trader, source);

      await page.unroute(DUPLICATE_URL);
      const retry = await captureDuplicate(page);
      const copyId = await details.duplicate();

      const copy = await expectCopyOf(await retry.response, source, trader1);
      expect(copy.id, 'the retry created the copy the browser landed on').toBe(copyId);
      await expectFlash(details, copyFlash(copyId, source.id));
      expect(retry.requestCount(), 'the retry sent exactly one request').toBe(1);
      await expectCopyPersisted(trader, copy);
      await expectUnchanged(trader, source);
    },
  );

  test(
    'should recover on a real not-found response when the source was deleted after loading',
    { tag: ['@hybrid', '@regression'], annotation: { type: 'plan', description: 'TC20 (AC3, AC5)' } },
    async ({ isolatedDesk, openSession }) => {
      const trader = await isolatedDesk.as('trader1');
      const source = await isolatedDesk.createSource();
      const page = await openSession('trader1', isolatedDesk.baseURL);
      const details = new OrderDetailsPage(page);
      await details.open(source.id);
      await expect(details.duplicateButton).toBeEnabled();
      await trader.deleteOrder(source.id);

      await expectNoOrdersChanged(isolatedDesk, async () => {
        const responsePromise = page.waitForResponse(DUPLICATE_URL);
        await details.clickDuplicate();
        const response = await responsePromise;
        expect(response.status(), 'the real API refuses with 404').toBe(404);
        expect(await readJson<ErrorResponse>(response)).toEqual({ error: `Order ${source.id} not found.` });
      });

      await expectToast(details, `Order ${source.id} not found.`);
      await expect(page, 'stays on the source order').toHaveURL(new RegExp(`/orders/${source.id}$`));
      await expect(details.duplicateButton).toBeEnabled();
      expect((await trader.getOrderResponse(source.id)).status(), 'the source stays deleted').toBe(404);
    },
  );

  test(
    'should preserve the existing creation flash when created=1 is used',
    { tag: ['@ui', '@regression'], annotation: { type: 'plan', description: 'TC23 (regression)' } },
    async ({ desk, openSession }) => {
      const order: Order = await desk.createSource();
      const page = await openSession('trader1');
      const details = new OrderDetailsPage(page);

      await details.open(order.id, '?created=1');

      await expectFlash(details, `Order ${order.id} submitted for approval.`);
    },
  );
});
