import { Page, test as base } from '@playwright/test';
import type { ApiClient } from '../helpers/api-client';
import { ApiClientPool } from '../helpers/api-client-pool';
import { env, credentials } from '../helpers/env';
import { startIsolatedApp } from '../helpers/isolated-app';
import type { UserKey } from '../types/order';
import { Desk } from './desk';
import { LoginPage } from '../pages/login.page';
import { OrdersPage } from '../pages/orders.page';

type OpenSession = (user: UserKey, baseURL?: string) => Promise<Page>;

type MyFixtures = {
  clientPool: ApiClientPool;
  /** API clients and order setup for the shared app (BASE_URL). */
  desk: Desk;
  /** API clients and order setup for a private app instance started for this test only. */
  isolatedDesk: Desk;
  /** Opens a signed-in page in a fresh browser context; every context is closed after the test. */
  openSession: OpenSession;
  apiClient: ApiClient;
  trader2ApiClient: ApiClient;
  approverApiClient: ApiClient;
  traderPage: Page;
  loginPage: LoginPage;
  ordersPage: OrdersPage;
  trader2Page: Page;
  approverPage: Page;
};

export const test = base.extend<MyFixtures>({
  clientPool: async ({ playwright, baseURL }, use) => {
    const pool = new ApiClientPool(playwright, baseURL ?? env.BASE_URL);
    try {
      await use(pool);
    } finally {
      await pool.dispose();
    }
  },
  desk: async ({ clientPool, baseURL }, use) => {
    await use(new Desk(baseURL ?? env.BASE_URL, clientPool));
  },
  isolatedDesk: async ({ clientPool }, use) => {
    const app = await startIsolatedApp();
    try {
      await use(new Desk(app.baseURL, clientPool));
    } finally {
      await app.stop();
    }
  },
  openSession: async ({ browser, baseURL }, use) => {
    const contexts: Awaited<ReturnType<typeof browser.newContext>>[] = [];
    const open: OpenSession = async (user, sessionBaseURL = baseURL ?? env.BASE_URL) => {
      const context = await browser.newContext({ baseURL: sessionBaseURL });
      contexts.push(context);
      const { username, password } = credentials[user];
      const login = await context.request.post('/api/auth/login', {
        data: { username, password },
      });
      if (!login.ok()) {
        throw new Error(`Failed to sign in ${user}: ${login.status()} ${login.statusText()}`);
      }
      return await context.newPage();
    };
    try {
      await use(open);
    } finally {
      await Promise.all(contexts.map((context) => context.close()));
    }
  },
  apiClient: async ({ desk }, use) => {
    await use(await desk.as('trader1'));
  },
  trader2ApiClient: async ({ desk }, use) => {
    await use(await desk.as('trader2'));
  },
  approverApiClient: async ({ desk }, use) => {
    await use(await desk.as('approver1'));
  },
  loginPage: async ({ page }, use) => {
    const loginPage = new LoginPage(page);
    await use(loginPage);
  },
  ordersPage: async ({ page }, use) => {
    const ordersPage = new OrdersPage(page);
    await use(ordersPage);
  },
  traderPage: async ({ page }, use) => {
    await page.goto('/login');
    const loginPage = new LoginPage(page);
    await loginPage.login(env.TRADER1_USERNAME, env.TRADER1_PASSWORD);
    await use(page);
  },
  trader2Page: async ({ browser }, use) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto('/login');
    const loginPage = new LoginPage(page);
    await loginPage.login(env.TRADER2_USERNAME, env.TRADER2_PASSWORD);
    try {
      await use(page);
    } finally {
      await context.close();
    }
  },
  approverPage: async ({ browser }, use) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto('/login');
    const loginPage = new LoginPage(page);
    await loginPage.login(env.APPROVER1_USERNAME, env.APPROVER1_PASSWORD);
    try {
      await use(page);
    } finally {
      await context.close();
    }
  },
});

export { expect } from '@playwright/test';
