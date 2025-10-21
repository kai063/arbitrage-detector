export interface BinanceBookTicker {
  symbol: string;
  bidPrice: string;
  bidQty: string;
  askPrice: string;
  askQty: string;
}

export interface FetchTickersResult {
  success: boolean;
  data?: BinanceBookTicker[];
  error?: string;
  cached?: boolean;
  timestamp: Date;
}

export class BinanceRestClient {
  private cache: {
    data: BinanceBookTicker[] | null;
    timestamp: number;
    ttl: number;
  } = {
    data: null,
    timestamp: 0,
    ttl: 1000 // 1 second cache
  };

  private readonly baseUrl = 'https://api.binance.com';
  private readonly maxRetries = 3;
  private readonly retryDelay = 1000; // 1 second

  public async fetchAllTickers(): Promise<FetchTickersResult> {
    const now = Date.now();
    
    // Check cache first
    if (this.cache.data && (now - this.cache.timestamp) < this.cache.ttl) {
      console.log(`💾 Binance REST API: Using cached data`, {
        totalTickers: this.cache.data.length,
        age: now - this.cache.timestamp,
        ttl: this.cache.ttl
      });
      return {
        success: true,
        data: this.cache.data,
        cached: true,
        timestamp: new Date(this.cache.timestamp)
      };
    }

    // Fetch fresh data with retry logic
    let lastError: string = '';
    
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const response = await fetch(`${this.baseUrl}/api/v3/ticker/bookTicker`, {
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'arbitrage-detector/1.0'
          },
          signal: AbortSignal.timeout(5000) // 5 second timeout
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data: BinanceBookTicker[] = await response.json();
        
        // Validate data structure
        if (!Array.isArray(data) || data.length === 0) {
          throw new Error('Invalid response format from Binance API');
        }

        // Validate first ticker structure
        const firstTicker = data[0];
        if (!firstTicker.symbol || !firstTicker.bidPrice || !firstTicker.askPrice) {
          throw new Error('Invalid ticker data structure');
        }

        // Update cache
        this.cache = {
          data,
          timestamp: now,
          ttl: this.cache.ttl
        };

        console.log(`🚀 Binance REST API: Fetched ${data.length} tickers (attempt ${attempt}/${this.maxRetries})`, {
          totalTickers: data.length,
          sampleTicker: data[0],
          cached: false,
          timestamp: new Date().toISOString()
        });

        return {
          success: true,
          data,
          cached: false,
          timestamp: new Date(now)
        };

      } catch (error) {
        lastError = error instanceof Error ? error.message : 'Unknown error';
        
        console.warn(`Binance API fetch attempt ${attempt}/${this.maxRetries} failed:`, lastError);

        // Wait before retry (except on last attempt)
        if (attempt < this.maxRetries) {
          await this.sleep(this.retryDelay * attempt); // Exponential backoff
        }
      }
    }

    return {
      success: false,
      error: `Failed to fetch tickers after ${this.maxRetries} attempts. Last error: ${lastError}`,
      timestamp: new Date()
    };
  }

  public clearCache(): void {
    this.cache = {
      data: null,
      timestamp: 0,
      ttl: this.cache.ttl
    };
  }

  public getCacheInfo(): { cached: boolean; age: number; ttl: number } {
    const now = Date.now();
    const age = now - this.cache.timestamp;
    
    return {
      cached: this.cache.data !== null && age < this.cache.ttl,
      age,
      ttl: this.cache.ttl
    };
  }

  public updateCacheTTL(ttlMs: number): void {
    this.cache.ttl = ttlMs;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Get filtered tickers (only USDT pairs by default)
  public async fetchFilteredTickers(filter?: (ticker: BinanceBookTicker) => boolean): Promise<FetchTickersResult> {
    const result = await this.fetchAllTickers();
    
    if (!result.success || !result.data) {
      return result;
    }

    const defaultFilter = (ticker: BinanceBookTicker) => ticker.symbol.endsWith('USDT');
    const filterFn = filter || defaultFilter;
    
    const filteredData = result.data.filter(filterFn);

    return {
      ...result,
      data: filteredData
    };
  }

  // Health check
  public async healthCheck(): Promise<{ healthy: boolean; latency?: number; error?: string }> {
    const start = Date.now();
    
    try {
      const response = await fetch(`${this.baseUrl}/api/v3/ping`, {
        signal: AbortSignal.timeout(3000)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const latency = Date.now() - start;
      
      return {
        healthy: true,
        latency
      };
    } catch (error) {
      return {
        healthy: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
}

// Singleton instance
let restClient: BinanceRestClient | null = null;

export function getBinanceRestClient(): BinanceRestClient {
  if (!restClient) {
    restClient = new BinanceRestClient();
  }
  return restClient;
}