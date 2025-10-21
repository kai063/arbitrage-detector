import { NextRequest, NextResponse } from 'next/server';
import { getBinanceClient } from '@/lib/binance/client';
import { convertToGraph, createSymbolFilter } from '@/lib/binance/rate-converter';
import { detectCurrencyArbitrage } from '@/lib/algorithms/arbitrage';
import { RealTimeExchangeRates } from '@/lib/types';

export interface StreamMessage {
  type: 'rates' | 'arbitrage' | 'error' | 'status' | 'heartbeat';
  data: unknown;
  timestamp: string;
}

export interface StreamSettings {
  selectedCurrencies?: string[];
  maxIterations?: number;
  minProfitThreshold?: number;
  maxPathLength?: number;
  maxSpread?: number;
}

// GET endpoint for Server-Sent Events stream
export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  
  // Parse settings from query parameters
  const settings: StreamSettings = {
    selectedCurrencies: searchParams.get('currencies')?.split(',').filter(Boolean) || ['BTC', 'ETH', 'BNB', 'USDT', 'USDC'],
    maxIterations: parseInt(searchParams.get('maxIterations') || '10'),
    minProfitThreshold: parseFloat(searchParams.get('minProfitThreshold') || '0.005'),
    maxPathLength: parseInt(searchParams.get('maxPathLength') || '4'),
    maxSpread: parseFloat(searchParams.get('maxSpread') || '2')
  };

  console.log('Starting arbitrage stream with settings:', settings);

  const encoder = new TextEncoder();
  let isConnectionOpen = true;
  let lastArbitrageCheck = Date.now();
  const arbitrageCheckInterval = 2000; // Check for arbitrage every 2 seconds
  
  const binanceClient = getBinanceClient();
  let unsubscribe: (() => void) | null = null;

  const stream = new ReadableStream({
    start(controller) {
      // Send initial connection message
      const initialMessage: StreamMessage = {
        type: 'status',
        data: { 
          message: 'Connected to real-time arbitrage stream',
          settings 
        },
        timestamp: new Date().toISOString()
      };
      controller.enqueue(encoder.encode(`data: ${JSON.stringify(initialMessage)}\n\n`));

      // Start Binance connection
      binanceClient.connect();

      // Subscribe to rate updates
      unsubscribe = binanceClient.subscribe((rates: RealTimeExchangeRates) => {
        if (!isConnectionOpen) return;

        try {
          // Send rates update (throttled to avoid spam)
          const ratesMessage: StreamMessage = {
            type: 'rates',
            data: {
              totalPairs: rates.totalPairs,
              lastUpdate: rates.lastUpdate,
              sampleRates: rates.rates.slice(0, 10) // Send only first 10 for preview
            },
            timestamp: new Date().toISOString()
          };
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(ratesMessage)}\n\n`));

          // Check for arbitrage opportunities (throttled)
          const now = Date.now();
          if (now - lastArbitrageCheck >= arbitrageCheckInterval) {
            lastArbitrageCheck = now;
            checkArbitrageOpportunities(rates, settings, controller, encoder);
          }

        } catch (error) {
          console.error('Error in rate update handler:', error);
          const errorMessage: StreamMessage = {
            type: 'error',
            data: { error: 'Error processing rate updates' },
            timestamp: new Date().toISOString()
          };
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(errorMessage)}\n\n`));
        }
      });

      // Send heartbeat every 30 seconds
      const heartbeatInterval = setInterval(() => {
        if (!isConnectionOpen) {
          clearInterval(heartbeatInterval);
          return;
        }

        const heartbeatMessage: StreamMessage = {
          type: 'heartbeat',
          data: { 
            timestamp: new Date().toISOString(),
            connected: binanceClient.getConnectionStatus().state === 'connected'
          },
          timestamp: new Date().toISOString()
        };
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(heartbeatMessage)}\n\n`));
      }, 30000);

      // Cleanup function
      return () => {
        isConnectionOpen = false;
        clearInterval(heartbeatInterval);
        if (unsubscribe) {
          unsubscribe();
        }
      };
    },

    cancel() {
      isConnectionOpen = false;
      if (unsubscribe) {
        unsubscribe();
      }
    }
  });

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'X-Accel-Buffering': 'no', // Disable Nginx buffering
    },
  });
}

async function checkArbitrageOpportunities(
  rates: RealTimeExchangeRates,
  settings: StreamSettings,
  controller: ReadableStreamDefaultController,
  encoder: TextEncoder
) {
  try {
    // Convert rates to book ticker format for processing
    const mockTickers = rates.rates.map(rate => ({
      symbol: `${rate.from}${rate.to}`,
      bidPrice: rate.bid.toString(),
      askPrice: rate.ask.toString(),
      bidQty: '0',
      askQty: '0'
    }));

    // Convert to graph format
    const conversionResult = convertToGraph(mockTickers, {
      includeReverse: true,
      filterSymbols: createSymbolFilter({ 
        quoteCurrencies: ['USDT'] 
      }),
      maxSpread: settings.maxSpread || 2
    });

    if (conversionResult.legacyRates.length < 3) {
      return; // Not enough data for arbitrage detection
    }

    // Filter rates based on selected currencies if specified
    let filteredRates = conversionResult.legacyRates;
    if (settings.selectedCurrencies && settings.selectedCurrencies.length > 0) {
      filteredRates = conversionResult.legacyRates.filter(rate => 
        settings.selectedCurrencies!.includes(rate.from) && 
        settings.selectedCurrencies!.includes(rate.to)
      );
    }

    if (filteredRates.length < 3) {
      return; // Not enough filtered data
    }

    // Run arbitrage detection
    const arbitrageResult = detectCurrencyArbitrage(filteredRates, {
      maxIterations: settings.maxIterations || 10,
      minProfitThreshold: settings.minProfitThreshold || 0.005,
      maxPathLength: settings.maxPathLength || 4
    });

    // Send arbitrage results if any opportunities found
    if (arbitrageResult.cycles.length > 0) {
      const arbitrageMessage: StreamMessage = {
        type: 'arbitrage',
        data: {
          ...arbitrageResult,
          type: 'realtime',
          dataSource: {
            totalPairs: conversionResult.totalPairs,
            processedSymbols: conversionResult.processedSymbols.length,
            skippedSymbols: conversionResult.skippedSymbols.length,
            filteredPairs: filteredRates.length
          }
        },
        timestamp: new Date().toISOString()
      };
      controller.enqueue(encoder.encode(`data: ${JSON.stringify(arbitrageMessage)}\n\n`));
      
      console.log(`Arbitrage detected: ${arbitrageResult.cycles.length} opportunities, best: ${arbitrageResult.bestOpportunity?.profitPercentage.toFixed(4)}%`);
    }

  } catch (error) {
    console.error('Error in arbitrage detection:', error);
    const errorMessage: StreamMessage = {
      type: 'error',
      data: { error: 'Error during arbitrage analysis' },
      timestamp: new Date().toISOString()
    };
    controller.enqueue(encoder.encode(`data: ${JSON.stringify(errorMessage)}\n\n`));
  }
}

// Handle other HTTP methods
export async function POST(): Promise<NextResponse> {
  return NextResponse.json(
    {
      success: false,
      error: 'Method not allowed. Use GET for SSE stream.',
      timestamp: new Date().toISOString()
    },
    { status: 405 }
  );
}

export async function PUT(): Promise<NextResponse> {
  return NextResponse.json(
    {
      success: false,
      error: 'Method not allowed. Use GET for SSE stream.',
      timestamp: new Date().toISOString()
    },
    { status: 405 }
  );
}

export async function DELETE(): Promise<NextResponse> {
  return NextResponse.json(
    {
      success: false,
      error: 'Method not allowed. Use GET for SSE stream.',
      timestamp: new Date().toISOString()
    },
    { status: 405 }
  );
}