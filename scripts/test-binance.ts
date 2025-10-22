#!/usr/bin/env node

/**
 * Test script for Binance REST API client and rate converter
 * Run with: npx tsx scripts/test-binance.ts
 */

import { getBinanceRestClient, BinanceBookTicker } from '../src/lib/binance/rest-client';
import { convertToGraph, createSymbolFilter, getConversionStats, parseSymbol, ConversionResult } from '../src/lib/binance/rate-converter';
import { detectCurrencyArbitrage } from '../src/lib/algorithms/arbitrage-dual-algorithm';

async function testBinanceRestClient() {
  console.log('🚀 Testing Binance REST API Client...\n');

  const client = getBinanceRestClient();

  // Test health check
  console.log('1. Health Check');
  const healthResult = await client.healthCheck();
  console.log('Health:', healthResult);
  console.log('');

  // Test cache info
  console.log('2. Cache Info (before fetch)');
  console.log('Cache:', client.getCacheInfo());
  console.log('');

  // Test fetching all tickers
  console.log('3. Fetching All Tickers');
  const startTime = Date.now();
  const result = await client.fetchAllTickers();
  const fetchTime = Date.now() - startTime;

  if (result.success && result.data) {
    console.log(`✅ Success! Fetched ${result.data.length} tickers in ${fetchTime}ms`);
    console.log(`📊 Cached: ${result.cached ? 'Yes' : 'No'}`);
    console.log(`🕒 Timestamp: ${result.timestamp.toISOString()}`);
    
    // Show sample ticker
    const sampleTicker = result.data.find(t => t.symbol === 'BTCUSDT') || result.data[0];
    console.log('📈 Sample ticker:', {
      symbol: sampleTicker.symbol,
      bidPrice: sampleTicker.bidPrice,
      askPrice: sampleTicker.askPrice
    });
  } else {
    console.log('❌ Failed:', result.error);
    return;
  }
  console.log('');

  // Test cache (second fetch should be cached)
  console.log('4. Testing Cache (second fetch)');
  const cachedResult = await client.fetchAllTickers();
  console.log(`📦 Cached: ${cachedResult.cached ? 'Yes' : 'No'}`);
  console.log('Cache info:', client.getCacheInfo());
  console.log('');

  // Test filtered tickers
  console.log('5. Fetching Filtered Tickers (USDT pairs only)');
  const filteredResult = await client.fetchFilteredTickers();
  if (filteredResult.success && filteredResult.data) {
    console.log(`✅ Filtered: ${filteredResult.data.length} USDT pairs`);
  }
  console.log('');

  return result.data || [];
}

function testSymbolParsing() {
  console.log('🔍 Testing Symbol Parsing...\n');

  const testSymbols = [
    'BTCUSDT',
    'ETHUSDT', 
    'BNBBUSD',
    'ADAEUR',
    'DOGEBTC',
    'MATICETH',
    'SOLUSDC',
    'AVAXFDUSD',
    'ATOMUSDT'
  ];

  console.log('Symbol'.padEnd(12) + 'Base'.padEnd(8) + 'Quote');
  console.log('-'.repeat(28));

  for (const symbol of testSymbols) {
    const { baseCurrency, quoteCurrency } = parseSymbol(symbol);
    console.log(
      symbol.padEnd(12) + 
      baseCurrency.padEnd(8) + 
      quoteCurrency
    );
  }
  console.log('');
}

