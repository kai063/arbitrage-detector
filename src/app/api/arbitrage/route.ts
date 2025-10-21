import { NextRequest, NextResponse } from 'next/server';
import { ExchangeRate as LegacyExchangeRate, ArbitrageResult, detectCurrencyArbitrage, validateExchangeRates } from '@/lib/algorithms/arbitrage';
import { getBinanceClient, startBinanceStream } from '@/lib/binance/client';
import { StreamMessage, ArbitrageStream } from '@/lib/types';

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
  try {
    const body: ArbitrageRequest = await request.json();
    
    // Extract settings with defaults
    const settings = {
      maxIterations: body.settings?.maxIterations || 10,
      minProfitThreshold: body.settings?.minProfitThreshold || 0.005, // 0.5%
      maxPathLength: body.settings?.maxPathLength || 4,
      selectedCurrencies: body.settings?.selectedCurrencies || ['BTC', 'ETH', 'BNB', 'EUR', 'USDC'],
      useRealTimeData: body.settings?.useRealTimeData || false
    };

    // If using real-time data, get from Binance
    if (settings.useRealTimeData) {
      const binanceClient = getBinanceClient();
      startBinanceStream();
      
      // Wait a moment for data to be available
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const realTimeRates = binanceClient.getLegacyRates();
      
      if (realTimeRates.length < 3) {
        return NextResponse.json(
          {
            success: false,
            error: 'Insufficient real-time data available. Please try again in a moment.',
            timestamp: new Date().toISOString()
          },
          { status: 400 }
        );
      }

      // Filter rates based on selected currencies
      const filteredRates = realTimeRates.filter(rate => 
        settings.selectedCurrencies.includes(rate.from) && 
        settings.selectedCurrencies.includes(rate.to)
      );

      // Detect arbitrage with real-time data
      const arbitrageResult = detectCurrencyArbitrage(filteredRates, settings);
      
      return NextResponse.json(
        {
          success: true,
          data: { ...arbitrageResult, type: 'realtime' },
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
    const arbitrageResult = detectCurrencyArbitrage(exchangeRates, settings);

    // Return successful response
    return NextResponse.json(
      {
        success: true,
        data: { ...arbitrageResult, type: 'manual' },
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

// GET endpoint for real-time arbitrage stream using Server-Sent Events
export async function GET(request: NextRequest): Promise<NextResponse> {
  // Check if SSE is requested via headers
  const acceptHeader = request.headers.get('accept');
  if (acceptHeader?.includes('text/event-stream')) {
    return handleSSEStream();
  }

  // Default GET response for status
  const binanceClient = getBinanceClient();
  const connectionStatus = binanceClient.getConnectionStatus();
  const currentRates = binanceClient.getCurrentRates();

  return NextResponse.json({
    success: true,
    data: {
      connectionStatus,
      ratesCount: currentRates.totalPairs,
      lastUpdate: currentRates.lastUpdate,
      isStreaming: connectionStatus.state === 'connected'
    },
    timestamp: new Date().toISOString()
  });
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