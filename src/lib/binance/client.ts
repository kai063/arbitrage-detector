import WebSocket from 'ws';
import { ExchangeRate, ConnectionState, ConnectionStatus, RealTimeExchangeRates } from '@/lib/types';

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
  private readonly binanceWsUrl = 'wss://stream.binance.com:9443/stream';
  private pendingUpdates: Map<string, ExchangeRate> = new Map();
  private batchTimer: NodeJS.Timeout | null = null;
  private readonly batchInterval = 1000; // 1 second

  constructor() {
    this.startBatchProcessor();
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
      this.handleConnectionError(error as Error);
    }
  }

  public disconnect(): void {
    this.connectionStatus.state = ConnectionState.DISCONNECTED;
    
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.batchTimer) {
      clearInterval(this.batchTimer);
      this.batchTimer = null;
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
      
      // Subscribe to bookTicker stream for all symbols
      const subscribeMessage = {
        method: 'SUBSCRIBE',
        params: ['!bookTicker'],
        id: 1
      };
      
      this.ws?.send(JSON.stringify(subscribeMessage));
      console.log('Subscribed to !bookTicker stream');
    });

    this.ws.on('message', (data: WebSocket.Data) => {
      try {
        const message = JSON.parse(data.toString());
        
        // Handle subscription response
        if (message.result === null && message.id === 1) {
          console.log('Successfully subscribed to bookTicker stream');
          return;
        }
        
        // Handle book ticker data
        if (message.stream === '!bookTicker') {
          this.processBookTicker(message.data);
        }
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

  private processBookTicker(ticker: { s: string; b: string; a: string }): void {
    // Only process USDT pairs
    if (!ticker.s.endsWith('USDT')) return;

    const symbol = ticker.s;
    const baseCurrency = symbol.replace('USDT', '');
    const quoteCurrency = 'USDT';

    // Skip if no valid bid/ask prices
    const bidPrice = parseFloat(ticker.b);
    const askPrice = parseFloat(ticker.a);
    
    if (isNaN(bidPrice) || isNaN(askPrice) || bidPrice <= 0 || askPrice <= 0) {
      return;
    }

    const now = new Date();

    // Create exchange rate entry and add to pending updates
    const exchangeRate: ExchangeRate = {
      from: baseCurrency,
      to: quoteCurrency,
      bid: bidPrice,
      ask: askPrice,
      timestamp: now
    };

    this.pendingUpdates.set(symbol, exchangeRate);

    // Also create reverse rate (USDT to base currency)
    const reverseRate: ExchangeRate = {
      from: quoteCurrency,
      to: baseCurrency,
      bid: 1 / askPrice, // Reverse of ask price
      ask: 1 / bidPrice, // Reverse of bid price
      timestamp: now
    };

    this.pendingUpdates.set(`${quoteCurrency}${baseCurrency}`, reverseRate);
  }

  private startBatchProcessor(): void {
    this.batchTimer = setInterval(() => {
      this.processBatchUpdates();
    }, this.batchInterval);
  }

  private processBatchUpdates(): void {
    if (this.pendingUpdates.size === 0) return;

    let updatedCount = 0;
    
    // Apply all pending updates to main exchange rates map
    this.pendingUpdates.forEach((rate, symbol) => {
      this.exchangeRates.set(symbol, rate);
      updatedCount++;
    });

    // Clear pending updates
    this.pendingUpdates.clear();

    if (updatedCount > 0) {
      console.log(`Batch update: ${updatedCount} exchange rates updated`);
      
      // Notify subscribers with updated rates
      const rates = this.getCurrentRates();
      this.notifySubscribers(rates);
    }
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

  private handleConnectionError(error: Error): void {
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

  // Convert to legacy format for arbitrage detection
  public getLegacyRates(): Array<{ from: string; to: string; rate: number; timestamp: Date }> {
    const legacyRates: Array<{ from: string; to: string; rate: number; timestamp: Date }> = [];

    this.exchangeRates.forEach(rate => {
      // CRITICAL: Use ask price for arbitrage detection
      // When converting A→B, we use ask price (buying B at market ask)
      // This ensures consistency with the arbitrage algorithm that expects ask prices
      const rateForArbitrage = rate.ask;
      legacyRates.push({
        from: rate.from,
        to: rate.to,
        rate: rateForArbitrage,
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