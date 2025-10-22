import { NextRequest, NextResponse } from 'next/server';
import { ExchangeRate as LegacyExchangeRate, ArbitrageResult, detectCurrencyArbitrage, validateExchangeRates } from '@/lib/algorithms/arbitrage-dual-algorithm';
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
     maxIterations: number;
    minProfitThreshold: number;
    maxPathLength: number;
    selectedCurrencies: string[];
    autoRefresh: boolean;
    algorithm: 'bellman-ford' | 'floyd-warshall'; 
    bellmanFordStartCurrencies: string[];
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
        minProfitThreshold: body.settings?.minProfitThreshold !== undefined ? body.settings.minProfitThreshold : 0.005,
        maxPathLength: body.settings?.maxPathLength || 4,
        selectedCurrencies: body.settings?.selectedCurrencies || [],
        useRealTimeData: body.settings?.useRealTimeData || false,
        algorithm: body.settings?.algorithm || 'floyd-warshall',
        bellmanFordStartCurrencies: body.settings?.bellmanFordStartCurrencies || []
      };
    
    console.log('🔧 API ROUTE DEBUG - Request received:', {
      requestSettings: body.settings,
      finalSettings: settings,
      exchangeRatesLength: body.exchangeRates?.length || 0,
      willUseBinanceData: settings.useRealTimeData || body.exchangeRates.length === 0,
      dataSource: settings.useRealTimeData ? 'realtime' : (body.exchangeRates.length === 0 ? 'binance-rest' : 'manual')
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
      console.log('📊 BINANCE DATA DEBUG - Raw Binance response:', {
        tickersCount: tickersResult.data.length,
        cached: tickersResult.cached,
        timestamp: tickersResult.timestamp,
        sampleTickers: tickersResult.data.slice(0, 5).map(t => ({
          symbol: t.symbol,
          bidPrice: t.bidPrice,
          askPrice: t.askPrice
        }))
      });

      const conversionResult = convertToGraph(tickersResult.data, {
        includeReverse: true,
        filterSymbols: createSymbolFilter({ quoteCurrencies: ['USDT'] }),
        maxSpread: 2 // 2% max spread for arbitrage
      });
      
      console.log('📊 CONVERSION RESULT DEBUG:', {
        legacyRatesCount: conversionResult.legacyRates.length,
        exchangeRatesCount: conversionResult.exchangeRates.length,
        totalPairs: conversionResult.totalPairs,
        processedSymbols: conversionResult.processedSymbols.length,
        skippedSymbols: conversionResult.skippedSymbols.length,
        sampleLegacyRates: conversionResult.legacyRates.slice(0, 10).map(r => `${r.from}→${r.to}: ${r.rate}`)
      });
      
      if (conversionResult.legacyRates.length < 3) {
        console.log('❌ CRITICAL: Insufficient valid trading pairs from Binance conversion!');
        return NextResponse.json(
          {
            success: false,
            error: 'Insufficient valid trading pairs available from Binance.',
            timestamp: new Date().toISOString()
          },
          { status: 400 }
        );
      }

      // Debug: Log total rates from Binance conversion
      console.log('📊 CURRENCY FILTERING DEBUG - Initial Binance Data:', {
        totalRatesFromBinance: conversionResult.legacyRates.length,
        selectedCurrenciesCount: settings.selectedCurrencies.length,
        selectedCurrencies: settings.selectedCurrencies.slice(0, 20), // Show first 20 for readability
        sampleInitialRates: conversionResult.legacyRates.slice(0, 10).map(r => `${r.from}->${r.to} (${r.rate})`)
      });

      // Get unique currencies in the initial data for comparison
      const initialUniqueCurrencies = Array.from(new Set([
        ...conversionResult.legacyRates.map(r => r.from),
        ...conversionResult.legacyRates.map(r => r.to)
      ])).sort();

      console.log('💱 CURRENCY FILTERING DEBUG - Available Currencies:', {
        totalUniqueCurrenciesInBinanceData: initialUniqueCurrencies.length,
        availableCurrencies: initialUniqueCurrencies.slice(0, 50), // Show first 50
        allAvailableCurrencies: initialUniqueCurrencies
      });

      // Filter rates based on selected currencies if specified
      let filteredRates = conversionResult.legacyRates;
      if (settings.selectedCurrencies.length > 0) {
        console.log('🔍 CURRENCY FILTERING DEBUG - Starting Filter Process:', {
          beforeFilteringCount: conversionResult.legacyRates.length,
          filterCriteria: 'Both FROM and TO currencies must be in selectedCurrencies'
        });

        // Always include USDT if it exists in the data for better connectivity
        const effectiveSelectedCurrencies = new Set(settings.selectedCurrencies);
        if (initialUniqueCurrencies.includes('USDT')) {
          effectiveSelectedCurrencies.add('USDT');
        }

        // Intelligent filtering strategy:
        // 1. Include all pairs where both currencies are selected (direct pairs)
        // 2. Include pairs involving selected currencies + major hub currencies (USDT, BTC, ETH)
        // This ensures graph connectivity while focusing on selected currencies
        const majorHubCurrencies = new Set(['USDT', 'BTC', 'ETH', 'BUSD', 'USDC']);
        
        filteredRates = conversionResult.legacyRates.filter(rate => {
          const fromSelected = effectiveSelectedCurrencies.has(rate.from);
          const toSelected = effectiveSelectedCurrencies.has(rate.to);
          const fromIsHub = majorHubCurrencies.has(rate.from);
          const toIsHub = majorHubCurrencies.has(rate.to);
          
          // Include if both are selected (ideal)
          if (fromSelected && toSelected) return true;
          
          // Include if one is selected and other is a major hub currency
          if ((fromSelected && toIsHub) || (toSelected && fromIsHub)) return true;
          
          // Include major hub currency pairs (for graph connectivity)
          if (fromIsHub && toIsHub) return true;
          
          return false;
        });

        // If still too few rates after inclusive filtering, try more restrictive approaches
        if (filteredRates.length < 10 && settings.selectedCurrencies.length > 0) {
          console.log('📈 Using fallback filtering strategy - including selected currencies + their USDT pairs');
          filteredRates = conversionResult.legacyRates.filter(rate => {
            const fromSelected = settings.selectedCurrencies.includes(rate.from);
            const toSelected = settings.selectedCurrencies.includes(rate.to);
            const involvesBoth = fromSelected && toSelected;
            const involvesUSDT = (rate.from === 'USDT' || rate.to === 'USDT') && (fromSelected || toSelected);
            return involvesBoth || involvesUSDT;
          });
        }

        // Get unique currencies in filtered data
        const filteredUniqueCurrencies = Array.from(new Set([
          ...filteredRates.map(r => r.from),
          ...filteredRates.map(r => r.to)
        ])).sort();

        // Find which selected currencies are actually present in Binance data
        const selectedCurrenciesFoundInBinance = settings.selectedCurrencies.filter(currency => 
          initialUniqueCurrencies.includes(currency)
        );

        const selectedCurrenciesNotFound = settings.selectedCurrencies.filter(currency => 
          !initialUniqueCurrencies.includes(currency)
        );

        console.log('🎯 CURRENCY FILTERING DEBUG - Filter Results:', {
          ratesAfterFiltering: filteredRates.length,
          reductionPercentage: ((conversionResult.legacyRates.length - filteredRates.length) / conversionResult.legacyRates.length * 100).toFixed(2) + '%',
          uniqueCurrenciesInFilteredData: filteredUniqueCurrencies.length,
          actualFilteredCurrencies: filteredUniqueCurrencies,
          selectedCurrenciesFoundInBinance: selectedCurrenciesFoundInBinance.length,
          foundCurrencies: selectedCurrenciesFoundInBinance,
          selectedCurrenciesNotFoundInBinance: selectedCurrenciesNotFound.length,
          notFoundCurrencies: selectedCurrenciesNotFound.slice(0, 20), // Show first 20
          sampleFilteredRates: filteredRates.slice(0, 10).map(r => `${r.from}->${r.to} (${r.rate})`),
        });

        // Additional analysis: Check if the issue is USDT-only pairs
        const usdtPairAnalysis = {
          totalBinanceRatesWithUSdt: conversionResult.legacyRates.filter(r => r.from === 'USDT' || r.to === 'USDT').length,
          totalBinanceRatesWithoutUSdt: conversionResult.legacyRates.filter(r => r.from !== 'USDT' && r.to !== 'USDT').length,
          filteredRatesWithUSdt: filteredRates.filter(r => r.from === 'USDT' || r.to === 'USDT').length,
          filteredRatesWithoutUSdt: filteredRates.filter(r => r.from !== 'USDT' && r.to !== 'USDT').length,
        };

        console.log('💰 CURRENCY FILTERING DEBUG - USDT Pair Analysis:', {
          ...usdtPairAnalysis,
          explanation: 'Binance primarily provides USDT pairs, not direct cross-currency pairs'
        });

        // Check for potential cross-currency arbitrage paths
        const crossCurrencyPairs = filteredRates.filter(r => r.from !== 'USDT' && r.to !== 'USDT');
        console.log('🔄 CURRENCY FILTERING DEBUG - Cross-Currency Opportunities:', {
          directCrossCurrencyPairs: crossCurrencyPairs.length,
          sampleCrossPairs: crossCurrencyPairs.slice(0, 5).map(r => `${r.from}->${r.to}`),
          potentialArbitrageNote: crossCurrencyPairs.length === 0 ? 
            'No direct cross-currency pairs found - arbitrage would need to go through USDT' : 
            `${crossCurrencyPairs.length} direct cross-currency pairs available`
        });
      }

      // Final check before sending to algorithm
      console.log('🔍 FINAL DATA CHECK - About to send to algorithm:', {
        filteredRatesCount: filteredRates.length,
        originalRatesCount: conversionResult.legacyRates.length,
        filteringReduction: `${((conversionResult.legacyRates.length - filteredRates.length) / conversionResult.legacyRates.length * 100).toFixed(1)}%`,
        settings: {
          maxIterations: settings.maxIterations,
          algorithm: settings.algorithm,
          selectedCurrencies: settings.selectedCurrencies?.length || 0,
          minProfitThreshold: settings.minProfitThreshold
        },
        sampleRates: filteredRates.slice(0, 5).map(r => `${r.from}→${r.to}: ${r.rate}`)
      });

      // CRITICAL CHECK: If we have no rates after filtering, the algorithm will finish instantly
      if (filteredRates.length === 0) {
        console.log('❌ CRITICAL FAILURE: No rates survived filtering! Algorithm will have nothing to process.');
        return NextResponse.json(
          {
            success: false,
            error: 'No valid exchange rates after currency filtering. Try selecting different currencies or check filter settings.',
            timestamp: new Date().toISOString()
          },
          { status: 400 }
        );
      }

      // TESTING: Simple arbitrage test - just add 3 rates that form a profitable cycle
      console.log('🧪 Adding simple test arbitrage cycle...');
      const simpleTestRates = [
        { from: 'TEST1', to: 'TEST2', rate: 1.1, timestamp: new Date() },
        { from: 'TEST2', to: 'TEST3', rate: 1.1, timestamp: new Date() },
        { from: 'TEST3', to: 'TEST1', rate: 0.83, timestamp: new Date() } // 1.1 * 1.1 * 0.83 = 1.0043 = 0.43% profit
      ];
      
      // Add just the test rates to keep it simple
      filteredRates = [...filteredRates, ...simpleTestRates];
      console.log(`🧪 Added ${simpleTestRates.length} simple test rates. Total rates: ${filteredRates.length}`);
      
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
          debug: {
            message: 'API route executed successfully',
            binanceTickers: tickersResult.data.length,
            conversionResultRates: conversionResult.legacyRates.length,
            filteredRatesCount: filteredRates.length,
            settingsReceived: settings,
            executionTimeMs: executionTime,
            algorithmInfo: {
              cycles: arbitrageResult.cycles.length,
              totalOpportunities: arbitrageResult.totalOpportunities,
              executionTime: arbitrageResult.executionTimeMs,
              algorithmUsed: arbitrageResult.algorithmUsed,
              timestamp: arbitrageResult.timestamp
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