import { test } from '../../fixtures/index';
import { expect, APIResponse } from '@playwright/test';
import { readJson } from '../../helpers/readJson';
import type { Order } from '../../types/order';
import { OrdersPage } from '../../pages/orders.page';

test(
  'trader can create order via API and see it in UI',
  { tag: '@hybrid' },
  async ({ apiClient, traderPage, ordersPage }) => {
    //await apiClient.reset();
    const order = await apiClient.createOrder({
      symbol: 'ACME',
      side: 'Buy',
      quantity: 300,
      limitPrice: 20,
      clientOrderId: `${Date.now()}`,
    });
    await ordersPage.navigate('/orders');
    await expect(traderPage).toHaveURL('/orders');
    await expect(ordersPage.filterRowsByText(order.id)).toContainText('Pending Approval');
  },
);

test(
  'trader2 can create order via API and see it in UI',
  { tag: '@trader2' },
  async ({ trader2ApiClient, trader2Page }) => {
    //await apiClient.reset();
    const orders = new OrdersPage(trader2Page);
    const order = await trader2ApiClient.createOrder({
      symbol: 'ACME',
      side: 'Buy',
      quantity: 300,
      limitPrice: 20,
      clientOrderId: `${Date.now()}`,
    });
    await orders.navigate('/orders');
    await expect(orders.filterRowsByText(order.id)).toContainText('Pending Approval');
  },
);
