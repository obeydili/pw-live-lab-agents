import { APIRequestContext, APIResponse } from '@playwright/test';
import { readJson } from './readJson';
import type { LoginResponse, UserInfo, CreateOrderRequest, Order } from '../types/order';

export class ApiClient {
  private token: string | null = null;

  constructor(private readonly request: APIRequestContext) {}

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

  private getHeaders() {
    return {
      Authorization: `Bearer ${this.token}`,
      'Content-Type': 'application/json',
    };
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
      throw new Error(`Failed to get order: ${res.status()} ${res.statusText()}`);
    }
    return await readJson<UserInfo>(res);
  }

  async createOrder(order: CreateOrderRequest): Promise<Order> {
    const res = await this.request.post('/api/orders', {
      headers: this.getHeaders(),
      data: order,
    });
    if (!res.ok()) {
      throw new Error(`Failed to create order: ${res.status()} ${res.statusText()}`);
    }
    return await readJson<Order>(res);
  }

  async getOrder(id: string): Promise<Order> {
    const res = await this.request.get(`/api/orders/${id}`, {
      headers: this.getHeaders(),
    });

    if (!res.ok()) {
      throw new Error(`Failed to get order: ${res.status()} ${res.statusText()}`);
    }

    return await readJson<Order>(res);
  }
}
