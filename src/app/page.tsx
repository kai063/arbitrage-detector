'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { ExchangeRate, ArbitrageResult } from '@/lib/algorithms/arbitrage';
import { AlertCircle, Plus, Search, Trash2, Settings, Play, Square, Wifi, WifiOff, Activity, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { ThemeToggle } from '@/components/ThemeToggle';
import dynamic from 'next/dynamic';
import AlgorithmDebug from '@/components/AlgorithmDebug';
import ArbitrageTable from '@/components/ArbitrageTable';
import Statistics from '@/components/Statistics';
import BinanceDataTable from '@/components/BinanceDataTable';
import TestDataGenerator from '@/components/TestDataGenerator';
import { useArbitrageStream } from '@/hooks/useArbitrageStream';

// Dynamically import CurrencyGraph to avoid SSR issues
const CurrencyGraph = dynamic(() => import('@/components/CurrencyGraph'), {
  ssr: false,
  loading: () => <div className="flex items-center justify-center h-96">Loading graph...</div>
});

interface AlgorithmSettings {
  maxIterations: number;
  minProfitThreshold: number;
  maxPathLength: number;
  selectedCurrencies: string[];
  autoRefresh: boolean;
}

type DataSource = 'manual' | 'binance';

interface BinanceDataInfo {
  totalPairs: number;
  processedSymbols: number;
  skippedSymbols: number;
  cached: boolean;
  timestamp: Date;
  loading: boolean;
}

export default function Home() {
  const [exchangeRates, setExchangeRates] = useState<ExchangeRate[]>([]);
  const [newRate, setNewRate] = useState({ from: '', to: '', rate: '' });
  const [arbitrageResult, setArbitrageResult] = useState<ArbitrageResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [isRealTimeActive, setIsRealTimeActive] = useState(false);
  const [realTimeData, setRealTimeData] = useState<{
    rates: import('@/lib/types').ExchangeRate[];
    totalPairs: number;
    lastUpdate: Date;
  } | null>(null);
  const [arbitrageHistory, setArbitrageHistory] = useState<ArbitrageResult[]>([]);
  const [totalRuns, setTotalRuns] = useState(0);
  const [isDebugEnabled, setIsDebugEnabled] = useState(false);
  
  // Available currencies from Binance
  const [availableCurrencies, setAvailableCurrencies] = useState<{
    base: string[];
    quote: string[];
    loading: boolean;
  }>({
    base: [],
    quote: [],
    loading: false
  });
  
  // Data source selection
  const [dataSource, setDataSource] = useState<DataSource>('manual');
  const [binanceDataInfo, setBinanceDataInfo] = useState<BinanceDataInfo>({
    totalPairs: 0,
    processedSymbols: 0,
    skippedSymbols: 0,
    cached: false,
    timestamp: new Date(),
    loading: false
  });

  // Initialize arbitrage stream
  const stream = useArbitrageStream({
    autoConnect: false,
    enableNotifications: true,
    enableLogs: isDebugEnabled
  });
  
  // Algorithm settings state
  const [settings, setSettings] = useState<AlgorithmSettings>({
    maxIterations: 10,
    minProfitThreshold: 0,
    maxPathLength: 4,
    selectedCurrencies: [],
    autoRefresh: false
  });


  // Fetch available currencies from Binance
  const fetchAvailableCurrencies = useCallback(async () => {
    setAvailableCurrencies(prev => ({ ...prev, loading: true }));
    try {
      const response = await fetch('/api/binance/pairs?quote=USDT&maxSpread=5');
      const data = await response.json();
      
      if (data.success && data.data) {
        setAvailableCurrencies({
          base: data.data.baseCurrencies || [],
          quote: data.data.quoteCurrencies || [],
          loading: false
        });
      } else {
        console.error('Failed to fetch available currencies:', data.error);
        setAvailableCurrencies(prev => ({ ...prev, loading: false }));
      }
    } catch (error) {
      console.error('Error fetching available currencies:', error);
      setAvailableCurrencies(prev => ({ ...prev, loading: false }));
    }
  }, []);

  // Fetch available pairs for Binance data source
  const fetchAvailablePairs = async () => {
    try {
      const response = await fetch('/api/binance/pairs?quote=USDT&maxSpread=2');
      const data = await response.json();
      
      if (data.success && data.data) {
        const uniqueCurrencies = new Set<string>();
        data.data.pairs.forEach((pair: { baseCurrency: string; quoteCurrency: string }) => {
          uniqueCurrencies.add(pair.baseCurrency);
          uniqueCurrencies.add(pair.quoteCurrency);
        });
      }
    } catch {
      toast.error('Nepodařilo se načíst dostupné měnové páry');
    }
  };

  // Load and analyze Binance data
  const loadAndAnalyzeBinanceData = useCallback(async () => {
    setBinanceDataInfo(prev => ({ ...prev, loading: true }));
    setIsAnalyzing(true);
    setErrors([]);

    try {
      // Update settings to use selected currencies
      const updatedSettings = {
        ...settings,
        selectedCurrencies: [],
        useRealTimeData: false
      };

      const response = await fetch('/api/arbitrage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          exchangeRates: [], // Empty to trigger Binance data
          settings: updatedSettings
        })
      });

      const data = await response.json();
      
      if (data.success && data.data) {
        setArbitrageResult(data.data);
        setArbitrageHistory(prev => [...prev, data.data].slice(-50));
        setTotalRuns(prev => prev + 1);

        // Update Binance data info
        if (data.data.dataSource) {
          setBinanceDataInfo({
            totalPairs: data.data.dataSource.totalPairs || 0,
            processedSymbols: data.data.dataSource.processedSymbols || 0,
            skippedSymbols: data.data.dataSource.skippedSymbols || 0,
            cached: data.data.dataSource.cached || false,
            timestamp: new Date(),
            loading: false
          });
        }

        // Show success toast
        if (data.data.cycles.length > 0) {
          toast.success('Binance arbitráž detekována!', {
            description: `Nalezeno ${data.data.cycles.length} arbitrážních příležitostí`,
          });
        } else {
          toast.info('Binance analýza dokončena', {
            description: 'Žádné arbitrážní příležitosti nebyly nalezeny',
          });
        }
      } else {
        setErrors([data.error || 'Chyba při analýze Binance dat']);
        toast.error('Chyba při analýze Binance dat', {
          description: data.error || 'Neznámá chyba při načítání dat z Binance',
        });
      }
    } catch {
      setErrors(['Chyba při načítání Binance dat']);
      toast.error('Síťová chyba', {
        description: 'Nepodařilo se připojit k Binance API',
      });
    } finally {
      setIsAnalyzing(false);
      setBinanceDataInfo(prev => ({ ...prev, loading: false }));
    }
  }, [settings]);

  // Fetch available pairs when component mounts
  useEffect(() => {
    fetchAvailablePairs();
  }, []);

  const addExchangeRate = () => {
    setErrors([]);
    const formErrors: string[] = [];

    if (!newRate.from.trim()) formErrors.push('Výchozí měna je povinná');
    if (!newRate.to.trim()) formErrors.push('Cílová měna je povinná');
    if (!newRate.rate.trim()) formErrors.push('Kurz je povinný');

    const rateNum = parseFloat(newRate.rate);
    if (isNaN(rateNum) || rateNum <= 0) {
      formErrors.push('Kurz musí být kladné číslo');
    }

    if (newRate.from.trim().toUpperCase() === newRate.to.trim().toUpperCase()) {
      formErrors.push('Výchozí a cílová měna nemohou být stejné');
    }

    if (formErrors.length > 0) {
      setErrors(formErrors);
      return;
    }

    const rate: ExchangeRate = {
      from: newRate.from.trim().toUpperCase(),
      to: newRate.to.trim().toUpperCase(),
      rate: rateNum,
      timestamp: new Date()
    };

    setExchangeRates(prev => [...prev, rate]);
    setNewRate({ from: '', to: '', rate: '' });
  };

  const removeExchangeRate = (index: number) => {
    setExchangeRates(prev => prev.filter((_, i) => i !== index));
    setArbitrageResult(null);
  };

  const clearAllRates = () => {
    setExchangeRates([]);
    setArbitrageResult(null);
    setErrors([]);
  };

  const detectArbitrage = useCallback(async (useRealTime = false) => {
    // Check data source and requirements
    if (dataSource === 'manual' && !useRealTime && exchangeRates.length < 3) {
      setErrors(['Pro detekci arbitráže jsou potřeba alespoň 3 směnné kurzy']);
      return;
    }
    

    setIsAnalyzing(true);
    setErrors([]);

    try {
      const requestBody = {
        exchangeRates: (useRealTime || dataSource === 'binance') ? [] : exchangeRates.map(rate => ({
          from: rate.from,
          to: rate.to,
          rate: rate.rate,
          timestamp: rate.timestamp.toISOString()
        })),
        settings: {
          maxIterations: settings.maxIterations,
          minProfitThreshold: settings.minProfitThreshold / 100, // Convert percentage to decimal
          maxPathLength: settings.maxPathLength,
          selectedCurrencies: settings.selectedCurrencies,
          useRealTimeData: useRealTime
        }
      };

      const response = await fetch('/api/arbitrage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });

      const data = await response.json();
      
      if (data.success) {
        setArbitrageResult(data.data);
        // Add to history
        setArbitrageHistory(prev => [...prev, data.data].slice(-50)); // Keep last 50 results
        setTotalRuns(prev => prev + 1);
        
        // Show success toast
        if (data.data.cycles.length > 0) {
          toast.success('Arbitráž detekována!', {
            description: `Nalezeno ${data.data.cycles.length} arbitrážních příležitostí`,
          });
        } else {
          toast.info('Analýza dokončena', {
            description: 'Žádné arbitrážní příležitosti nebyly nalezeny',
          });
        }
      } else {
        setErrors([data.error || 'Chyba při analýze arbitráže']);
        toast.error('Chyba při analýze', {
          description: data.error || 'Neznámá chyba při detekci arbitráže',
        });
      }
    } catch {
      setErrors(['Chyba při analýze arbitráže']);
      toast.error('Síťová chyba', {
        description: 'Nepodařilo se připojit k serveru',
        action: {
          label: 'Zkusit znovu',
          onClick: () => detectArbitrage(useRealTime),
        },
      });
    } finally {
      setIsAnalyzing(false);
    }
  }, [dataSource, exchangeRates, settings.maxIterations, settings.minProfitThreshold, settings.maxPathLength, settings.selectedCurrencies]);

  const runArbitrageDetection = useCallback(() => {
    detectArbitrage(false);
  }, [detectArbitrage]);

  const startRealTimeDetection = () => {
    setIsRealTimeActive(true);
    stream.connect();
  };

  const stopRealTimeDetection = () => {
    setIsRealTimeActive(false);
    stream.disconnect();
    setRealTimeData(null);
  };

  // Sync stream data with local state
  useEffect(() => {
    if (stream.detectedArbitrages.length > 0) {
      const latestArbitrage = stream.latestArbitrage;
      if (latestArbitrage) {
        setArbitrageResult(latestArbitrage);
        setArbitrageHistory(prev => {
          // Avoid duplicates by checking timestamp
          const exists = prev.some(item => 
            item.timestamp.getTime() === latestArbitrage.timestamp.getTime()
          );
          if (!exists) {
            setTotalRuns(prev => prev + 1);
            return [...prev, latestArbitrage].slice(-50);
          }
          return prev;
        });
      }
    }

    if (stream.currentRates.length > 0) {
      setRealTimeData({
        rates: stream.currentRates,
        totalPairs: stream.ratesCount,
        lastUpdate: stream.lastUpdate || new Date()
      });
    }

    if (stream.lastError) {
      setErrors([stream.lastError]);
    }
  }, [stream.detectedArbitrages, stream.currentRates, stream.lastError, stream.latestArbitrage, stream.lastUpdate, stream.ratesCount]);

  // Update real-time status
  useEffect(() => {
    if (!stream.isConnected && isRealTimeActive) {
      setIsRealTimeActive(false);
    }
  }, [stream.isConnected, isRealTimeActive]);

  // Load available currencies on component mount
  useEffect(() => {
    fetchAvailableCurrencies();
  }, [fetchAvailableCurrencies]);

  // Auto-refresh effect
  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    if (settings.autoRefresh && !isRealTimeActive) {
      interval = setInterval(() => {
        if (exchangeRates.length >= 3) {
          detectArbitrage(false);
        }
      }, 5000); // Refresh every 5 seconds
    }
    
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [settings.autoRefresh, exchangeRates, isRealTimeActive, detectArbitrage]);

  // Toast notifications for stream events
  useEffect(() => {
    if (stream.lastError) {
      toast.error('Chyba připojení', {
        description: stream.lastError,
        action: {
          label: 'Znovu připojit',
          onClick: () => stream.connect(),
        },
      });
    }
  }, [stream.lastError, stream]);

  useEffect(() => {
    if (stream.hasNewArbitrages && stream.latestArbitrage?.bestOpportunity) {
      const profit = stream.latestArbitrage.bestOpportunity.profitPercentage;
      if (profit > 1) {
        toast.success('Vysoká arbitráž detekována!', {
          description: `${profit.toFixed(4)}% profit v ${stream.latestArbitrage.bestOpportunity.currencies.join(' → ')}`,
          duration: 5000,
        });
      }
    }
  }, [stream.hasNewArbitrages, stream.latestArbitrage]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-zinc-950 dark:to-zinc-900 p-4 transition-colors">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center py-8 relative">
          {/* Theme Toggle */}
          <div className="absolute top-0 right-0">
            <ThemeToggle />
          </div>
          
          <div className="flex items-center justify-center gap-4 mb-4">
            <h1 className="text-4xl font-bold text-gray-900 dark:text-zinc-100">Arbitráž Detektor</h1>
            
            {/* Connection Status Indicator */}
            <div className="flex items-center gap-2">
              {stream.isConnected ? (
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Wifi className="h-6 w-6 text-green-500" />
                    {stream.connectionQuality === 'excellent' && (
                      <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
                    )}
                    {stream.connectionQuality === 'good' && (
                      <div className="absolute -top-1 -right-1 w-3 h-3 bg-yellow-500 rounded-full animate-pulse"></div>
                    )}
                    {stream.connectionQuality === 'poor' && (
                      <div className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
                    )}
                  </div>
                  <Badge 
                    variant={stream.connectionQuality === 'excellent' ? 'default' : 'secondary'}
                    className="text-xs"
                  >
                    {stream.connectionQuality === 'excellent' && 'Připojeno'}
                    {stream.connectionQuality === 'good' && 'Stabilní'}
                    {stream.connectionQuality === 'poor' && 'Nestabilní'}
                  </Badge>
                </div>
              ) : stream.isConnecting ? (
                <div className="flex items-center gap-2">
                  <Activity className="h-6 w-6 text-yellow-500 animate-spin" />
                  <Badge variant="outline" className="text-xs">
                    Připojování...
                  </Badge>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <WifiOff className="h-6 w-6 text-gray-400" />
                  <Badge variant="outline" className="text-xs">
                    Odpojeno
                  </Badge>
                </div>
              )}
              
              {stream.reconnectAttempts > 0 && (
                <Badge variant="destructive" className="text-xs">
                  Reconnect: {stream.reconnectAttempts}/10
                </Badge>
              )}
            </div>
          </div>
          
          <p className="text-lg text-gray-600 dark:text-zinc-400">Detekce měnových arbitrážních příležitostí pomocí Bellman-Ford algoritmu</p>
          
          {/* Additional Status Info */}
          {(stream.lastUpdate || stream.ratesCount > 0) && (
            <div className="flex justify-center gap-4 mt-2 text-sm text-gray-500 dark:text-zinc-500">
              {stream.ratesCount > 0 && (
                <span>{stream.ratesCount} live kurzů</span>
              )}
              {stream.lastUpdate && (
                <span>
                  Poslední aktualizace: {stream.lastUpdate.toLocaleTimeString('cs-CZ')}
                </span>
              )}
              {stream.hasNewArbitrages && (
                <Badge variant="default" className="text-xs animate-pulse">
                  Nové arbitráže!
                </Badge>
              )}
            </div>
          )}
        </div>

        {/* Data Source Selection */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Search className="h-5 w-5" />
              Zdroj dat
            </CardTitle>
            <CardDescription>
              Vyberte zdroj dat pro detekci arbitráže
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <RadioGroup value={dataSource} onValueChange={(value: DataSource) => setDataSource(value)}>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="manual" id="manual" />
                <Label htmlFor="manual" className="text-sm font-medium">
                  Manuální zadávání kurzů
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="binance" id="binance" />
                <Label htmlFor="binance" className="text-sm font-medium">
                  Binance Live Data
                </Label>
              </div>
            </RadioGroup>

            {/* Binance Data Source Controls */}
            {dataSource === 'binance' && (
              <div className="space-y-4 p-4 bg-blue-50 dark:bg-blue-950/20 rounded-lg border">

                {/* Binance Data Info */}
                {(binanceDataInfo.totalPairs > 0 || binanceDataInfo.loading) && (
                  <div className="space-y-2">
                    <h4 className="text-sm font-medium">Informace o datech</h4>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                      <div className="space-y-1">
                        <p className="text-gray-500">Celkem párů</p>
                        <p className="font-mono">{binanceDataInfo.loading ? '...' : binanceDataInfo.totalPairs}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-gray-500">Zpracováno</p>
                        <p className="font-mono">{binanceDataInfo.loading ? '...' : binanceDataInfo.processedSymbols}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-gray-500">Přeskočeno</p>
                        <p className="font-mono">{binanceDataInfo.loading ? '...' : binanceDataInfo.skippedSymbols}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-gray-500">Cache</p>
                        <Badge variant={binanceDataInfo.cached ? "default" : "outline"} className="text-xs">
                          {binanceDataInfo.loading ? '...' : (binanceDataInfo.cached ? 'Ano' : 'Ne')}
                        </Badge>
                      </div>
                    </div>
                    {!binanceDataInfo.loading && (
                      <p className="text-xs text-gray-500">
                        Poslední aktualizace: {binanceDataInfo.timestamp.toLocaleString('cs-CZ')}
                      </p>
                    )}
                  </div>
                )}

                {/* Load & Analyze Button */}
                <Button 
                  onClick={runArbitrageDetection} 
                  disabled={binanceDataInfo.loading}
                  className="w-full"
                >
                  {binanceDataInfo.loading ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Search className="h-4 w-4 mr-2" />
                  )}
                  {binanceDataInfo.loading ? 'Načítání dat z Binance...' : 'Načíst data a analyzovat'}
                </Button>
                
                {/* Binance Data Table */}
                <BinanceDataTable isVisible={true} />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Algorithm Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Nastavení algoritmu
            </CardTitle>
            <CardDescription>
              Konfigurace parametrů pro Bellman-Ford algoritmus
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Settings Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              
              {/* Max Iterations */}
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <label className="text-sm font-medium">Max iterace</label>
                  <Badge variant="outline">{settings.maxIterations}</Badge>
                </div>
                <Slider
                  value={[settings.maxIterations]}
                  onValueChange={(value) => setSettings(prev => ({ ...prev, maxIterations: value[0] }))}
                  max={50}
                  min={1}
                  step={1}
                  className="w-full"
                />
                <p className="text-xs text-gray-500">Počet iterací algoritmu (1-50)</p>
              </div>

              {/* Min Profit Threshold */}
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <label className="text-sm font-medium">Min. profit</label>
                  <Badge variant="outline">{settings.minProfitThreshold}%</Badge>
                </div>
                <Slider
                  value={[settings.minProfitThreshold]}
                  onValueChange={(value) => setSettings(prev => ({ ...prev, minProfitThreshold: value[0] }))}
                  max={5}
                  min={0}
                  step={0.1}
                  className="w-full"
                />
                <p className="text-xs text-gray-500">Minimální profit pro detekci (0-5%)</p>
              </div>

              {/* Max Path Length */}
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <label className="text-sm font-medium">Max. délka cesty</label>
                  <Badge variant="outline">{settings.maxPathLength}</Badge>
                </div>
                <Slider
                  value={[settings.maxPathLength]}
                  onValueChange={(value) => setSettings(prev => ({ ...prev, maxPathLength: value[0] }))}
                  max={6}
                  min={2}
                  step={1}
                  className="w-full"
                />
                <p className="text-xs text-gray-500">Maximální délka arbitrážní cesty (2-6)</p>
              </div>
            </div>

            {/* Currency Selection and Controls */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              
              {/* Currency Selection */}
              <div className="space-y-3">
                <label className="text-sm font-medium">Měnové páry</label>
                <Select 
                  value={settings.selectedCurrencies.join(',')} 
                  onValueChange={(value) => {
                    const currencies = value ? value.split(',') : [];
                    setSettings(prev => ({ ...prev, selectedCurrencies: currencies }));
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Vyberte měny">
                      {settings.selectedCurrencies.length > 0 
                        ? `${settings.selectedCurrencies.length} vybraných měn`
                        : "Vyberte měny"
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {availableCurrencies.loading ? (
                      <SelectItem value="loading" disabled>Načítání měn...</SelectItem>
                    ) : availableCurrencies.base.length > 0 ? (
                      <>
                        {/* Popular currencies first */}
                        <SelectItem value="BTC,ETH,USDT,BNB,USDC">Top 5 měn</SelectItem>
                        <SelectItem value="BTC,ETH,USDT,BNB,USDC,ADA,DOT,SOL">Top 8 měn</SelectItem>
                        <SelectItem value="BTC,ETH,USDT,BNB,USDC,ADA,DOT,SOL,MATIC,AVAX">Top 10 měn</SelectItem>
                        <SelectItem value={availableCurrencies.base.filter(c => ['USDT', 'BTC', 'ETH', 'BNB', 'USDC'].includes(c)).join(',') || 'USDT,BTC,ETH'}>
                          Hlavní quote měny
                        </SelectItem>
                        <SelectItem value={availableCurrencies.base.slice(0, 20).join(',') || 'BTC,ETH,USDT'}>
                          Top 20 měn z Binance
                        </SelectItem>
                        <SelectItem value={availableCurrencies.base.join(',') || 'BTC,ETH,USDT'}>
                          Všechny měny ({availableCurrencies.base.length})
                        </SelectItem>
                      </>
                    ) : (
                      <SelectItem value="empty" disabled>Žádné měny k dispozici</SelectItem>
                    )}
                  </SelectContent>
                </Select>
                <div className="flex flex-wrap gap-1">
                  {settings.selectedCurrencies.map(currency => (
                    <Badge key={currency} variant="secondary" className="text-xs">
                      {currency}
                    </Badge>
                  ))}
                </div>
              </div>

              {/* Auto-refresh and Controls */}
              <div className="space-y-4">
                {dataSource === 'manual' ? (
                  <div className="flex items-center justify-between">
                    <div>
                      <label className="text-sm font-medium">Auto-refresh</label>
                      <p className="text-xs text-gray-500">Automatická detekce každých 5s</p>
                    </div>
                    <Switch
                      checked={settings.autoRefresh}
                      onCheckedChange={(checked) => setSettings(prev => ({ ...prev, autoRefresh: checked }))}
                    />
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <div>
                      <label className="text-sm font-medium">Continuous Monitoring</label>
                      <p className="text-xs text-gray-500">Real-time stream s automatickou detekcí</p>
                    </div>
                    <Switch
                      checked={isRealTimeActive}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          startRealTimeDetection();
                        } else {
                          stopRealTimeDetection();
                        }
                      }}
                    />
                  </div>
                )}

                {/* Detection Controls */}
                <div className="flex gap-2">
                  {dataSource === 'manual' ? (
                    <Button 
                      onClick={() => detectArbitrage(false)} 
                      disabled={isAnalyzing || (exchangeRates.length < 3 && !isRealTimeActive)}
                      className="flex-1"
                    >
                      {isAnalyzing ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Search className="h-4 w-4 mr-2" />
                      )}
                      {isAnalyzing ? 'Analyzuji...' : 'Detekovat arbitráž'}
                    </Button>
                  ) : (
                    <Button 
                      onClick={runArbitrageDetection} 
                      disabled={binanceDataInfo.loading || isRealTimeActive}
                      className="flex-1"
                    >
                      {binanceDataInfo.loading ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Search className="h-4 w-4 mr-2" />
                      )}
                      {binanceDataInfo.loading ? 'Načítání...' : 'Single-shot analýza'}
                    </Button>
                  )}
                  
                  {dataSource === 'manual' && (
                    !isRealTimeActive ? (
                      <Button 
                        onClick={startRealTimeDetection}
                        variant="outline"
                        className="flex items-center gap-2"
                        disabled={stream.isConnecting}
                      >
                        {stream.isConnecting ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Play className="h-4 w-4" />
                        )}
                        Real-time
                      </Button>
                    ) : (
                      <Button 
                        onClick={stopRealTimeDetection}
                        variant="outline"
                        className="flex items-center gap-2"
                      >
                        <Square className="h-4 w-4" />
                        Stop
                      </Button>
                    )
                  )}
                </div>

                {/* Real-time Status */}
                {isRealTimeActive && (
                  <div className="flex items-center gap-2 text-sm">
                    <div className={`w-2 h-2 rounded-full animate-pulse ${
                      stream.isConnected ? 'bg-green-500' : 'bg-yellow-500'
                    }`}></div>
                    <span className={stream.isConnected ? 'text-green-600' : 'text-yellow-600'}>
                      {stream.isConnected ? 'Real-time aktivní' : 'Připojování...'}
                    </span>
                    {realTimeData && (
                      <Badge variant="outline" className="ml-2">
                        {realTimeData.totalPairs} párů
                      </Badge>
                    )}
                    {stream.needsAttention && (
                      <Badge variant="destructive" className="ml-2 text-xs">
                        Pozor
                      </Badge>
                    )}
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Algorithm Debug Monitor */}
        <AlgorithmDebug 
          isRunning={isAnalyzing || isRealTimeActive}
          onToggleDebug={(enabled) => {
            setIsDebugEnabled(enabled);
          }}
        />

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {/* Left Column - Forms and Tables */}
          <div className="space-y-6">
            {/* Exchange Rate Input - Only show for manual data source */}
            {dataSource === 'manual' && (
              <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5" />
              Přidat směnný kurz
            </CardTitle>
            <CardDescription>
              Zadejte směnné kurzy mezi různými měnami pro analýzu arbitráže
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Výchozí měna</label>
                <Input
                  placeholder="USD"
                  value={newRate.from}
                  onChange={(e) => setNewRate(prev => ({ ...prev, from: e.target.value }))}
                  className="uppercase"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Cílová měna</label>
                <Input
                  placeholder="EUR"
                  value={newRate.to}
                  onChange={(e) => setNewRate(prev => ({ ...prev, to: e.target.value }))}
                  className="uppercase"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Kurz</label>
                <Input
                  type="number"
                  step="any"
                  placeholder="0.85"
                  value={newRate.rate}
                  onChange={(e) => setNewRate(prev => ({ ...prev, rate: e.target.value }))}
                />
              </div>
              <div className="flex items-end">
                <Button onClick={addExchangeRate} className="w-full">
                  <Plus className="h-4 w-4 mr-2" />
                  Přidat
                </Button>
              </div>
            </div>

            {errors.length > 0 && (
              <Alert className="mt-4 border-red-200 bg-red-50">
                <AlertCircle className="h-4 w-4 text-red-600" />
                <AlertDescription className="text-red-800">
                  <ul className="list-disc list-inside">
                    {errors.map((error, index) => (
                      <li key={index}>{error}</li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
            )}

        {/* Exchange Rates Table - Only show for manual data source */}
        {dataSource === 'manual' && exchangeRates.length > 0 && (
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle>Směnné kurzy ({exchangeRates.length})</CardTitle>
                  <CardDescription>Aktuálně zadané kurzy pro analýzu</CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button onClick={() => detectArbitrage(false)} disabled={isAnalyzing || exchangeRates.length < 3}>
                    <Search className="h-4 w-4 mr-2" />
                    {isAnalyzing ? 'Analyzuji...' : 'Detekovat arbitráž'}
                  </Button>
                  <Button variant="outline" onClick={clearAllRates}>
                    <Trash2 className="h-4 w-4 mr-2" />
                    Vymazat vše
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Z</TableHead>
                      <TableHead>Do</TableHead>
                      <TableHead>Kurz</TableHead>
                      <TableHead>Čas</TableHead>
                      <TableHead className="w-16">Akce</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {exchangeRates.map((rate, index) => (
                      <TableRow key={index}>
                        <TableCell className="font-mono font-medium">{rate.from}</TableCell>
                        <TableCell className="font-mono font-medium">{rate.to}</TableCell>
                        <TableCell className="font-mono">{rate.rate.toFixed(6)}</TableCell>
                        <TableCell className="text-sm text-gray-500">
                          {rate.timestamp.toLocaleString('cs-CZ')}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removeExchangeRate(index)}
                            className="text-red-600 hover:text-red-800"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Arbitrage Results */}
        {arbitrageResult && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Search className="h-5 w-5" />
                Výsledky analýzy arbitráže
              </CardTitle>
              <CardDescription>
                Analýza dokončena v {arbitrageResult.timestamp.toLocaleString('cs-CZ')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {arbitrageResult.cycles.length === 0 ? (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    Žádné arbitrážní příležitosti nebyly nalezeny v zadaných směnných kurzech.
                  </AlertDescription>
                </Alert>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center gap-4">
                    <Badge variant="secondary" className="text-lg px-3 py-1">
                      {arbitrageResult.totalOpportunities} příležitostí nalezeno
                    </Badge>
                    {arbitrageResult.bestOpportunity && (
                      <Badge variant="default" className="text-lg px-3 py-1">
                        Nejlepší: {arbitrageResult.bestOpportunity.profitPercentage.toFixed(4)}%
                      </Badge>
                    )}
                  </div>

                  <div className="space-y-3">
                    {arbitrageResult.cycles.map((cycle, index) => (
                      <Card key={index} className="border-l-4 border-l-green-500">
                        <CardContent className="pt-4">
                          <div className="flex justify-between items-start mb-2">
                            <h4 className="font-medium text-lg">
                              Příležitost #{index + 1}
                            </h4>
                            <Badge 
                              variant={cycle.profitPercentage > 1 ? "default" : "secondary"}
                              className="text-sm"
                            >
                              +{cycle.profitPercentage.toFixed(4)}%
                            </Badge>
                          </div>
                          
                          <div className="space-y-2">
                            <div>
                              <span className="text-sm font-medium text-gray-600">Cyklus měn:</span>
                              <div className="font-mono text-lg mt-1">
                                {cycle.currencies.join(' → ')} → {cycle.currencies[0]}
                              </div>
                            </div>
                            
                            <div>
                              <span className="text-sm font-medium text-gray-600">Cesta směn:</span>
                              <div className="font-mono text-sm mt-1 text-gray-700">
                                {cycle.rates.map((rate, i) => (
                                  <span key={i}>
                                    {rate.from}→{rate.to} ({rate.rate.toFixed(6)})
                                    {i < cycle.rates.length - 1 ? ', ' : ''}
                                  </span>
                                ))}
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}
          </div>

          {/* Middle Column - Graph Visualization */}
          <div className="xl:col-span-2 space-y-6">
            <CurrencyGraph 
              exchangeRates={exchangeRates}
              arbitrageResult={arbitrageResult}
              width={800}
              height={600}
            />
          </div>
        </div>

        {/* Debug Panel for Exchange Rates */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Debug Panel - Exchange Rates Data
            </CardTitle>
            <CardDescription>
              Real-time information about data flow: Binance API → Frontend → UI
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <h4 className="text-sm font-medium">Načtené Exchange Rates</h4>
                <p className="text-2xl font-mono font-bold text-blue-600">
                  {dataSource === 'binance' ? 
                    (binanceDataInfo.totalPairs * 2) : // Each pair generates 2 exchange rates (bid/ask)
                    exchangeRates.length
                  }
                </p>
                <p className="text-xs text-gray-500">
                  {dataSource === 'binance' ? 
                    `${binanceDataInfo.totalPairs} párů × 2 = ${binanceDataInfo.totalPairs * 2} rates` :
                    'Manuálně zadané kurzy'
                  }
                </p>
              </div>
              
              <div className="space-y-2">
                <h4 className="text-sm font-medium">Poslední aktualizace</h4>
                <p className="text-sm font-mono">
                  {dataSource === 'binance' ? 
                    binanceDataInfo.timestamp.toLocaleString('cs-CZ') :
                    (exchangeRates.length > 0 ? 
                      exchangeRates[exchangeRates.length - 1].timestamp.toLocaleString('cs-CZ') :
                      'Žádná data'
                    )
                  }
                </p>
                <p className="text-xs text-gray-500">
                  Cache: {dataSource === 'binance' ? (binanceDataInfo.cached ? 'Ano' : 'Ne') : 'N/A'}
                </p>
              </div>
              
              <div className="space-y-2">
                <h4 className="text-sm font-medium">Data Flow Status</h4>
                <div className="flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-full ${
                    (dataSource === 'binance' && binanceDataInfo.totalPairs > 0) || 
                    (dataSource === 'manual' && exchangeRates.length > 0) ? 
                    'bg-green-500' : 'bg-gray-300'
                  }`}></div>
                  <span className="text-sm">
                    {(dataSource === 'binance' && binanceDataInfo.totalPairs > 0) || 
                     (dataSource === 'manual' && exchangeRates.length > 0) ? 
                     'Data dostupná' : 'Žádná data'}
                  </span>
                </div>
                <Badge variant={
                  (dataSource === 'binance' && binanceDataInfo.totalPairs > 0) || 
                  (dataSource === 'manual' && exchangeRates.length > 0) ? 
                  'default' : 'outline'
                } className="text-xs">
                  {dataSource === 'binance' ? 'Binance API' : 'Manual Input'}
                </Badge>
              </div>
            </div>
            
            {/* JSON Preview of First 5 Rates */}
            <div className="space-y-2">
              <h4 className="text-sm font-medium">První 5 Exchange Rates (JSON)</h4>
              <div className="bg-gray-50 dark:bg-gray-900 rounded-md p-3 overflow-auto max-h-64">
                <pre className="text-xs font-mono">
                  {dataSource === 'binance' && arbitrageResult?.dataSource ? 
                    JSON.stringify({
                      source: 'binance',
                      totalPairs: arbitrageResult.dataSource.totalPairs,
                      processedSymbols: arbitrageResult.dataSource.processedSymbols,
                      skippedSymbols: arbitrageResult.dataSource.skippedSymbols,
                      cached: arbitrageResult.dataSource.cached,
                      sampleMessage: 'Use /api/arbitrage GET endpoint to see actual rates'
                    }, null, 2) :
                    JSON.stringify(
                      exchangeRates.slice(0, 5).map(rate => ({
                        from: rate.from,
                        to: rate.to,
                        rate: rate.rate,
                        timestamp: rate.timestamp.toISOString()
                      })), 
                      null, 
                      2
                    )
                  }
                </pre>
              </div>
            </div>
            
            {/* Binance Integration Status */}
            <div className="border-t pt-4 space-y-2">
              <h4 className="text-sm font-medium">Binance Integration Status</h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                <div>
                  <span className="text-gray-500">Endpoint:</span>
                  <p className="font-mono">api/v3/ticker/bookTicker</p>
                </div>
                <div>
                  <span className="text-gray-500">Expected USDT pairs:</span>
                  <p className="font-mono">~400-500</p>
                </div>
                <div>
                  <span className="text-gray-500">Expected rates:</span>
                  <p className="font-mono">~800-1000</p>
                </div>
                <div>
                  <span className="text-gray-500">Symbol parsing:</span>
                  <p className="font-mono">BTCUSDT → BTC/USDT</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Monitoring Section */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {/* Arbitrage History Table */}
          <ArbitrageTable arbitrageHistory={arbitrageHistory} />
        </div>

        {/* Statistics Overview */}
        <Statistics 
          arbitrageHistory={arbitrageHistory}
          totalRuns={totalRuns}
          isRealTimeActive={isRealTimeActive}
        />

        {/* Test Data Generator - only show for manual data source */}
        <TestDataGenerator 
          dataSource={dataSource}
          onDataGenerated={(rates) => {
            setExchangeRates(rates);
            toast.success('Testovací data vygenerována!', {
              description: `Přidáno ${rates.length} směnných kurzů`,
            });
          }}
        />

      </div>
    </div>
  );
}
