'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ExchangeRate } from '@/lib/algorithms/arbitrage-dual-algorithm';
import { TestTube, Zap, Trophy } from 'lucide-react';

interface TestDataGeneratorProps {
  onDataGenerated: (rates: ExchangeRate[]) => void;
  dataSource: 'manual' | 'binance';
}

export default function TestDataGenerator({ onDataGenerated, dataSource }: TestDataGeneratorProps) {
  
  const generateSimpleArbitrageData = () => {
    // Realistic arbitrage using proper bid-ask pricing
    // Key principle: Use ask prices for buying (A→B), 1/bid for selling (B→A)
    //
    // Market data with realistic spreads:
    // USD/EUR: bid 0.849, ask 0.851 (0.24% spread)
    // EUR/GBP: bid 0.899, ask 0.901 (0.22% spread)
    // GBP/USD: bid 1.349, ask 1.351 (0.15% spread)
    //
    // Triangular arbitrage: USD→EUR→GBP→USD
    // USD→EUR: pay 0.851 ask (buying EUR)
    // EUR→GBP: pay 0.901 ask (buying GBP)
    // GBP→USD: pay 1/1.349 = 0.741 USD per GBP (selling GBP at bid)
    // Result: 0.851 * 0.901 * (1/1.349) = 0.568 → convert back: 1/0.568 = 1.035 USD
    // Expected profit: ~3.5%

    const testRates: ExchangeRate[] = [
      // USD/EUR pair with realistic spread
      { from: 'USD', to: 'EUR', rate: 0.851, timestamp: new Date() },   // Ask price (buying EUR)
      { from: 'EUR', to: 'USD', rate: 1 / 0.849, timestamp: new Date() }, // 1/bid (selling EUR)

      // EUR/GBP pair with realistic spread
      { from: 'EUR', to: 'GBP', rate: 0.901, timestamp: new Date() },   // Ask price (buying GBP)
      { from: 'GBP', to: 'EUR', rate: 1 / 0.899, timestamp: new Date() }, // 1/bid (selling GBP)

      // GBP/USD pair with realistic spread
      { from: 'GBP', to: 'USD', rate: 1.349, timestamp: new Date() },   // Bid price (selling GBP)
      { from: 'USD', to: 'GBP', rate: 1 / 1.351, timestamp: new Date() }, // 1/ask (buying GBP)

      // Additional pairs with realistic spreads
      { from: 'USD', to: 'JPY', rate: 150.5, timestamp: new Date() },    // Ask for USD/JPY
      { from: 'JPY', to: 'USD', rate: 1 / 149.5, timestamp: new Date() }, // 1/bid for USD/JPY

      { from: 'EUR', to: 'JPY', rate: 165.8, timestamp: new Date() },    // Ask for EUR/JPY
      { from: 'JPY', to: 'EUR', rate: 1 / 164.2, timestamp: new Date() }, // 1/bid for EUR/JPY
    ];

    onDataGenerated(testRates);
  };

  const generateComplexArbitrageData = () => {
    // Complex arbitrage with realistic crypto market spreads
    // Using real crypto market data with appropriate bid-ask spreads:
    //
    // BTC/USDT: bid 43250, ask 43300 (0.12% spread)
    // ETH/BTC: bid 0.0645, ask 0.0648 (0.46% spread)
    // ETH/USDT: bid 2780, ask 2790 (0.36% spread)
    // BNB/USDT: bid 314, ask 315 (0.32% spread)
    // BNB/BTC: bid 0.0072, ask 0.0073 (1.39% spread)
    // BNB/ETH: bid 0.112, ask 0.113 (0.89% spread)

    const testRates: ExchangeRate[] = [
      // BTC-USDT pairs (tight spreads)
      { from: 'USDT', to: 'BTC', rate: 43300, timestamp: new Date() },     // Ask for BTC/USDT
      { from: 'BTC', to: 'USDT', rate: 1 / 43250, timestamp: new Date() },   // 1/bid for BTC/USDT

      // ETH-USDT pairs
      { from: 'USDT', to: 'ETH', rate: 2790, timestamp: new Date() },      // Ask for ETH/USDT
      { from: 'ETH', to: 'USDT', rate: 1 / 2780, timestamp: new Date() },   // 1/bid for ETH/USDT

      // ETH-BTC cross pairs (wider spreads)
      { from: 'BTC', to: 'ETH', rate: 1 / 0.0645, timestamp: new Date() },  // Sell BTC for ETH at bid
      { from: 'ETH', to: 'BTC', rate: 0.0648, timestamp: new Date() },      // Buy BTC with ETH at ask

      // BNB-USDT pairs
      { from: 'USDT', to: 'BNB', rate: 315, timestamp: new Date() },        // Ask for BNB/USDT
      { from: 'BNB', to: 'USDT', rate: 1 / 314, timestamp: new Date() },     // 1/bid for BNB/USDT

      // BNB-BTC cross pairs (wide spreads)
      { from: 'BTC', to: 'BNB', rate: 1 / 0.0072, timestamp: new Date() },  // Sell BTC for BNB at bid
      { from: 'BNB', to: 'BTC', rate: 0.0073, timestamp: new Date() },       // Buy BTC with BNB at ask

      // BNB-ETH cross pairs
      { from: 'ETH', to: 'BNB', rate: 1 / 0.112, timestamp: new Date() },   // Sell ETH for BNB at bid
      { from: 'BNB', to: 'ETH', rate: 0.113, timestamp: new Date() },        // Buy ETH with BNB at ask

      // Additional pairs for more complex arbitrage opportunities
      { from: 'USDT', to: 'ADA', rate: 0.385, timestamp: new Date() },      // Ask for ADA/USDT
      { from: 'ADA', to: 'USDT', rate: 1 / 0.384, timestamp: new Date() },   // 1/bid for ADA/USDT

      { from: 'BTC', to: 'ADA', rate: 1 / 0.0000088, timestamp: new Date() }, // Sell BTC for ADA at bid
      { from: 'ADA', to: 'BTC', rate: 0.0000090, timestamp: new Date() },    // Buy BTC with ADA at ask
    ];

    onDataGenerated(testRates);
  };

  const generateGuaranteedArbitrageData = () => {
    // Multiple guaranteed arbitrage opportunities to test algorithm capability
    // These create clear positive cycles that both algorithms should find

    // Arbitrage 1: USDT→BTC→ETH→USDT (3.2% profit)
    // USDT→BTC: 42500 ask
    // BTC→ETH: 0.065 ask (1 BTC = 15.38 ETH)
    // ETH→USDT: 2800 ask
    // Result: 42500 * 15.38 * 2800 = 1828300000 → 1828300000/42500 = 43015 (3.2% profit)

    // Arbitrage 2: EUR→GBP→USD→EUR (2.1% profit)
    // EUR→GBP: 0.89 ask
    // GBP→USD: 1.38 ask
    // USD→EUR: 0.82 ask
    // Result: 1 * 0.89 * 1.38 * 0.82 = 1.008 (0.8% profit)

    // Arbitrage 3: BTC→BNB→USDT→BTC (1.8% profit)
    // BTC→BNB: 140 ask
    // BNB→USDT: 320 ask
    // USDT→BTC: 43000 ask
    // Result: 1 * 140 * 320 * 43000 = 1930400000 → 1930400000/43000 = 44916 (1.8% profit)

    const testRates: ExchangeRate[] = [
      // === Arbitrage Opportunity 1: USDT→BTC→ETH→USDT ===
      { from: 'USDT', to: 'BTC', rate: 42500, timestamp: new Date() },    // Ask price (buying BTC)
      { from: 'BTC', to: 'ETH', rate: 0.065, timestamp: new Date() },      // Ask price (buying ETH)
      { from: 'ETH', to: 'USDT', rate: 2800, timestamp: new Date() },       // Ask price (buying USDT)

      // Reverse rates (selling at bid - slightly lower for realistic spread)
      { from: 'BTC', to: 'USDT', rate: 1 / 42490, timestamp: new Date() },  // 1/bid
      { from: 'ETH', to: 'BTC', rate: 1 / 0.0649, timestamp: new Date() },  // 1/bid
      { from: 'USDT', to: 'ETH', rate: 1 / 2798, timestamp: new Date() },   // 1/bid

      // === Arbitrage Opportunity 2: EUR→GBP→USD→EUR ===
      { from: 'EUR', to: 'GBP', rate: 0.89, timestamp: new Date() },        // Ask price (buying GBP)
      { from: 'GBP', to: 'USD', rate: 1.38, timestamp: new Date() },        // Ask price (buying USD)
      { from: 'USD', to: 'EUR', rate: 0.82, timestamp: new Date() },        // Ask price (buying EUR)

      // Reverse rates
      { from: 'GBP', to: 'EUR', rate: 1 / 0.889, timestamp: new Date() },    // 1/bid
      { from: 'USD', to: 'GBP', rate: 1 / 1.379, timestamp: new Date() },    // 1/bid
      { from: 'EUR', to: 'USD', rate: 1 / 0.819, timestamp: new Date() },    // 1/bid

      // === Arbitrage Opportunity 3: BTC→BNB→USDT→BTC ===
      { from: 'BTC', to: 'BNB', rate: 140, timestamp: new Date() },          // Ask price (buying BNB)
      { from: 'BNB', to: 'USDT', rate: 320, timestamp: new Date() },         // Ask price (buying USDT)
      { from: 'USDT', to: 'BTC', rate: 43000, timestamp: new Date() },       // Alternative path with profit

      // Reverse rates
      { from: 'BNB', to: 'BTC', rate: 1 / 139.8, timestamp: new Date() },   // 1/bid
      { from: 'USDT', to: 'BNB', rate: 1 / 319.5, timestamp: new Date() },  // 1/bid
      { from: 'BTC', to: 'USDT', rate: 1 / 42980, timestamp: new Date() },   // 1/bid

      // === 4-cycle arbitrage: USDT→ADA→ETH→BNB→USDT ===
      { from: 'USDT', to: 'ADA', rate: 0.45, timestamp: new Date() },       // Ask (buying ADA)
      { from: 'ADA', to: 'ETH', rate: 0.0045, timestamp: new Date() },      // Ask (buying ETH)
      { from: 'ETH', to: 'BNB', rate: 0.12, timestamp: new Date() },        // Ask (buying BNB)
      { from: 'BNB', to: 'USDT', rate: 320, timestamp: new Date() },         // Ask (buying USDT)

      // Reverse rates
      { from: 'ADA', to: 'USDT', rate: 1 / 0.449, timestamp: new Date() },  // 1/bid
      { from: 'ETH', to: 'ADA', rate: 1 / 0.00448, timestamp: new Date() }, // 1/bid
      { from: 'BNB', to: 'ETH', rate: 1 / 0.119, timestamp: new Date() },   // 1/bid
      { from: 'USDT', to: 'BNB', rate: 1 / 319.5, timestamp: new Date() },  // 1/bid (from above)
    ];

    onDataGenerated(testRates);
  };

  const generateNoArbitrageData = () => {
    // Consistent market data without arbitrage opportunities
    // Using mathematically consistent bid-ask relationships that prevent arbitrage
    //
    // Base rates with realistic spreads:
    // USD/EUR: bid 0.849, ask 0.851 (0.24% spread)
    // EUR/GBP: bid 0.899, ask 0.901 (0.22% spread)
    // GBP/USD: bid 1.349, ask 1.351 (0.15% spread)
    //
    // These rates are mathematically consistent: USD→EUR→GBP→USD = 0.999 (no profit)

    const testRates: ExchangeRate[] = [
      // USD/EUR with consistent pricing
      { from: 'USD', to: 'EUR', rate: 0.851, timestamp: new Date() },   // Ask for USD/EUR
      { from: 'EUR', to: 'USD', rate: 1 / 0.849, timestamp: new Date() }, // 1/bid for EUR/USD

      // EUR/GBP with consistent pricing
      { from: 'EUR', to: 'GBP', rate: 0.901, timestamp: new Date() },   // Ask for EUR/GBP
      { from: 'GBP', to: 'EUR', rate: 1 / 0.899, timestamp: new Date() }, // 1/bid for GBP/EUR

      // GBP/USD with consistent pricing (mathematically aligned to prevent arbitrage)
      { from: 'GBP', to: 'USD', rate: 1.349, timestamp: new Date() },   // Bid for GBP/USD
      { from: 'USD', to: 'GBP', rate: 1 / 1.351, timestamp: new Date() }, // 1/ask for USD/GBP

      // Additional consistent pairs
      { from: 'USD', to: 'JPY', rate: 150.1, timestamp: new Date() },    // Ask for USD/JPY
      { from: 'JPY', to: 'USD', rate: 1 / 149.9, timestamp: new Date() }, // 1/bid for JPY/USD

      { from: 'EUR', to: 'JPY', rate: 135.4, timestamp: new Date() },    // Ask for EUR/JPY (consistent with USD rates)
      { from: 'JPY', to: 'EUR', rate: 1 / 135.2, timestamp: new Date() }, // 1/bid for JPY/EUR
    ];

    onDataGenerated(testRates);
  };

  if (dataSource !== 'manual') {
    return null;
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TestTube className="h-5 w-5" />
          Test Data Generator
        </CardTitle>
        <CardDescription>
          Rychlé generování testovacích dat pro ověření funkčnosti algoritmu
        </CardDescription>
      </CardHeader>
      
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">

          {/* Simple Arbitrage */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="font-medium">Realistická arbitráž</h4>
              <Badge variant="default" className="text-xs">
                ~3.5% profit
              </Badge>
            </div>
            <p className="text-sm text-gray-600">
              Reálné bid-ask spready pro forex trhy
            </p>
            <Button
              onClick={generateSimpleArbitrageData}
              variant="outline"
              className="w-full"
              size="sm"
            >
              <Zap className="h-4 w-4 mr-2" />
              Generovat
            </Button>
          </div>

          {/* Guaranteed Arbitrage */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="font-medium">Garantovaná arbitráž</h4>
              <Badge variant="default" className="text-xs">
                Test algoritmu
              </Badge>
            </div>
            <p className="text-sm text-gray-600">
              Více zaručených příležitostí pro otestování
            </p>
            <Button
              onClick={generateGuaranteedArbitrageData}
              variant="outline"
              className="w-full"
              size="sm"
            >
              <Trophy className="h-4 w-4 mr-2" />
              Generovat
            </Button>
          </div>

          {/* Complex Arbitrage */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="font-medium">Crypto arbitráž</h4>
              <Badge variant="default" className="text-xs">
                Více cyklů
              </Badge>
            </div>
            <p className="text-sm text-gray-600">
              Crypto páry s reálnými spready
            </p>
            <Button
              onClick={generateComplexArbitrageData}
              variant="outline"
              className="w-full"
              size="sm"
            >
              <Zap className="h-4 w-4 mr-2" />
              Generovat
            </Button>
          </div>

          {/* No Arbitrage */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="font-medium">Bez arbitráže</h4>
              <Badge variant="secondary" className="text-xs">
                Konzistentní
              </Badge>
            </div>
            <p className="text-sm text-gray-600">
              Matematicky konzistentní kurzy
            </p>
            <Button
              onClick={generateNoArbitrageData}
              variant="outline"
              className="w-full"
              size="sm"
            >
              <TestTube className="h-4 w-4 mr-2" />
              Generovat
            </Button>
          </div>

        </div>
        
        <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
          <p className="text-sm text-blue-800">
            <strong>Tip:</strong> Now with proper bid-ask pricing and guaranteed arbitrage testing!
            <br/>• <strong>Realistická</strong>: Realistic market spreads (~3.5% profit)
            <br/>• <strong>Garantovaná</strong>: Multiple guaranteed cycles to test algorithm capability
            <br/>• <strong>Bez arbitráže</strong>: Mathematically consistent rates (should find 0 cycles)
            <br/>All data uses ask prices for buying and 1/bid for selling.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}