async function testRateConverter(tickers: BinanceBookTicker[] = []) {
  console.log('🔄 Testing Rate Converter...\n');

  if (tickers.length === 0) {
    console.log('❌ No tickers to convert');
    return;
  }

  // Test basic conversion
  console.log('1. Basic Conversion (USDT pairs only)');
  const basicResult = convertToGraph(tickers, {
    includeReverse: true,
    filterSymbols: createSymbolFilter({ quoteCurrencies: ['USDT'] }),
    maxSpread: 5 // 5% max spread
  });

  console.log(`✅ Converted ${basicResult.totalPairs} pairs`);
  console.log(`📊 Generated ${basicResult.exchangeRates.length} exchange rates`);
  console.log(`📈 Generated ${basicResult.legacyRates.length} legacy rates`);
  console.log(`⏭️  Processed: ${basicResult.processedSymbols.length} symbols`);
  console.log(`⏸️  Skipped: ${basicResult.skippedSymbols.length} symbols`);

  // Show sample rates
  console.log('\n📈 Sample Exchange Rates:');
  basicResult.exchangeRates.slice(0, 5).forEach(rate => {
    console.log(`  ${rate.from} → ${rate.to}: bid=${rate.bid.toFixed(8)}, ask=${rate.ask.toFixed(8)}`);
  });

  // Show skipped symbols (first 10)
  if (basicResult.skippedSymbols.length > 0) {
    console.log('\n⏸️  Sample Skipped Symbols:');
    basicResult.skippedSymbols.slice(0, 10).forEach(symbol => {
      console.log(`  ${symbol}`);
    });
  }

  // Get statistics
  console.log('\n📊 Conversion Statistics:');
  const stats = getConversionStats(basicResult);
  console.log(`Success Rate: ${stats.successRate.toFixed(2)}%`);
  console.log(`Average Spread: ${stats.averageSpread.toFixed(4)}%`);
  console.log(`Total Symbols: ${stats.totalSymbols}`);

  // Top currencies by frequency
  const sortedCurrencies = Object.entries(stats.currencyDistribution)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 10);
  
  console.log('\n🏆 Top Currencies:');
  sortedCurrencies.forEach(([currency, count]) => {
    console.log(`  ${currency}: ${count} connections`);
  });

  console.log('');
  return basicResult;
}

async function testArbitrageDetection(conversionResult: ConversionResult | null) {
  console.log('🔍 Testing Arbitrage Detection...\n');

  if (!conversionResult || conversionResult.legacyRates.length === 0) {
    console.log('❌ No rates available for arbitrage detection');
    return;
  }

  // Use legacy rates for arbitrage detection (for compatibility)
  const legacyRates = conversionResult.legacyRates.slice(0, 50); // Limit for performance

  console.log(`🔄 Running arbitrage detection on ${legacyRates.length} rates...`);
  
  const startTime = Date.now();
  const arbitrageResult = detectCurrencyArbitrage(legacyRates, {
    maxIterations: 20,
    minProfitThreshold: 0.001, // 0.1%
    maxPathLength: 4
  });
  const detectionTime = Date.now() - startTime;

  console.log(`⏱️  Detection completed in ${detectionTime}ms`);
  console.log(`📊 Found ${arbitrageResult.totalOpportunities} arbitrage opportunities`);

  if (arbitrageResult.bestOpportunity) {
    console.log(`🏆 Best opportunity: ${arbitrageResult.bestOpportunity.profitPercentage.toFixed(6)}%`);
    console.log(`🔄 Path: ${arbitrageResult.bestOpportunity.currencies.join(' → ')}`);
  }

  // Show first few cycles
  if (arbitrageResult.cycles.length > 0) {
    console.log('\n🔄 Sample Arbitrage Cycles:');
    arbitrageResult.cycles.slice(0, 3).forEach((cycle, index) => {
      console.log(`  ${index + 1}. ${cycle.currencies.join(' → ')} → ${cycle.currencies[0]}`);
      console.log(`     Profit: ${cycle.profitPercentage.toFixed(6)}%`);
    });
  }

  console.log('');
}

async function main() {
  console.log('='.repeat(60));
  console.log('🧪 BINANCE API CLIENT & CONVERTER TEST SUITE');
  console.log('='.repeat(60));
  console.log('');

  try {
    // Test symbol parsing
    testSymbolParsing();

    // Test REST client
    const tickers = await testBinanceRestClient();

    // Test rate converter
    const conversionResult = await testRateConverter(tickers);

    // Test arbitrage detection
    await testArbitrageDetection(conversionResult || null);

    console.log('✅ All tests completed successfully!');

  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

// Handle uncaught errors
process.on('unhandledRejection', (error) => {
  console.error('❌ Unhandled rejection:', error);
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught exception:', error);
  process.exit(1);
});

// Run tests
if (require.main === module) {
  main();
}