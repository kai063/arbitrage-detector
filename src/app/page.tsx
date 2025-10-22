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
import { Progress } from '@/components/ui/progress';
import { ExchangeRate, ArbitrageResult } from '@/lib/algorithms/arbitrage-dual-algorithm';
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
  algorithm: 'bellman-ford' | 'floyd-warshall'; 
  bellmanFordStartCurrencies: string[];         
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

// Currency Pair Display Component
function CurrencyPairDisplay({ selectedCurrencies }: { 
  selectedCurrencies: string[]
}) {
  const [showAllCurrencies, setShowAllCurrencies] = useState(false);
  const INITIAL_DISPLAY_COUNT = 5;
  
  if (selectedCurrencies.length === 0) return null;
  
  const displayedCurrencies = showAllCurrencies 
    ? selectedCurrencies 
    : selectedCurrencies.slice(0, INITIAL_DISPLAY_COUNT);
  
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1">
        {displayedCurrencies.map(currency => (
          <Badge key={currency} variant="secondary" className="text-xs">
            {currency}
          </Badge>
        ))}
      </div>
      
      {selectedCurrencies.length > INITIAL_DISPLAY_COUNT && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowAllCurrencies(!showAllCurrencies)}
          className="text-xs h-6"
        >
          {showAllCurrencies 
            ? `Zobrazit méně (prvních ${INITIAL_DISPLAY_COUNT})`
            : `Zobrazit všech ${selectedCurrencies.length} měn`
          }
        </Button>
      )}
    </div>
  );
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
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [debugLogs, setDebugLogs] = useState<import('@/components/AlgorithmDebug').DebugLogEntry[]>([]);

  // Add debug log function
  const addDebugLog = useCallback((entry: Omit<import('@/components/AlgorithmDebug').DebugLogEntry, 'id' | 'timestamp'>) => {
    if (!isDebugEnabled) return;
    
    const newEntry = {
      ...entry,
      id: Math.random().toString(36).substr(2, 9),
      timestamp: new Date()
    };

    setDebugLogs(prev => [...prev, newEntry].slice(-100)); // Keep last 100 logs
  }, [isDebugEnabled]);

  // Clear debug logs function
  const clearDebugLogs = useCallback(() => {
    setDebugLogs([]);
  }, []);
  
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
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
    maxIterations: 100,
    minProfitThreshold: 0,
    maxPathLength: 4,
    selectedCurrencies: [],
    autoRefresh: false,
    algorithm: 'floyd-warshall',
    bellmanFordStartCurrencies: []
  });

  // Note: Removed optimal calculation function to respect user settings

