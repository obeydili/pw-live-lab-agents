import { test, expect } from '../../fixtures/index';
import { buildOrder } from '../../data/orders';
import { OrdersPage } from '../../pages/orders.page';

test(
  'trader can create order via API and see it in UI',
  { tag: '@hybrid' },
  async ({ apiClient, traderPage, ordersPage }) => {
    const order = await apiClient.createOrder(buildOrder({ quantity: 300, limitPrice: 20 }));
    await ordersPage.reload();
    await expect(traderPage).toHaveURL('/orders');
    await expect(ordersPage.filterRowsByText(order.id)).toContainText('Pending Approval');
  },
);

test(
  'trader2 can create order via API and see it in UI',
  { tag: '@trader2' },
  async ({ trader2ApiClient, trader2Page }) => {
    const orders = new OrdersPage(trader2Page);
    const order = await trader2ApiClient.createOrder(buildOrder({ quantity: 300, limitPrice: 20 }));
    await orders.reload();
    await expect(orders.filterRowsByText(order.id)).toContainText('Pending Approval');
  },
);
