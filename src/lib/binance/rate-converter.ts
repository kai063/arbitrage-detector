import { BinanceBookTicker } from './rest-client';
import { ExchangeRate, LegacyExchangeRate } from '@/lib/types';

export interface ConversionResult {
  exchangeRates: ExchangeRate[];
  legacyRates: LegacyExchangeRate[];
  totalPairs: number;
  processedSymbols: string[];
  skippedSymbols: string[];
}

export interface ConversionOptions {
  includeReverse?: boolean;
  filterSymbols?: (symbol: string) => boolean;
  minBidPrice?: number;
  maxSpread?: number; // Maximum spread percentage (ask-bid)/bid * 100
}

/**
 * Converts Binance book ticker data to ExchangeRate format for arbitrage detection
 */
export function convertToGraph(
  binanceTickers: BinanceBookTicker[], 
  options: ConversionOptions = {}
): ConversionResult {
  const {
    includeReverse = true,
    filterSymbols = (symbol) => symbol.endsWith('USDT'),
    minBidPrice = 0.00000001,
    maxSpread = 10 // 10% max spread
  } = options;

  const exchangeRates: ExchangeRate[] = [];
  const legacyRates: LegacyExchangeRate[] = [];
  const processedSymbols: string[] = [];
  const skippedSymbols: string[] = [];
  const timestamp = new Date();

  for (const ticker of binanceTickers) {
    try {
      // Apply symbol filter
      if (!filterSymbols(ticker.symbol)) {
        continue;
      }

      // Parse prices
      const bidPrice = parseFloat(ticker.bidPrice);
      const askPrice = parseFloat(ticker.askPrice);

      // Validation checks
      if (isNaN(bidPrice) || isNaN(askPrice)) {
        skippedSymbols.push(`${ticker.symbol} (invalid prices)`);
        continue;
      }

      if (bidPrice <= 0 || askPrice <= 0) {
        skippedSymbols.push(`${ticker.symbol} (zero prices)`);
        continue;
      }

      if (bidPrice < minBidPrice) {
        skippedSymbols.push(`${ticker.symbol} (price too low)`);
        continue;
      }

      if (askPrice <= bidPrice) {
        skippedSymbols.push(`${ticker.symbol} (invalid spread)`);
        continue;
      }

      // Check spread
      const spreadPercentage = ((askPrice - bidPrice) / bidPrice) * 100;
      if (spreadPercentage > maxSpread) {
        skippedSymbols.push(`${ticker.symbol} (spread too wide: ${spreadPercentage.toFixed(2)}%)`);
        continue;
      }

      // Parse symbol to get base and quote currencies
      const { baseCurrency, quoteCurrency } = parseSymbol(ticker.symbol);
      
      if (!baseCurrency || !quoteCurrency) {
        skippedSymbols.push(`${ticker.symbol} (unable to parse)`);
        continue;
      }

      // Create primary exchange rate (base → quote)
      const primaryRate: ExchangeRate = {
        from: baseCurrency,
        to: quoteCurrency,
        bid: bidPrice,
        ask: askPrice,
        timestamp
      };

      exchangeRates.push(primaryRate);

      // Create legacy rate using mid price
      const midPrice = (bidPrice + askPrice) / 2;
      legacyRates.push({
        from: baseCurrency,
        to: quoteCurrency,
        rate: midPrice,
        timestamp
      });

      // Create reverse exchange rate (quote → base) if enabled
      if (includeReverse) {
        const reverseBid = 1 / askPrice; // Reverse of ask price
        const reverseAsk = 1 / bidPrice; // Reverse of bid price

        const reverseRate: ExchangeRate = {
          from: quoteCurrency,
          to: baseCurrency,
          bid: reverseBid,
          ask: reverseAsk,
          timestamp
        };

        exchangeRates.push(reverseRate);

        // Create reverse legacy rate
        const reverseMidPrice = 1 / midPrice;
        legacyRates.push({
          from: quoteCurrency,
          to: baseCurrency,
          rate: reverseMidPrice,
          timestamp
        });
      }

      processedSymbols.push(ticker.symbol);

    } catch (error) {
      skippedSymbols.push(`${ticker.symbol} (conversion error: ${error instanceof Error ? error.message : 'unknown'})`);
    }
  }

  console.log(`Conversion completed: ${processedSymbols.length} symbols processed, ${skippedSymbols.length} skipped`);
  console.log(`Generated ${exchangeRates.length} exchange rates, ${legacyRates.length} legacy rates`);

  return {
    exchangeRates,
    legacyRates,
    totalPairs: processedSymbols.length,
    processedSymbols,
    skippedSymbols
  };
}

