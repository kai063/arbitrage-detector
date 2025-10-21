import { NextRequest, NextResponse } from 'next/server';
import { getBinanceRestClient } from '@/lib/binance/rest-client';
import { parseSymbol, createSymbolFilter } from '@/lib/binance/rate-converter';

export interface TradingPair {
  symbol: string;
  baseCurrency: string;
  quoteCurrency: string;
  bidPrice: number;
  askPrice: number;
  spread: number;
  spreadPercentage: number;
  volume24h?: number;
  isActive: boolean;
}

export interface PairsResponse {
  success: boolean;
  data?: {
    pairs: TradingPair[];
    totalPairs: number;
    liquidPairs: number;
    quoteCurrencies: string[];
    baseCurrencies: string[];
    filters: {
      quoteCurrency?: string;
      baseCurrency?: string;
      minVolume?: number;
      maxSpread?: number;
    };
  };
  error?: string;
  timestamp: string;
}

// GET endpoint for available trading pairs
export async function GET(request: NextRequest): Promise<NextResponse<PairsResponse>> {
  try {
    const { searchParams } = new URL(request.url);
    
    // Parse query parameters
    const quoteCurrency = searchParams.get('quote')?.toUpperCase();
    const baseCurrency = searchParams.get('base')?.toUpperCase();
    const minVolume = searchParams.get('minVolume') ? parseFloat(searchParams.get('minVolume')!) : 0;
    const maxSpread = searchParams.get('maxSpread') ? parseFloat(searchParams.get('maxSpread')!) : 5; // 5% default
    const includeInactive = searchParams.get('includeInactive') === 'true';

    console.log(`📊 /api/binance/pairs GET: Fetching all tickers`, { 
      filters: { quoteCurrency, baseCurrency, minVolume, maxSpread, includeInactive }
    });
    
    // Fetch tickers from Binance
    const restClient = getBinanceRestClient();
    const tickersResult = await restClient.fetchAllTickers();
    
    if (!tickersResult.success || !tickersResult.data) {
      return NextResponse.json(
        {
          success: false,
          error: `Failed to fetch Binance data: ${tickersResult.error}`,
          timestamp: new Date().toISOString()
        },
        { status: 500 }
      );
    }

    // Process tickers into trading pairs
    const tradingPairs: TradingPair[] = [];
    const quoteCurrencies = new Set<string>();
    const baseCurrencies = new Set<string>();
    
    for (const ticker of tickersResult.data) {
      try {
        const { baseCurrency: base, quoteCurrency: quote } = parseSymbol(ticker.symbol);
        
        if (!base || !quote) continue;

        const bidPrice = parseFloat(ticker.bidPrice);
        const askPrice = parseFloat(ticker.askPrice);
        
        // Skip invalid prices
        if (isNaN(bidPrice) || isNaN(askPrice) || bidPrice <= 0 || askPrice <= 0) {
          continue;
        }

        // Skip if ask <= bid (invalid spread)
        if (askPrice <= bidPrice) {
          continue;
        }

        const spread = askPrice - bidPrice;
        const spreadPercentage = (spread / bidPrice) * 100;
        
        // Apply filters
        if (quoteCurrency && quote !== quoteCurrency) continue;
        if (baseCurrency && base !== baseCurrency) continue;
        if (spreadPercentage > maxSpread) continue;

        const isActive = bidPrice > 0 && askPrice > 0 && spreadPercentage <= 10; // Active if spread <= 10%
        
        if (!includeInactive && !isActive) continue;

        const pair: TradingPair = {
          symbol: ticker.symbol,
          baseCurrency: base,
          quoteCurrency: quote,
          bidPrice,
          askPrice,
          spread,
          spreadPercentage,
          isActive
        };

        tradingPairs.push(pair);
        quoteCurrencies.add(quote);
        baseCurrencies.add(base);

      } catch {
        // Skip problematic tickers
        continue;
      }
    }

    // Sort by spread percentage (best spreads first)
    tradingPairs.sort((a, b) => a.spreadPercentage - b.spreadPercentage);

    // Filter for liquid pairs (common quote currencies)
    const liquidQuotes = ['USDT', 'BTC', 'ETH', 'BNB', 'USDC', 'BUSD'];
    const liquidPairs = tradingPairs.filter(pair => 
      liquidQuotes.includes(pair.quoteCurrency)
    );

    return NextResponse.json({
      success: true,
      data: {
        pairs: tradingPairs,
        totalPairs: tradingPairs.length,
        liquidPairs: liquidPairs.length,
        quoteCurrencies: Array.from(quoteCurrencies).sort(),
        baseCurrencies: Array.from(baseCurrencies).sort(),
        filters: {
          quoteCurrency,
          baseCurrency,
          minVolume,
          maxSpread
        }
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('GET /api/binance/pairs error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch trading pairs data',
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
}

// POST endpoint for filtered pairs query
export async function POST(request: NextRequest): Promise<NextResponse<PairsResponse>> {
  try {
    const body = await request.json();
    
    const {
      quoteCurrencies = ['USDT', 'BTC', 'ETH', 'BNB'],
      baseCurrencies = [],
      maxSpread = 2,
      minVolume = 0,
      limit = 100,
      sortBy = 'spread' // 'spread', 'volume', 'symbol'
    } = body;

    // Fetch tickers from Binance
    const restClient = getBinanceRestClient();
    
    // Create symbol filter based on criteria
    const symbolFilter = createSymbolFilter({
      quoteCurrencies,
      baseCurrencies: baseCurrencies.length > 0 ? baseCurrencies : undefined
    });

    const tickersResult = baseCurrencies.length > 0 || quoteCurrencies.length > 0 
      ? await restClient.fetchFilteredTickers((ticker) => symbolFilter(ticker.symbol))
      : await restClient.fetchFilteredTickers();
    
    if (!tickersResult.success || !tickersResult.data) {
      return NextResponse.json(
        {
          success: false,
          error: `Failed to fetch Binance data: ${tickersResult.error}`,
          timestamp: new Date().toISOString()
        },
        { status: 500 }
      );
    }

    // Process and filter tickers
    const tradingPairs: TradingPair[] = [];
    
    for (const ticker of tickersResult.data) {
      try {
        const { baseCurrency: base, quoteCurrency: quote } = parseSymbol(ticker.symbol);
        
        if (!base || !quote) continue;

        const bidPrice = parseFloat(ticker.bidPrice);
        const askPrice = parseFloat(ticker.askPrice);
        
        if (isNaN(bidPrice) || isNaN(askPrice) || bidPrice <= 0 || askPrice <= 0) {
          continue;
        }

        if (askPrice <= bidPrice) continue;

        const spread = askPrice - bidPrice;
        const spreadPercentage = (spread / bidPrice) * 100;
        
        // Apply spread filter
        if (spreadPercentage > maxSpread) continue;

        const pair: TradingPair = {
          symbol: ticker.symbol,
          baseCurrency: base,
          quoteCurrency: quote,
          bidPrice,
          askPrice,
          spread,
          spreadPercentage,
          isActive: spreadPercentage <= 5 // Active if spread <= 5%
        };

        tradingPairs.push(pair);

      } catch {
        continue;
      }
    }

    // Sort pairs
    switch (sortBy) {
      case 'spread':
        tradingPairs.sort((a, b) => a.spreadPercentage - b.spreadPercentage);
        break;
      case 'symbol':
        tradingPairs.sort((a, b) => a.symbol.localeCompare(b.symbol));
        break;
      default:
        tradingPairs.sort((a, b) => a.spreadPercentage - b.spreadPercentage);
    }

    // Apply limit
    const limitedPairs = tradingPairs.slice(0, limit);

    return NextResponse.json({
      success: true,
      data: {
        pairs: limitedPairs,
        totalPairs: limitedPairs.length,
        liquidPairs: limitedPairs.filter(p => ['USDT', 'BTC', 'ETH', 'BNB'].includes(p.quoteCurrency)).length,
        quoteCurrencies: [...new Set(limitedPairs.map(p => p.quoteCurrency))].sort(),
        baseCurrencies: [...new Set(limitedPairs.map(p => p.baseCurrency))].sort(),
        filters: {
          quoteCurrency: quoteCurrencies.join(','),
          baseCurrency: baseCurrencies.join(','),
          minVolume,
          maxSpread
        }
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('POST /api/binance/pairs error:', error);
    
    if (error instanceof SyntaxError) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid JSON format in request body',
          timestamp: new Date().toISOString()
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: 'Failed to process trading pairs query',
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
}

// Not allowed methods
export async function PUT(): Promise<NextResponse> {
  return NextResponse.json(
    {
      success: false,
      error: 'Method not allowed',
      timestamp: new Date().toISOString()
    },
    { status: 405 }
  );
}

export async function DELETE(): Promise<NextResponse> {
  return NextResponse.json(
    {
      success: false,
      error: 'Method not allowed',
      timestamp: new Date().toISOString()
    },
    { status: 405 }
  );
}