import { NextRequest, NextResponse } from 'next/server';
import { ExchangeRate as LegacyExchangeRate, ArbitrageResult, detectCurrencyArbitrage, validateExchangeRates } from '@/lib/algorithms/arbitrage';
import { getBinanceClient, startBinanceStream } from '@/lib/binance/client';
import { getBinanceRestClient } from '@/lib/binance/rest-client';
import { convertToGraph, createSymbolFilter } from '@/lib/binance/rate-converter';
import { StreamMessage } from '@/lib/types';

export interface ArbitrageRequest {
  exchangeRates: {
    from: string;
    to: string;
    rate: number;
    timestamp?: string;
  }[];
  settings?: {
    maxIterations?: number;
    minProfitThreshold?: number;
    maxPathLength?: number;
    selectedCurrencies?: string[];
    useRealTimeData?: boolean;
  };
}

export interface ArbitrageResponse {
  success: boolean;
  data?: ArbitrageResult;
  error?: string;
  errors?: string[];
  timestamp: string;
}

export async function POST(request: NextRequest): Promise<NextResponse<ArbitrageResponse>> {
  const startTime = Date.now();
  
  try {
    let body: ArbitrageRequest;
    
    try {
      const requestText = await request.text();
      body = requestText.trim() ? JSON.parse(requestText) : { exchangeRates: [] };
    } catch {
      // If body is empty or invalid JSON, use Binance data automatically
      body = { exchangeRates: [] };
    }
    
    // Extract settings with defaults
    const settings = {
      maxIterations: body.settings?.maxIterations || 10,
      minProfitThreshold: body.settings?.minProfitThreshold || 0.005, // 0.5%
      maxPathLength: body.settings?.maxPathLength || 4,
      selectedCurrencies: body.settings?.selectedCurrencies || [],
      useRealTimeData: body.settings?.useRealTimeData || false
    };
    
    console.log('🔧 API Settings received:', {
      requestSettings: body.settings,
      finalSettings: settings,
      exchangeRatesLength: body.exchangeRates?.length || 0
    });

    // If using real-time data or empty request body, get from Binance REST API
    if (settings.useRealTimeData || body.exchangeRates.length === 0) {
      const restClient = getBinanceRestClient();
      const tickersResult = await restClient.fetchFilteredTickers();
      
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

      // Convert Binance tickers to exchange rates
      const conversionResult = convertToGraph(tickersResult.data, {
        includeReverse: true,
        filterSymbols: createSymbolFilter({ quoteCurrencies: ['USDT'] }),
        maxSpread: 2 // 2% max spread for arbitrage
      });
      
      if (conversionResult.legacyRates.length < 3) {
        return NextResponse.json(
          {
            success: false,
            error: 'Insufficient valid trading pairs available from Binance.',
            timestamp: new Date().toISOString()
          },
          { status: 400 }
        );
      }

      // Filter rates based on selected currencies if specified
      let filteredRates = conversionResult.legacyRates;
      if (settings.selectedCurrencies.length > 0) {
        filteredRates = conversionResult.legacyRates.filter(rate => 
          settings.selectedCurrencies.includes(rate.from) && 
          settings.selectedCurrencies.includes(rate.to)
        );
      }

      // Detect arbitrage with Binance data
      console.log('🔍 Starting arbitrage detection with Binance data:', {
        totalRates: filteredRates.length,
        settings: settings,
        sampleRates: filteredRates.slice(0, 5)
      });
      
      const arbitrageResult = detectCurrencyArbitrage(filteredRates, settings);
      const executionTime = Date.now() - startTime;
      
      console.log('✅ Arbitrage detection completed:', {
        executionTime: `${executionTime}ms`,
        cyclesFound: arbitrageResult.cycles.length,
        totalOpportunities: arbitrageResult.totalOpportunities,
        bestProfit: arbitrageResult.bestOpportunity?.profitPercentage
      });
      
      return NextResponse.json(
        {
          success: true,
          data: { 
            ...arbitrageResult, 
            type: settings.useRealTimeData ? 'realtime' : 'binance',
            executionTime,
            dataSource: {
              totalPairs: conversionResult.totalPairs,
              processedSymbols: conversionResult.processedSymbols.length,
              skippedSymbols: conversionResult.skippedSymbols.length,
              cached: tickersResult.cached || false
            }
          },
          timestamp: new Date().toISOString()
        },
        { status: 200 }
      );
    }
    
    // Validate request body structure for manual input
    if (!body || !body.exchangeRates || !Array.isArray(body.exchangeRates)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid request format. Expected { exchangeRates: Array }',
          timestamp: new Date().toISOString()
        },
        { status: 400 }
      );
    }

    // Check minimum number of exchange rates
    if (body.exchangeRates.length < 3) {
      return NextResponse.json(
        {
          success: false,
          error: 'Minimum 3 exchange rates required for arbitrage detection',
          timestamp: new Date().toISOString()
        },
        { status: 400 }
      );
    }

    // Convert request data to ExchangeRate format
    const exchangeRates: LegacyExchangeRate[] = body.exchangeRates.map((rate, index) => {
      // Validate individual rate fields
      if (!rate.from || !rate.to || typeof rate.rate !== 'number') {
        throw new Error(`Invalid exchange rate at index ${index}: missing required fields`);
      }

      if (rate.rate <= 0) {
        throw new Error(`Invalid exchange rate at index ${index}: rate must be positive`);
      }

      if (rate.from.trim() === rate.to.trim()) {
        throw new Error(`Invalid exchange rate at index ${index}: source and target currencies cannot be the same`);
      }

      return {
        from: rate.from.trim().toUpperCase(),
        to: rate.to.trim().toUpperCase(),
        rate: rate.rate,
        timestamp: rate.timestamp ? new Date(rate.timestamp) : new Date()
      };
    });

    // Validate exchange rates using the utility function
    const validationErrors = validateExchangeRates(exchangeRates);
    if (validationErrors.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'Validation failed',
          errors: validationErrors,
          timestamp: new Date().toISOString()
        },
        { status: 400 }
      );
    }

    // Detect arbitrage using Bellman-Ford algorithm with settings
    console.log('🔍 Starting arbitrage detection with manual data:', {
      totalRates: exchangeRates.length,
      settings: settings,
      sampleRates: exchangeRates.slice(0, 5)
    });
    
    const arbitrageResult = detectCurrencyArbitrage(exchangeRates, settings);
    const executionTime = Date.now() - startTime;
    
    console.log('✅ Manual arbitrage detection completed:', {
      executionTime: `${executionTime}ms`,
      cyclesFound: arbitrageResult.cycles.length,
      totalOpportunities: arbitrageResult.totalOpportunities,
      bestProfit: arbitrageResult.bestOpportunity?.profitPercentage
    });

    // Return successful response
    return NextResponse.json(
      {
        success: true,
        data: { 
          ...arbitrageResult, 
          type: 'manual',
          executionTime,
          dataSource: {
            totalPairs: exchangeRates.length,
            processedSymbols: exchangeRates.length,
            skippedSymbols: 0,
            cached: false,
            source: 'manual_input'
          }
        },
        timestamp: new Date().toISOString()
      },
      { status: 200 }
    );

  } catch (error) {
    console.error('Arbitrage detection error:', error);
    
    // Handle specific validation errors
    if (error instanceof Error && error.message.includes('Invalid exchange rate')) {
      return NextResponse.json(
        {
          success: false,
          error: error.message,
          timestamp: new Date().toISOString()
        },
        { status: 400 }
      );
    }

    // Handle JSON parsing errors
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

    // Handle unexpected errors
    return NextResponse.json(
      {
        success: false,
        error: 'Internal server error during arbitrage detection',
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
}

// GET endpoint for Binance exchange rates data
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    // Check if SSE is requested via headers
    const acceptHeader = request.headers.get('accept');
    if (acceptHeader?.includes('text/event-stream')) {
      return handleSSEStream();
    }

    // Get Binance data via REST API
    const restClient = getBinanceRestClient();
    const tickersResult = await restClient.fetchFilteredTickers();
    
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

    // Convert to exchange rates format
    const conversionResult = convertToGraph(tickersResult.data, {
      includeReverse: true,
      filterSymbols: createSymbolFilter({ quoteCurrencies: ['USDT'] }),
      maxSpread: 5 // 5% max spread for data display
    });

    // Return exchange rates data
    return NextResponse.json({
      success: true,
      data: {
        rates: conversionResult.exchangeRates,
        legacyRates: conversionResult.legacyRates,
        totalPairs: conversionResult.totalPairs,
        processedSymbols: conversionResult.processedSymbols.length,
        skippedSymbols: conversionResult.skippedSymbols.length,
        cached: tickersResult.cached,
        timestamp: tickersResult.timestamp
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('GET /api/arbitrage error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch exchange rates data',
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
}

function handleSSEStream(): NextResponse {
  const encoder = new TextEncoder();
  
  let isConnectionOpen = true;
  const binanceClient = getBinanceClient();
  
  // Start Binance stream if not already connected
  startBinanceStream();

  const stream = new ReadableStream({
    start(controller) {
      // Send initial connection message
      const initialMessage: StreamMessage = {
        type: 'status',
        data: { message: 'Connected to real-time arbitrage stream' },
        timestamp: new Date().toISOString()
      };
      controller.enqueue(encoder.encode(`data: ${JSON.stringify(initialMessage)}\n\n`));

      // Subscribe to rate updates
      const unsubscribe = binanceClient.subscribe((rates) => {
        if (!isConnectionOpen) return;

        try {
          // Convert real-time rates to legacy format for arbitrage detection
          const legacyRates = binanceClient.getLegacyRates();
          
          // Only detect arbitrage if we have sufficient data
          if (legacyRates.length >= 3) {
            // Detect arbitrage opportunities
            const arbitrageResult = detectCurrencyArbitrage(legacyRates);
            
            // Send rates update
            const ratesMessage: StreamMessage = {
              type: 'rates',
              data: {
                rates: rates.rates.slice(0, 50), // Limit to first 50 for performance
                totalPairs: rates.totalPairs,
                lastUpdate: rates.lastUpdate
              },
              timestamp: new Date().toISOString()
            };
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(ratesMessage)}\n\n`));

            // Send arbitrage results if found
            if (arbitrageResult.cycles.length > 0) {
              const arbitrageMessage: StreamMessage = {
                type: 'arbitrage',
                data: {
                  ...arbitrageResult,
                  type: 'realtime'
                },
                timestamp: new Date().toISOString()
              };
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(arbitrageMessage)}\n\n`));
            }
          }
        } catch (error) {
          console.error('Error in SSE stream:', error);
          const errorMessage: StreamMessage = {
            type: 'error',
            data: { error: 'Error processing real-time data' },
            timestamp: new Date().toISOString()
          };
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(errorMessage)}\n\n`));
        }
      });

      // Handle stream closure
      const cleanup = () => {
        isConnectionOpen = false;
        unsubscribe();
      };

      // Set up cleanup on stream abort
      return cleanup;
    },

    cancel() {
      isConnectionOpen = false;
    }
  });

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

export async function PUT(): Promise<NextResponse> {
  return NextResponse.json(
    {
      success: false,
      error: 'Method not allowed. Use POST to detect arbitrage opportunities.',
      timestamp: new Date().toISOString()
    },
    { status: 405 }
  );
}

export async function DELETE(): Promise<NextResponse> {
  return NextResponse.json(
    {
      success: false,
      error: 'Method not allowed. Use POST to detect arbitrage opportunities.',
      timestamp: new Date().toISOString()
    },
    { status: 405 }
  );
}