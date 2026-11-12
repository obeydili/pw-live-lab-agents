import { request, expect } from '@playwright/test';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3300';

async function main() {
  // TODO: request.newContext; reset; 401 check; login; create order; get by id; 404 check; dispose
  const apiContext = await request.newContext({
    baseURL: BASE_URL,
  });

  try {
    const response1 = await apiContext.post('/api/test/reset');
    expect(response1.status()).toBe(200);

    const response2 = await apiContext.get('/api/me');
    expect(response2.status()).toBe(401);

    const response3 = await apiContext.post('/api/auth/login', {
      data: { username: 'trader1', password: 'Password123!' },
    });
    const jsonResponse3 = await response3.json();
    const token = jsonResponse3.token;
    const Data = {
      symbol: 'ACME',
      side: 'Buy',
      quantity: 10,
      limitPrice: 12.5,
    };

    const response4 = await apiContext.post('/api/orders', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      data: Data,
    });

    expect(response4.status()).toBe(201);
    const jsonResponse4 = await response4.json();
    expect(jsonResponse4.status).toBe('Pending Approval');
    const orderId = jsonResponse4.id;

    const response5 = await apiContext.get(`/api/orders/${orderId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const jsonResponse5 = await response5.json();
    expect(jsonResponse5.symbol).toBe(Data.symbol);
    expect(jsonResponse5.side).toBe(Data.side);
    expect(jsonResponse5.quantity).toBe(Data.quantity);
    expect(jsonResponse5.limitPrice).toBe(Data.limitPrice);
    // expect(jsonResponse5).toMatchObject(Data);

    const response6 = await apiContext.get(`/api/orders/ORD-9999`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    expect(response6.status()).toBe(404);
    console.log('PASS');
  } finally {
    await apiContext.dispose();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