// Note: Removed auto-adjustment of max iterations to respect user settings

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
    console.log('🚀 FRONTEND DEBUG - detectArbitrage called:', {
      useRealTime,
      dataSource,
      exchangeRatesCount: exchangeRates.length,
      settings: {
        algorithm: settings.algorithm,
        maxIterations: settings.maxIterations,
        selectedCurrencies: settings.selectedCurrencies.length,
        selectedCurrenciesList: settings.selectedCurrencies
      }
    });

    // Check data source and requirements
    if (dataSource === 'manual' && !useRealTime && exchangeRates.length < 3) {
      console.log('❌ FRONTEND: Insufficient manual exchange rates');
      setErrors(['Pro detekci arbitráže jsou potřeba alespoň 3 směnné kurzy']);
      return;
    }

    console.log('✅ FRONTEND: Starting analysis...');
    setIsAnalyzing(true);
    setErrors([]);
    setAnalysisProgress(0);

    // Add initial debug log
    const startTime = performance.now();
    addDebugLog({
      type: 'info',
      message: `Spuštění ${dataSource === 'binance' ? 'Binance' : 'manuální'} analýzy arbitráže`,
      data: { 
        dataSource, 
        useRealTime, 
        maxIterations: settings.maxIterations,
        selectedCurrencies: settings.selectedCurrencies.length 
      }
    });

    // Simulate progress updates for single-shot analysis
    let progressInterval: NodeJS.Timeout | null = null;
    if (dataSource === 'binance' && !useRealTime) {
      progressInterval = setInterval(() => {
        setAnalysisProgress(prev => {
          const next = prev + Math.random() * 15;
          return next > 90 ? 90 : next;
        });
      }, 200);
    }

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
          minProfitThreshold: settings.minProfitThreshold / 100,
          maxPathLength: settings.maxPathLength,
          selectedCurrencies: settings.selectedCurrencies,
          useRealTimeData: useRealTime,
          algorithm: settings.algorithm,                          // ADD THIS
          bellmanFordStartCurrencies: settings.bellmanFordStartCurrencies  // ADD THIS
        }
      };

      console.log('📡 FRONTEND: Making API request to /api/arbitrage:', {
        method: 'POST',
        requestBody: {
          ...requestBody,
          exchangeRates: `${requestBody.exchangeRates.length} rates`
        }
      });

      const response = await fetch('/api/arbitrage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });

      console.log('📡 FRONTEND: API response received:', {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok
      });

      const data = await response.json();
      console.log('📡 FRONTEND: API data parsed:', {
        success: data.success,
        hasData: !!data.data,
        error: data.error,
        cyclesFound: data.data?.cycles?.length,
        executionTime: data.data?.executionTime,
        debug: data.debug
      });

      // Log detailed debug information if available
      if (data.debug) {
        console.log('🔍 SERVER DEBUG INFO:', data.debug);
        console.log('🔍 SETTINGS DETAILS:', {
          algorithm: data.debug.settingsReceived?.algorithm,
          maxIterations: data.debug.settingsReceived?.maxIterations,
          minProfitThreshold: data.debug.settingsReceived?.minProfitThreshold,
          selectedCurrencies: data.debug.settingsReceived?.selectedCurrencies?.length || 0,
          bellmanFordStartCurrencies: data.debug.settingsReceived?.bellmanFordStartCurrencies?.length || 0
        });
      }
      
      if (data.success) {
        setArbitrageResult(data.data);
        // Add to history
        setArbitrageHistory(prev => [...prev, data.data].slice(-50)); // Keep last 50 results
        setTotalRuns(prev => prev + 1);
        
        // Add debug log for successful analysis
        addDebugLog({
          type: 'info',
          message: `Analýza dokončena úspěšně`,
          data: { 
            cycles: data.data.cycles.length,
            totalOpportunities: data.data.totalOpportunities,
            bestProfit: data.data.bestOpportunity?.profitPercentage 
          }
        });

        // Add debug logs for each found cycle
        if (data.data.cycles.length > 0) {
          data.data.cycles.forEach((cycle: { currencies: string[]; profitPercentage: number; rates: { from: string; to: string; rate: number }[] }, index: number) => {
            addDebugLog({
              type: 'cycle',
              message: `Detekován arbitrážní cyklus #${index + 1}: ${cycle.currencies.join(' → ')}`,
              data: { 
                cycle: cycle.currencies,
                profit: cycle.profitPercentage,
                rates: cycle.rates 
              }
            });
          });
        }
        
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
        
        // Add debug log for error
        addDebugLog({
          type: 'error',
          message: `Chyba při analýze: ${data.error || 'Neznámá chyba'}`,
          data: { error: data.error }
        });
        
        toast.error('Chyba při analýze', {
          description: data.error || 'Neznámá chyba při detekci arbitráže',
        });
      }
    } catch (error) {
      setErrors(['Chyba při analýze arbitráže']);
      
      // Add debug log for network error
      addDebugLog({
        type: 'error',
        message: 'Síťová chyba při komunikaci se serverem',
        data: { error: error instanceof Error ? error.message : 'Unknown error' }
      });
      
      toast.error('Síťová chyba', {
        description: 'Nepodařilo se připojit k serveru',
        action: {
          label: 'Zkusit znovu',
          onClick: () => detectArbitrage(useRealTime),
        },
      });
    } finally {
      if (progressInterval) {
        clearInterval(progressInterval);
      }
      setAnalysisProgress(100);
      
      // Add performance debug log
      const endTime = performance.now();
      addDebugLog({
        type: 'performance',
        message: 'Analýza dokončena',
        executionTime: endTime - startTime
      });
      
      setTimeout(() => {
        setIsAnalyzing(false);
        setAnalysisProgress(0);
      }, 500);
    }
  }, [dataSource, exchangeRates, settings.maxIterations, settings.minProfitThreshold, settings.maxPathLength, settings.selectedCurrencies, settings.algorithm, settings.bellmanFordStartCurrencies, addDebugLog]);

  const runArbitrageDetection = useCallback(() => {
    console.log('🖱️ FRONTEND: Start button clicked - calling detectArbitrage(false)');
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
              Konfigurace parametrů pro detekci arbitráže
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Algorithm Selection */}
            <div className="space-y-3">
              <Label className="text-sm font-medium">Algoritmus</Label>
              <Select 
                value={settings.algorithm} 
                onValueChange={(value: 'bellman-ford' | 'floyd-warshall') => {
                  setSettings(prev => ({
                    ...prev,
                    algorithm: value,
                    bellmanFordStartCurrencies: value === 'bellman-ford' && prev.bellmanFordStartCurrencies.length === 0
                      ? (settings.selectedCurrencies.slice(0, 3) || ['USDT', 'BTC', 'ETH'])
                      : prev.bellmanFordStartCurrencies
                  }));
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Vyberte algoritmus" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="floyd-warshall">
                    <div className="flex flex-col">
                      <span>Floyd-Warshall</span>
                      <span className="text-xs text-gray-500">Najde všechny cykly (O(V³))</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="bellman-ford">
                    <div className="flex flex-col">
                      <span>Bellman-Ford</span>
                      <span className="text-xs text-gray-500">Hledání z vybraných bodů (O(V²E))</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Settings Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              
              {/* Max Iterations */}
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <label className="text-sm font-medium">Max iterace</label>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{settings.maxIterations}</Badge>
                    </div>
                </div>
                <Slider
                  value={[settings.maxIterations]}
                  onValueChange={(value) => setSettings(prev => ({ ...prev, maxIterations: value[0] }))}
                  max={Math.max(500, (settings.selectedCurrencies.length || availableCurrencies.base.length) * 2)}
                  min={1}
                  step={1}
                  className="w-full"
                />
                <p className="text-xs text-gray-500">
                  {settings.algorithm === 'bellman-ford'
                    ? 'Počet iterací pro Bellman-Ford algoritmus'
                    : 'Počet iterací pro Floyd-Warshall'}
                </p>
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
                  max={10}
                  min={2}
                  step={1}
                  className="w-full"
                />
                <p className="text-xs text-gray-500">Maximální délka arbitrážní cesty (2-10)</p>
              </div>
            </div>

            {/* Currency Selection and Bellman-Ford Starting Points */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              
              {/* Currency Selection - Direct Input */}
              <div className="space-y-3">
                <label className="text-sm font-medium">Vybrané měny (čárkou oddělené)</label>
                <Input
                  placeholder="např. BTC,ETH,USDT,BNB nebo ponechte prázdné pro všechny"
                  value={settings.selectedCurrencies.join(',')}
                  onChange={(e) => {
                    const input = e.target.value.trim();
                    const currencies = input ? input.split(',').map(c => c.trim().toUpperCase()).filter(c => c) : [];
                    setSettings(prev => ({ 
                      ...prev, 
                      selectedCurrencies: currencies,
                    }));
                  }}
                  className="font-mono"
                />
                <div className="text-xs text-gray-500">
                  {settings.selectedCurrencies.length === 0 
                    ? "Prázdné = použije všechny dostupné měny"
                    : `${settings.selectedCurrencies.length} měn: ${settings.selectedCurrencies.slice(0, 10).join(', ')}${settings.selectedCurrencies.length > 10 ? '...' : ''}`
                  }
                </div>
              </div>

              {/* Bellman-Ford Starting Currencies - ONLY SHOW WHEN BELLMAN-FORD IS SELECTED */}
              {settings.algorithm === 'bellman-ford' && (
                <div className="space-y-3">
                  <label className="text-sm font-medium">
                    Počáteční měny pro Bellman-Ford (čárkou oddělené)
                  </label>
                  <Input
                    placeholder="např. USDT,BTC,ETH nebo ponechte prázdné pro auto"
                    value={settings.bellmanFordStartCurrencies.join(',')}
                    onChange={(e) => {
                      const input = e.target.value.trim();
                      const currencies = input ? input.split(',').map(c => c.trim().toUpperCase()).filter(c => c) : [];
                      setSettings(prev => ({ 
                        ...prev, 
                        bellmanFordStartCurrencies: currencies 
                      }));
                    }}
                    className="font-mono"
                  />
                  <div className="text-xs text-gray-500">
                    {settings.bellmanFordStartCurrencies.length === 0 
                      ? "Prázdné = automaticky vybere rovnoměrně rozložené začínající měny"
                      : `${settings.bellmanFordStartCurrencies.length} začínajících měn: ${settings.bellmanFordStartCurrencies.join(', ')}`
                    }
                  </div>
                </div>
              )}
            </div>

            {/* Algorithm Info */}
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                {settings.algorithm === 'floyd-warshall' ? (
                  <div>
                    <strong>Floyd-Warshall:</strong> Najde všechny arbitrážní cykly najednou. 
                    Časová složitost O(V³) = {Math.pow(settings.selectedCurrencies.length || 10, 3).toLocaleString()} operací.
                  </div>
                ) : (
                  <div>
                    <strong>Bellman-Ford:</strong> Hledá cykly z {settings.bellmanFordStartCurrencies.length || 'automaticky vybraných'} počátečních bodů.
                    Rychlejší pro cílené hledání. Počet iterací je dán nastavením.
                  </div>
                )}
              </AlertDescription>
            </Alert>

            {/* Start Analysis Controls */}
            <div className="space-y-4 p-4 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/20 dark:to-indigo-950/20 rounded-lg border">
              <div className="flex flex-col sm:flex-row gap-4">
                <Button 
                  onClick={runArbitrageDetection}
                  disabled={isAnalyzing || (dataSource === 'manual' && exchangeRates.length < 3)}
                  size="lg"
                  className="flex-1"
                >
                  {isAnalyzing ? (
                    <>
                      <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                      Analyzuji...
                    </>
                  ) : (
                    <>
                      <Play className="h-5 w-5 mr-2" />
                      Spustit analýzu arbitráže
                    </>
                  )}
                </Button>
                
                {!isRealTimeActive ? (
                  <Button 
                    onClick={startRealTimeDetection}
                    variant="outline"
                    size="lg"
                    disabled={isAnalyzing}
                  >
                    <Wifi className="h-5 w-5 mr-2" />
                    Real-time
                  </Button>
                ) : (
                  <Button 
                    onClick={stopRealTimeDetection}
                    variant="destructive"
                    size="lg"
                  >
                    <Square className="h-5 w-5 mr-2" />
                    Zastavit
                  </Button>
                )}

                <div className="flex items-center space-x-2">
                  <Switch 
                    id="auto-refresh"
                    checked={settings.autoRefresh}
                    onCheckedChange={(checked) => setSettings(prev => ({ ...prev, autoRefresh: checked }))}
                  />
                  <Label htmlFor="auto-refresh" className="text-sm">
                    Auto obnovení
                  </Label>
                </div>
              </div>

              {/* Progress Bar */}
              {isAnalyzing && (
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Probíhá analýza...</span>
                    <span className="text-gray-600">{Math.round(analysisProgress)}%</span>
                  </div>
                  <Progress value={analysisProgress} className="w-full" />
                </div>
              )}

              {/* Status Information */}
              {(dataSource === 'manual' && exchangeRates.length < 3) && !isAnalyzing && (
                <Alert className="border-yellow-200 bg-yellow-50">
                  <AlertCircle className="h-4 w-4 text-yellow-600" />
                  <AlertDescription className="text-yellow-800">
                    Pro detekci arbitráže jsou potřeba alespoň 3 směnné kurzy
                  </AlertDescription>
                </Alert>
              )}

              {/* Real-time Status */}
              {realTimeData && (
                <div className="text-sm text-gray-600">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                    <span>Real-time: {realTimeData.totalPairs} párů, poslední aktualizace {realTimeData.lastUpdate.toLocaleTimeString('cs-CZ')}</span>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Algorithm Debug Monitor */}
        <AlgorithmDebug 
          isRunning={isAnalyzing || isRealTimeActive}
          onToggleDebug={(enabled) => {
            setIsDebugEnabled(enabled);
          }}
          maxIterations={settings.maxIterations}
          externalLogs={debugLogs}
          onAddLog={addDebugLog}
          onClearLogs={clearDebugLogs}
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
                      totalPairs: arbitrageResult.dataSource?.totalPairs,
                      processedSymbols: arbitrageResult.dataSource?.processedSymbols,
                      skippedSymbols: arbitrageResult.dataSource?.skippedSymbols,
                      cached: arbitrageResult.dataSource?.cached,
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
