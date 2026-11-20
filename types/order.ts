export type OrderStatus = 'Pending Approval' | 'Approved' | 'Rejected';
export type ExecutionStatus = 'Working' | 'Partially Filled' | 'Filled';
export type OrderSide = 'Buy' | 'Sell';
export type TimeInForce = 'Day' | 'GTD' | 'GTC';
export type Role = 'trader' | 'approver';
export type Symbol = 'ACME' | 'BLUE' | 'CRSP' | 'DLTA' | 'ECHO';

export interface UserInfo {
  username: string;
  role: Role;
  displayName: string;
}
export interface LoginResponse {
  token: string;
  user: UserInfo;
}

export interface CreateOrderRequest {
  symbol: Symbol;
  side: OrderSide;
  quantity: number;
  limitPrice: number;
  clientOrderId?: string | null;
  timeInForce?: TimeInForce;
  goodTillDate?: string | null;
  urgent?: boolean;
  notes?: string;
}

export type UpdateOrderRequest = Partial<
  Pick<CreateOrderRequest, 'side' | 'quantity' | 'limitPrice' | 'clientOrderId'>
>;

export interface Order extends Omit<CreateOrderRequest, 'notes'> {
  id: string;
  clientOrderId: string | null;
  status: OrderStatus;
  createdBy: string;
  createdAt: string;
  decidedBy: string | null;
  decidedAt: string | null;
  updatedAt: string | null;
  executionStatus: ExecutionStatus | null;
  filledAt: string | null;
  rejectionReason: string | null;
  timeInForce: TimeInForce;
  goodTillDate: string | null;
  urgent: boolean;
  notes: string | null;
}

export interface Quote {
  symbol: Symbol;
  last: number;
  bid: number;
  ask: number;
  asOf: string;
}

export interface Watchlist {
  symbols: Symbol[];
}

export interface ResetResponse {
  ok: boolean;
  orders: Order[];
}

export interface TestConfig {
  latencyMs: number;
  fillDelayMs: number;
}

export type UserKey = 'trader1' | 'trader2' | 'approver1';

export interface ErrorResponse {
  error: string;
}

export interface ValidationErrorResponse extends ErrorResponse {
  details: Record<string, string>;
}

export type OrderEventAction =
  | 'created'
  | 'edited'
  | 'approved'
  | 'rejected'
  | 'execution'
  | 'cancelled';

export interface OrderEvent {
  orderId: string;
  at: string;
  actor: string;
  action: OrderEventAction;
  details: Record<string, unknown>;
}
