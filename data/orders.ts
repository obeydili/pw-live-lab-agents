import { randomUUID } from 'node:crypto';
import type { CreateOrderRequest } from '../types/order';

export type SourceProfile = 'default' | 'full' | 'gtc';

export function uniqueClientOrderId(prefix = 'TEST'): string {
  return `${prefix}-${randomUUID().slice(0, 8)}`;
}

/** A calendar date (YYYY-MM-DD, UTC) the given number of days from today. */
export function utcDate(daysFromToday: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + daysFromToday);
  return date.toISOString().slice(0, 10);
}

/** ACME / Buy / 10 @ 12.50 with a unique clientOrderId, plus optional overrides. */
export function buildOrder(overrides: Partial<CreateOrderRequest> = {}): CreateOrderRequest {
  return {
    symbol: 'ACME',
    side: 'Buy',
    quantity: 10,
    limitPrice: 12.5,
    clientOrderId: uniqueClientOrderId(),
    ...overrides,
  };
}

/**
 * default: ticket fields omitted (server defaults apply).
 * full: Sell, GTD with a future date, urgent, unique note.
 * gtc: GTC with no date, not urgent, empty note.
 */
export function buildSourceOrder(profile: SourceProfile): CreateOrderRequest {
  switch (profile) {
    case 'default':
      return buildOrder();
    case 'full':
      return buildOrder({
        side: 'Sell',
        timeInForce: 'GTD',
        goodTillDate: utcDate(30),
        urgent: true,
        notes: `DEV-02 note ${randomUUID().slice(0, 8)}`,
      });
    case 'gtc':
      return buildOrder({ timeInForce: 'GTC', urgent: false, notes: '' });
  }
}