/**
 * Parse Binance symbol into base and quote currencies
 * Examples: BTCUSDT → { baseCurrency: 'BTC', quoteCurrency: 'USDT' }
 *          ETHBUSD → { baseCurrency: 'ETH', quoteCurrency: 'BUSD' }
 */
export function parseSymbol(symbol: string): { baseCurrency: string; quoteCurrency: string } {
  // Common quote currencies (ordered by priority for matching)
  const quoteCurrencies = [
    'USDT', 'USDC', 'BUSD', 'DAI', 'TUSD', 'USDP', // Stablecoins
    'BTC', 'ETH', 'BNB', // Major cryptos
    'EUR', 'GBP', 'AUD', 'RUB', 'TRY', 'UAH', 'BIDR', 'IDRT', 'NGN', 'PLN', // Fiat
    'FDUSD' // Additional stablecoins
  ];

  // Find the quote currency by checking suffixes
  for (const quote of quoteCurrencies) {
    if (symbol.endsWith(quote)) {
      const base = symbol.slice(0, -quote.length);
      if (base.length > 0) {
        return {
          baseCurrency: base,
          quoteCurrency: quote
        };
      }
    }
  }

  // Fallback: assume last 3-4 characters are quote currency
  // This handles cases like some newer tokens
  if (symbol.length >= 6) {
    // Try 4-character quote first (like USDT)
    if (symbol.length >= 7) {
      const base4 = symbol.slice(0, -4);
      const quote4 = symbol.slice(-4);
      
      // Check if quote looks like a known pattern
      if (quote4.includes('USD') || quote4.includes('BTC') || quote4.includes('ETH')) {
        return {
          baseCurrency: base4,
          quoteCurrency: quote4
        };
      }
    }

    // Try 3-character quote (like BTC, ETH)
    const base3 = symbol.slice(0, -3);
    const quote3 = symbol.slice(-3);
    
    return {
      baseCurrency: base3,
      quoteCurrency: quote3
    };
  }

  // Unable to parse
  console.warn(`Unable to parse symbol: ${symbol}`);
  return {
    baseCurrency: '',
    quoteCurrency: ''
  };
}

/**
 * Filter tickers for specific trading pairs
 */
export function createSymbolFilter(options: {
  includePairs?: string[];
  excludePairs?: string[];
  quoteCurrencies?: string[];
  baseCurrencies?: string[];
  minVolumeUSDT?: number;
}): (symbol: string) => boolean {
  const {
    includePairs = [],
    excludePairs = [],
    quoteCurrencies = ['USDT'],
    baseCurrencies = [],
  } = options;

  return (symbol: string): boolean => {
    // Check include list first (if specified)
    if (includePairs.length > 0) {
      return includePairs.includes(symbol);
    }

    // Check exclude list
    if (excludePairs.includes(symbol)) {
      return false;
    }

    // Check quote currencies
    if (quoteCurrencies.length > 0) {
      const hasValidQuote = quoteCurrencies.some(quote => symbol.endsWith(quote));
      if (!hasValidQuote) {
        return false;
      }
    }

    // Check base currencies
    if (baseCurrencies.length > 0) {
      const { baseCurrency } = parseSymbol(symbol);
      if (!baseCurrencies.includes(baseCurrency)) {
        return false;
      }
    }

    return true;
  };
}

/**
 * Get conversion statistics
 */
export function getConversionStats(result: ConversionResult): {
  successRate: number;
  totalSymbols: number;
  averageSpread: number;
  currencyDistribution: Record<string, number>;
} {
  const totalSymbols = result.processedSymbols.length + result.skippedSymbols.length;
  const successRate = totalSymbols > 0 ? (result.processedSymbols.length / totalSymbols) * 100 : 0;

  // Calculate average spread
  const spreads = result.exchangeRates
    .filter((_, index) => index % 2 === 0) // Only primary rates (not reverse)
    .map(rate => ((rate.ask - rate.bid) / rate.bid) * 100);
  
  const averageSpread = spreads.length > 0 
    ? spreads.reduce((sum, spread) => sum + spread, 0) / spreads.length 
    : 0;

  // Currency distribution
  const currencyDistribution: Record<string, number> = {};
  result.exchangeRates.forEach(rate => {
    currencyDistribution[rate.from] = (currencyDistribution[rate.from] || 0) + 1;
    currencyDistribution[rate.to] = (currencyDistribution[rate.to] || 0) + 1;
  });

  return {
    successRate,
    totalSymbols,
    averageSpread,
    currencyDistribution
  };
}