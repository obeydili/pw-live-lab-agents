import type { Page } from '@playwright/test';
import type { JsonResponse } from '../../types/api';

export const DUPLICATE_URL = /\/api\/orders\/ORD-\d+\/duplicate$/;

export interface DuplicateCapture {
  /** The first duplicate response, with its body already read (the page navigates away right after it). */
  readonly response: Promise<JsonResponse>;
  /** How many duplicate requests the browser sent. */
  requestCount(): number;
}

/**
 * Passes duplicate requests through to the real API, optionally holding each one until `gate` resolves,
 * and records the response before the page can navigate away from it.
 */
export async function captureDuplicate(page: Page, gate: Promise<void> = Promise.resolve()): Promise<DuplicateCapture> {
  let requests = 0;
  let capture: (response: JsonResponse) => void = () => {};
  const response = new Promise<JsonResponse>((resolve) => {
    capture = resolve;
  });
  await page.route(DUPLICATE_URL, async (route) => {
    requests += 1;
    await gate;
    const real = await route.fetch();
    const body: unknown = await real.json();
    capture({ url: () => real.url(), status: () => real.status(), json: async () => body });
    await route.fulfill({ response: real });
  });
  return { response, requestCount: () => requests };
}
