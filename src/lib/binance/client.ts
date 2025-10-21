import WebSocket from 'ws';
import { BinanceTicker, ExchangeRate, ConnectionState, ConnectionStatus, RealTimeExchangeRates } from '@/lib/types';

export class BinanceWebSocketClient {
  private ws: WebSocket | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private updateTimer: NodeJS.Timeout | null = null;
  private connectionStatus: ConnectionStatus = {
    state: ConnectionState.DISCONNECTED,
    reconnectAttempts: 0
  };

  private exchangeRates: Map<string, ExchangeRate> = new Map();
  private subscribers: Set<(rates: RealTimeExchangeRates) => void> = new Set();
  private readonly maxReconnectAttempts = 10;
  private readonly reconnectDelay = 5000; // 5 seconds
  private readonly updateInterval = 2000; // 2 seconds
  private readonly binanceWsUrl = process.env.NEXT_PUBLIC_WS_URL || 'wss://stream.binance.com:9443/ws/!ticker@arr';

  constructor() {
    this.startPeriodicUpdates();
  }

  public connect(): void {
    if (this.connectionStatus.state === ConnectionState.CONNECTING || 
        this.connectionStatus.state === ConnectionState.CONNECTED) {
      return;
    }

    this.connectionStatus.state = ConnectionState.CONNECTING;
    this.notifyStatusChange();

    try {
      this.ws = new WebSocket(this.binanceWsUrl);
      this.setupEventHandlers();
    } catch (error) {
      console.error('Failed to create WebSocket connection:', error);
      this.handleConnectionError(error);
    }
  }

  public disconnect(): void {
    this.connectionStatus.state = ConnectionState.DISCONNECTED;
    
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.updateTimer) {
      clearInterval(this.updateTimer);
      this.updateTimer = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.notifyStatusChange();
  }

  public subscribe(callback: (rates: RealTimeExchangeRates) => void): () => void {
    this.subscribers.add(callback);
    
    // Send current rates immediately if available
    if (this.exchangeRates.size > 0) {
      callback(this.getCurrentRates());
    }

    // Return unsubscribe function
    return () => {
      this.subscribers.delete(callback);
    };
  }

  public getCurrentRates(): RealTimeExchangeRates {
    return {
      rates: Array.from(this.exchangeRates.values()),
      lastUpdate: new Date(),
      source: 'binance',
      totalPairs: this.exchangeRates.size
    };
  }

  public getConnectionStatus(): ConnectionStatus {
    return { ...this.connectionStatus };
  }

  private setupEventHandlers(): void {
    if (!this.ws) return;

    this.ws.on('open', () => {
      console.log('Binance WebSocket connected');
      this.connectionStatus.state = ConnectionState.CONNECTED;
      this.connectionStatus.lastConnected = new Date();
      this.connectionStatus.reconnectAttempts = 0;
      this.connectionStatus.error = undefined;
      this.notifyStatusChange();
    });

    this.ws.on('message', (data: WebSocket.Data) => {
      try {
        const tickers: BinanceTicker[] = JSON.parse(data.toString());
        this.processTickers(tickers);
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    });

    this.ws.on('error', (error: Error) => {
      console.error('Binance WebSocket error:', error);
      this.handleConnectionError(error);
    });

    this.ws.on('close', (code: number, reason: Buffer) => {
      console.log(`Binance WebSocket closed: ${code} - ${reason.toString()}`);
      this.handleConnectionClose();
    });
  }

  private processTickers(tickers: BinanceTicker[]): void {
    const now = new Date();
    let updatedCount = 0;

    for (const ticker of tickers) {
      // Only process USDT pairs
      if (!ticker.s.endsWith('USDT')) continue;

      const baseCurrency = ticker.s.replace('USDT', '');
      const quoteCurrency = 'USDT';

      // Skip if no valid bid/ask prices
      const bidPrice = parseFloat(ticker.b);
      const askPrice = parseFloat(ticker.a);
      
      if (isNaN(bidPrice) || isNaN(askPrice) || bidPrice <= 0 || askPrice <= 0) {
        continue;
      }

      // Create exchange rate entry
      const exchangeRate: ExchangeRate = {
        from: baseCurrency,
        to: quoteCurrency,
        bid: bidPrice,
        ask: askPrice,
        timestamp: now
      };

      this.exchangeRates.set(ticker.s, exchangeRate);
      updatedCount++;

      // Also create reverse rate (USDT to base currency)
      const reverseRate: ExchangeRate = {
        from: quoteCurrency,
        to: baseCurrency,
        bid: 1 / askPrice, // Reverse of ask price
        ask: 1 / bidPrice, // Reverse of bid price
        timestamp: now
      };

      this.exchangeRates.set(`${quoteCurrency}${baseCurrency}`, reverseRate);
    }

    console.log(`Updated ${updatedCount} exchange rates from Binance`);
  }

  private startPeriodicUpdates(): void {
    this.updateTimer = setInterval(() => {
      if (this.exchangeRates.size > 0) {
        const rates = this.getCurrentRates();
        this.notifySubscribers(rates);
      }
    }, this.updateInterval);
  }

  private notifySubscribers(rates: RealTimeExchangeRates): void {
    this.subscribers.forEach(callback => {
      try {
        callback(rates);
      } catch (error) {
        console.error('Error notifying subscriber:', error);
      }
    });
  }

  private notifyStatusChange(): void {
    // Could emit status change events here if needed
    console.log(`Connection status changed: ${this.connectionStatus.state}`);
  }

  private handleConnectionError(error: any): void {
    this.connectionStatus.state = ConnectionState.ERROR;
    this.connectionStatus.error = error.message || 'Unknown error';
    this.notifyStatusChange();
    this.scheduleReconnect();
  }

  private handleConnectionClose(): void {
    if (this.connectionStatus.state !== ConnectionState.DISCONNECTED) {
      this.connectionStatus.state = ConnectionState.RECONNECTING;
      this.notifyStatusChange();
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.connectionStatus.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnect attempts reached');
      this.connectionStatus.state = ConnectionState.ERROR;
      this.connectionStatus.error = 'Max reconnect attempts reached';
      this.notifyStatusChange();
      return;
    }

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    const delay = this.reconnectDelay * Math.pow(2, this.connectionStatus.reconnectAttempts);
    console.log(`Scheduling reconnect in ${delay}ms (attempt ${this.connectionStatus.reconnectAttempts + 1})`);

    this.reconnectTimer = setTimeout(() => {
      this.connectionStatus.reconnectAttempts++;
      this.connect();
    }, delay);
  }

  // Convert to legacy format for backward compatibility
  public getLegacyRates(): Array<{ from: string; to: string; rate: number; timestamp: Date }> {
    const legacyRates: Array<{ from: string; to: string; rate: number; timestamp: Date }> = [];
    
    this.exchangeRates.forEach(rate => {
      // Use mid price (average of bid and ask) for legacy compatibility
      const midPrice = (rate.bid + rate.ask) / 2;
      legacyRates.push({
        from: rate.from,
        to: rate.to,
        rate: midPrice,
        timestamp: rate.timestamp
      });
    });

    return legacyRates;
  }
}

// Singleton instance
let binanceClient: BinanceWebSocketClient | null = null;

export function getBinanceClient(): BinanceWebSocketClient {
  if (!binanceClient) {
    binanceClient = new BinanceWebSocketClient();
  }
  return binanceClient;
}

export function startBinanceStream(): void {
  const client = getBinanceClient();
  client.connect();
}

export function stopBinanceStream(): void {
  if (binanceClient) {
    binanceClient.disconnect();
  }
}