import type { APIRequestContext, PlaywrightWorkerArgs } from '@playwright/test';
import { ApiClient } from './api-client';
import { credentials } from './env';
import type { UserKey } from '../types/order';

/** Hands out ApiClients that each own a private request context (so cookies never leak between roles). */
export class ApiClientPool {
  private readonly contexts: APIRequestContext[] = [];

  constructor(
    private readonly playwright: PlaywrightWorkerArgs['playwright'],
    private readonly defaultBaseURL: string,
  ) {}

  private async newContext(baseURL: string): Promise<APIRequestContext> {
    const context = await this.playwright.request.newContext({ baseURL });
    this.contexts.push(context);
    return context;
  }

  async signedIn(user: UserKey, baseURL: string = this.defaultBaseURL): Promise<ApiClient> {
    const client = new ApiClient(await this.newContext(baseURL));
    const { username, password } = credentials[user];
    await client.login(username, password);
    return client;
  }

  async anonymous(baseURL: string = this.defaultBaseURL): Promise<ApiClient> {
    return new ApiClient(await this.newContext(baseURL));
  }

  async withToken(token: string, baseURL: string = this.defaultBaseURL): Promise<ApiClient> {
    return ApiClient.withToken(await this.newContext(baseURL), token);
  }

  async dispose(): Promise<void> {
    await Promise.all(this.contexts.map((context) => context.dispose()));
  }
}
