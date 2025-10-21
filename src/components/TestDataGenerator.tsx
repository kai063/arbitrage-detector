'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ExchangeRate } from '@/lib/algorithms/arbitrage';
import { TestTube, Zap } from 'lucide-react';

interface TestDataGeneratorProps {
  onDataGenerated: (rates: ExchangeRate[]) => void;
  dataSource: 'manual' | 'binance';
}

export default function TestDataGenerator({ onDataGenerated, dataSource }: TestDataGeneratorProps) {
  
  const generateSimpleArbitrageData = () => {
    // Vytvoříme jednoduchou arbitráž: USD -> EUR -> GBP -> USD
    // 1 USD = 0.85 EUR
    // 1 EUR = 0.9 GBP  
    // 1 GBP = 1.35 USD
    // Výsledek: 1 USD -> 0.85 EUR -> 0.765 GBP -> 1.0325 USD (profit 3.25%)
    
    const testRates: ExchangeRate[] = [
      // USD to EUR
      { from: 'USD', to: 'EUR', rate: 0.85, timestamp: new Date() },
      { from: 'EUR', to: 'USD', rate: 1.18, timestamp: new Date() },
      
      // EUR to GBP
      { from: 'EUR', to: 'GBP', rate: 0.9, timestamp: new Date() },
      { from: 'GBP', to: 'EUR', rate: 1.12, timestamp: new Date() },
      
      // GBP to USD  
      { from: 'GBP', to: 'USD', rate: 1.35, timestamp: new Date() },
      { from: 'USD', to: 'GBP', rate: 0.74, timestamp: new Date() },
      
      // Additional pairs to make it realistic
      { from: 'USD', to: 'JPY', rate: 150, timestamp: new Date() },
      { from: 'JPY', to: 'USD', rate: 0.0067, timestamp: new Date() },
      { from: 'EUR', to: 'JPY', rate: 165, timestamp: new Date() },
      { from: 'JPY', to: 'EUR', rate: 0.006, timestamp: new Date() },
    ];
    
    onDataGenerated(testRates);
  };

  const generateComplexArbitrageData = () => {
    // Složitější scénář s více arbitrážními příležitostmi
    const testRates: ExchangeRate[] = [
      // Triangular arbitrage BTC-ETH-USDT
      { from: 'BTC', to: 'ETH', rate: 15.5, timestamp: new Date() },
      { from: 'ETH', to: 'BTC', rate: 0.064, timestamp: new Date() },
      
      { from: 'ETH', to: 'USDT', rate: 2200, timestamp: new Date() },
      { from: 'USDT', to: 'ETH', rate: 0.00045, timestamp: new Date() },
      
      { from: 'BTC', to: 'USDT', rate: 35000, timestamp: new Date() },
      { from: 'USDT', to: 'BTC', rate: 0.0000285, timestamp: new Date() },
      
      // Additional crypto pairs
      { from: 'BNB', to: 'USDT', rate: 320, timestamp: new Date() },
      { from: 'USDT', to: 'BNB', rate: 0.003125, timestamp: new Date() },
      
      { from: 'BNB', to: 'BTC', rate: 0.009, timestamp: new Date() },
      { from: 'BTC', to: 'BNB', rate: 110, timestamp: new Date() },
      
      { from: 'BNB', to: 'ETH', rate: 0.145, timestamp: new Date() },
      { from: 'ETH', to: 'BNB', rate: 6.9, timestamp: new Date() },
    ];
    
    onDataGenerated(testRates);
  };

  const generateNoArbitrageData = () => {
    // Data kde by neměla být arbitráž (všechny kurzy jsou konzistentní)
    const testRates: ExchangeRate[] = [
      { from: 'USD', to: 'EUR', rate: 0.85, timestamp: new Date() },
      { from: 'EUR', to: 'USD', rate: 1.176, timestamp: new Date() }, // 1/0.85 = 1.176
      
      { from: 'EUR', to: 'GBP', rate: 0.9, timestamp: new Date() },
      { from: 'GBP', to: 'EUR', rate: 1.111, timestamp: new Date() }, // 1/0.9 = 1.111
      
      { from: 'USD', to: 'GBP', rate: 0.765, timestamp: new Date() }, // 0.85 * 0.9 = 0.765
      { from: 'GBP', to: 'USD', rate: 1.307, timestamp: new Date() }, // 1/0.765 = 1.307
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
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          
          {/* Simple Arbitrage */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="font-medium">Jednoduchá arbitráž</h4>
              <Badge variant="default" className="text-xs">
                ~3.25% profit
              </Badge>
            </div>
            <p className="text-sm text-gray-600">
              USD → EUR → GBP → USD cyklus s garantovaným profitem
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

          {/* Complex Arbitrage */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="font-medium">Komplexní arbitráž</h4>
              <Badge variant="default" className="text-xs">
                Více cyklů
              </Badge>
            </div>
            <p className="text-sm text-gray-600">
              Crypto páry s více arbitrážními příležitostmi
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
              Kurzy bez arbitrážních příležitostí
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
            <strong>Tip:</strong> Použijte tyto testovací data pro ověření, že algoritmus správně detekuje arbitrážní příležitosti. 
            Jednoduchá arbitráž by měla najít 1 cyklus s ~3.25% profitem.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}