import { expect } from '@playwright/test';
import type { ApiClient } from '../helpers/api-client';
import type { ApiClientPool } from '../helpers/api-client-pool';
import { buildSourceOrder, type SourceProfile } from '../data/orders';
import type { CreateOrderRequest, Order, OrderStatus, UserKey } from '../types/order';

export type SourceOwner = 'own' | 'other';

export interface SourceOptions {
  profile?: SourceProfile;
  status?: OrderStatus;
  /** own = created by trader1 (the caller in duplicate tests); other = created by trader2. */
  owner?: SourceOwner;
  overrides?: Partial<CreateOrderRequest>;
}

export const REJECTION_REASON = 'DEV-02 rejection';
const FILL_BUDGET_MS = 5_000;
const LIST_PAGE_SIZE = 100;

/** The API clients and order setup for one running app (the shared one, or a private isolated one). */
export class Desk {
  private readonly clients = new Map<UserKey, ApiClient>();

  constructor(
    readonly baseURL: string,
    private readonly pool: ApiClientPool,
  ) {}

  async as(user: UserKey): Promise<ApiClient> {
    const existing = this.clients.get(user);
    if (existing !== undefined) {
      return existing;
    }
    const client = await this.pool.signedIn(user, this.baseURL);
    this.clients.set(user, client);
    return client;
  }

  async anonymous(): Promise<ApiClient> {
    return await this.pool.anonymous(this.baseURL);
  }

  async withToken(token: string): Promise<ApiClient> {
    return await this.pool.withToken(token, this.baseURL);
  }

  /** Creates an order through the API and moves it to the requested status. Approved sources are settled (Filled). */
  async createSource({
    profile = 'default',
    status = 'Pending Approval',
    owner = 'own',
    overrides = {},
  }: SourceOptions = {}): Promise<Order> {
    const creator = await this.as(owner === 'own' ? 'trader1' : 'trader2');
    const created = await creator.createOrder({ ...buildSourceOrder(profile), ...overrides });
    if (status === 'Approved') {
      await this.approveAndSettle(created.id);
    }
    if (status === 'Rejected') {
      await (await this.as('approver1')).rejectOrder(created.id, REJECTION_REASON);
    }
    return await creator.getOrder(created.id);
  }

  /** Approves an order and waits until its execution has finished, so snapshots of it stay stable. */
  async approveAndSettle(orderId: string): Promise<Order> {
    const approver = await this.as('approver1');
    await approver.approveOrder(orderId);
    await expect
      .poll(async () => (await approver.getOrder(orderId)).executionStatus, {
        message: `execution of ${orderId} should reach Filled`,
        timeout: FILL_BUDGET_MS,
      })
      .toBe('Filled');
    return await approver.getOrder(orderId);
  }

  /** Every order on this app, all pages. Only meaningful for an isolated app with no other writers. */
  async listAll(): Promise<Order[]> {
    const trader = await this.as('trader1');
    const all: Order[] = [];
    for (let page = 1; ; page += 1) {
      const batch = await trader.listOrders({ page, pageSize: LIST_PAGE_SIZE });
      all.push(...batch);
      if (batch.length < LIST_PAGE_SIZE) {
        return all;
      }
    }
  }
}
