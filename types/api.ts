/** What readJson needs from a response: both an API response and a page response fit. */
export interface JsonResponse {
  url(): string;
  status(): number;
  json(): Promise<unknown>;
}

export interface OrdersQuery {
  page?: number;
  pageSize?: number;
}

export interface RequestOptions {
  /** An object is sent as JSON; a string is sent exactly as given (for malformed-body cases). */
  body?: unknown;
}
