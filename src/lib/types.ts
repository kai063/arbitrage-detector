export interface ExchangeRate {
  from: string;
  to: string;
  bid: number;
  ask: number;
  timestamp: Date;
}

export interface LegacyExchangeRate {
  from: string;
  to: string;
  rate: number;
  timestamp: Date;
}

export interface ArbitrageCycle {
  currencies: string[];
  profit: number;
  profitPercentage: number;
  rates: { from: string; to: string; rate: number }[];
  totalVolume: number;
}

export interface ArbitrageResult {
  cycles: ArbitrageCycle[];
  totalOpportunities: number;
  bestOpportunity: ArbitrageCycle | null;
  timestamp: Date;
  type: 'manual' | 'realtime';
}

export interface BinanceTicker {
  e: string;          // Event type
  E: number;          // Event time
  s: string;          // Symbol
  c: string;          // Close price
  o: string;          // Open price
  h: string;          // High price
  l: string;          // Low price
  v: string;          // Total traded base asset volume
  q: string;          // Total traded quote asset volume
  O: number;          // Statistics open time
  C: number;          // Statistics close time
  F: number;          // First trade ID
  L: number;          // Last trade ID
  n: number;          // Total number of trades
  x: string;          // Previous day's close price
  w: string;          // Weighted average price
  b: string;          // Best bid price
  B: string;          // Best bid quantity
  a: string;          // Best ask price
  A: string;          // Best ask quantity
  P: string;          // Price change
  p: string;          // Price change percent
}

export interface BinanceTickerArray {
  data: BinanceTicker[];
  timestamp: number;
}

export interface RealTimeExchangeRates {
  rates: ExchangeRate[];
  lastUpdate: Date;
  source: 'binance';
  totalPairs: number;
}

export interface ArbitrageStream {
  arbitrageResult: ArbitrageResult | null;
  exchangeRates: ExchangeRate[];
  lastUpdate: Date;
  isConnected: boolean;
  error?: string;
}

export interface StreamMessage {
  type: 'rates' | 'arbitrage' | 'error' | 'status';
  data: any;
  timestamp: string;
}

// Utility types for API responses
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  errors?: string[];
  timestamp: string;
}

export interface ArbitrageApiRequest {
  exchangeRates: {
    from: string;
    to: string;
    rate: number;
    timestamp?: string;
  }[];
}

// WebSocket connection states
export enum ConnectionState {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  RECONNECTING = 'reconnecting',
  ERROR = 'error'
}

export interface ConnectionStatus {
  state: ConnectionState;
  lastConnected?: Date;
  reconnectAttempts: number;
  error?: string;
}