import { APIRequestContext, APIResponse } from '@playwright/test';
import { readJson } from './readJson';
import type { OrdersQuery, RequestOptions } from '../types/api';
import type {
  LoginResponse,
  UserInfo,
  CreateOrderRequest,
  UpdateOrderRequest,
  Order,
  OrderEvent,
} from '../types/order';

export class ApiClient {
  private token: string | null = null;

  constructor(private readonly request: APIRequestContext) {}

  /** A client that sends the given token as-is, without logging in (for invalid-token cases). */
  static withToken(request: APIRequestContext, token: string): ApiClient {
    const client = new ApiClient(request);
    client.token = token;
    return client;
  }

  async login(username: string, password: string): Promise<void> {
    // 1. POST to /api/auth/login
    // 2. Use readJson to get the token
    // 3. Set this.token = data.token;

    const loginResponse: APIResponse = await this.request.post('/api/auth/login', {
      data: {
        username: username,
        password: password,
      },
    });

    if (!loginResponse.ok()) {
      throw new Error(
        `Failed to login: ${loginResponse.status()} ${loginResponse.statusText()}`,
      );
    }

    const data = await readJson<LoginResponse>(loginResponse);
    this.token = data.token;
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.token !== null) {
      headers.Authorization = `Bearer ${this.token}`;
    }
    return headers;
  }

  async reset(): Promise<APIResponse> {
    return await this.request.post('/api/test/reset', {
      headers: this.getHeaders(),
    });
  }

  async me(): Promise<UserInfo> {
    const res = await this.request.get('/api/me', {
      headers: this.getHeaders(),
    });
    if (!res.ok()) {
      throw new Error(`Failed to get current user: ${res.status()} ${res.statusText()}`);
    }
    return await readJson<UserInfo>(res);
  }

  async createOrder(order: CreateOrderRequest): Promise<Order> {
    const res = await this.request.post('/api/orders', {
      headers: this.getHeaders(),
      data: order,
    });
    if (res.status() !== 201) {
      throw new Error(`Failed to create order: ${res.status()} ${res.statusText()}`);
    }
    return await readJson<Order>(res);
  }

  async getOrder(id: string): Promise<Order> {
    const res = await this.request.get(`/api/orders/${id}`, {
      headers: this.getHeaders(),
    });

    if (res.status() !== 200) {
      throw new Error(`Failed to get order: ${res.status()} ${res.statusText()}`);
    }

    return await readJson<Order>(res);
  }

  async getOrderResponse(id: string): Promise<APIResponse> {
    return await this.request.get(`/api/orders/${id}`, { headers: this.getHeaders() });
  }

  async listOrders(query: OrdersQuery = {}): Promise<Order[]> {
    const params = new URLSearchParams();
    Object.entries(query).forEach(([key, value]) => params.set(key, String(value)));
    const res = await this.request.get(`/api/orders?${params.toString()}`, {
      headers: this.getHeaders(),
    });
    if (res.status() !== 200) {
      throw new Error(`Failed to list orders: ${res.status()} ${res.statusText()}`);
    }
    return await readJson<Order[]>(res);
  }

  async getOrderEvents(id: string): Promise<OrderEvent[]> {
    const res = await this.request.get(`/api/orders/${id}/events`, {
      headers: this.getHeaders(),
    });
    if (res.status() !== 200) {
      throw new Error(`Failed to get events for ${id}: ${res.status()} ${res.statusText()}`);
    }
    return await readJson<OrderEvent[]>(res);
  }

  async duplicateOrderResponse(id: string, options: RequestOptions = {}): Promise<APIResponse> {
    return await this.request.post(`/api/orders/${id}/duplicate`, {
      headers: this.getHeaders(),
      data: options.body,
    });
  }

  async duplicateOrder(id: string): Promise<Order> {
    const res = await this.duplicateOrderResponse(id);
    if (res.status() !== 201) {
      throw new Error(`Failed to duplicate order ${id}: ${res.status()} ${res.statusText()}`);
    }
    return await readJson<Order>(res);
  }

  async patchOrderResponse(id: string, changes: UpdateOrderRequest): Promise<APIResponse> {
    return await this.request.patch(`/api/orders/${id}`, {
      headers: this.getHeaders(),
      data: changes,
    });
  }

  async patchOrder(id: string, changes: UpdateOrderRequest): Promise<Order> {
    const res = await this.patchOrderResponse(id, changes);
    if (res.status() !== 200) {
      throw new Error(`Failed to patch order ${id}: ${res.status()} ${res.statusText()}`);
    }
    return await readJson<Order>(res);
  }

  async putOrder(id: string, order: CreateOrderRequest): Promise<Order> {
    const res = await this.request.put(`/api/orders/${id}`, {
      headers: this.getHeaders(),
      data: order,
    });
    if (res.status() !== 200) {
      throw new Error(`Failed to replace order ${id}: ${res.status()} ${res.statusText()}`);
    }
    return await readJson<Order>(res);
  }

  async deleteOrderResponse(id: string): Promise<APIResponse> {
    return await this.request.delete(`/api/orders/${id}`, { headers: this.getHeaders() });
  }

  async deleteOrder(id: string): Promise<void> {
    const res = await this.deleteOrderResponse(id);
    if (res.status() !== 204) {
      throw new Error(`Failed to delete order ${id}: ${res.status()} ${res.statusText()}`);
    }
  }

  async approveOrder(id: string): Promise<Order> {
    const res = await this.request.post(`/api/orders/${id}/approve`, {
      headers: this.getHeaders(),
    });
    if (res.status() !== 200) {
      throw new Error(`Failed to approve order ${id}: ${res.status()} ${res.statusText()}`);
    }
    return await readJson<Order>(res);
  }

  async rejectOrder(id: string, reason: string): Promise<Order> {
    const res = await this.request.post(`/api/orders/${id}/reject`, {
      headers: this.getHeaders(),
      data: { reason },
    });
    if (res.status() !== 200) {
      throw new Error(`Failed to reject order ${id}: ${res.status()} ${res.statusText()}`);
    }
    return await readJson<Order>(res);
  }
}
