'use client';

import { useEffect, useRef, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Terminal, Play, Square, Trash2 } from 'lucide-react';

export interface DebugLogEntry {
  id: string;
  timestamp: Date;
  type: 'info' | 'iteration' | 'cycle' | 'error' | 'performance';
  message: string;
  data?: unknown;
  executionTime?: number;
}

interface AlgorithmDebugProps {
  isRunning: boolean;
  onToggleDebug: (enabled: boolean) => void;
  maxIterations?: number;
  externalLogs?: DebugLogEntry[];
  onAddLog?: (entry: Omit<DebugLogEntry, 'id' | 'timestamp'>) => void;
  onClearLogs?: () => void;
}

export default function AlgorithmDebug({ 
  isRunning, 
  onToggleDebug, 
  maxIterations = 10, 
  externalLogs = [],
  onAddLog,
  onClearLogs
}: AlgorithmDebugProps) {
  const [logs, setLogs] = useState<DebugLogEntry[]>([]);
  const [isDebugEnabled, setIsDebugEnabled] = useState(false);
  const [currentIteration, setCurrentIteration] = useState(0);
  const [distances, setDistances] = useState<{ [currency: string]: number }>({});
  const logContainerRef = useRef<HTMLDivElement>(null);

  const MAX_LOGS = 100;

  const addLog = (entry: Omit<DebugLogEntry, 'id' | 'timestamp'>) => {
    const newEntry: DebugLogEntry = {
      ...entry,
      id: Math.random().toString(36).substr(2, 9),
      timestamp: new Date()
    };

    setLogs(prev => {
      const updated = [...prev, newEntry];
      return updated.slice(-MAX_LOGS); // Keep only last 100 entries
    });
    
    // Also call external callback if provided
    if (onAddLog) {
      onAddLog(entry);
    }
  };

  // Merge external logs with internal logs
  const allLogs = [...logs, ...externalLogs].sort((a, b) => 
    a.timestamp.getTime() - b.timestamp.getTime()
  ).slice(-MAX_LOGS);

  // Auto-scroll to bottom when new logs are added
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [allLogs]);

  const toggleDebug = () => {
    setIsDebugEnabled(!isDebugEnabled);
    onToggleDebug(!isDebugEnabled);
    
    if (!isDebugEnabled) {
      addLog({
        type: 'info',
        message: 'Debug monitoring zapnut'
      });
    } else {
      addLog({
        type: 'info',
        message: 'Debug monitoring vypnut'
      });
    }
  };

  const clearLogs = () => {
    setLogs([]);
    setCurrentIteration(0);
    setDistances({});
    // Clear external logs if callback is provided
    if (onClearLogs) {
      onClearLogs();
    }
  };

  // Simulate debug data when debugging is enabled (for demonstration)
  useEffect(() => {
    if (!isDebugEnabled || !isRunning) return;

    const simulateAlgorithmExecution = () => {
      const currencies = ['BTC', 'ETH', 'USDT', 'BNB', 'EUR'];
      const startTime = performance.now();
      
      addLog({
        type: 'info',
        message: 'Spuštění Bellman-Ford algoritmu',
        data: { currencies: currencies.length }
      });

      // Simulate iterations
      let iteration = 0;
      
      const runIteration = () => {
        if (iteration >= maxIterations) {
          const endTime = performance.now();
          addLog({
            type: 'performance',
            message: `Algoritmus dokončen`,
            executionTime: endTime - startTime
          });
          return;
        }

        iteration++;
        setCurrentIteration(iteration);

        // Simulate distance calculations
        const newDistances: { [key: string]: number } = {};
        currencies.forEach(currency => {
          newDistances[currency] = Math.random() * 10 - 5; // Random values between -5 and 5
        });
        setDistances(newDistances);

        addLog({
          type: 'iteration',
          message: `Iterace ${iteration}/${maxIterations}`,
          data: { distances: newDistances }
        });

        // Simulate finding cycles
        if (Math.random() > 0.7) {
          const cycleLength = Math.floor(Math.random() * 3) + 2;
          const cycleCurrencies = currencies.slice(0, cycleLength);
          addLog({
            type: 'cycle',
            message: `Detekován možný cyklus: ${cycleCurrencies.join(' → ')}`,
            data: { cycle: cycleCurrencies, profit: (Math.random() * 2).toFixed(4) }
          });
        }

        setTimeout(runIteration, 300); // Next iteration after 300ms
      };

      setTimeout(runIteration, 100); // Start first iteration after 100ms
    };

    const interval = setInterval(simulateAlgorithmExecution, 5000); // Run every 5 seconds
    return () => clearInterval(interval);
  }, [isDebugEnabled, isRunning, addLog, maxIterations]);

  const getLogTypeColor = (type: DebugLogEntry['type']) => {
    switch (type) {
      case 'info': return 'bg-blue-100 text-blue-800';
      case 'iteration': return 'bg-green-100 text-green-800';
      case 'cycle': return 'bg-orange-100 text-orange-800';
      case 'error': return 'bg-red-100 text-red-800';
      case 'performance': return 'bg-purple-100 text-purple-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getLogTypeIcon = (type: DebugLogEntry['type']) => {
    switch (type) {
      case 'iteration': return '🔄';
      case 'cycle': return '🎯';
      case 'error': return '❌';
      case 'performance': return '⚡';
      default: return 'ℹ️';
    }
  };

  return (
    <Card className="h-full">
      <CardHeader>
        <div className="flex justify-between items-center">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Terminal className="h-5 w-5" />
              Algorithm Debug Monitor
            </CardTitle>
            <CardDescription>
              Real-time monitoring Bellman-Ford algoritmu
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button
              variant={isDebugEnabled ? "default" : "outline"}
              size="sm"
              onClick={toggleDebug}
            >
              {isDebugEnabled ? <Square className="h-4 w-4 mr-1" /> : <Play className="h-4 w-4 mr-1" />}
              {isDebugEnabled ? 'Stop' : 'Start'}
            </Button>
            <Button variant="outline" size="sm" onClick={clearLogs}>
              <Trash2 className="h-4 w-4 mr-1" />
              Clear
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {/* Status Bar */}
        <div className="px-6 py-3 border-b bg-gray-50 flex justify-between items-center">
          <div className="flex gap-4 text-sm">
            <div className="flex items-center gap-1">
              <div className={`w-2 h-2 rounded-full ${isDebugEnabled ? 'bg-green-500' : 'bg-gray-400'}`}></div>
              <span>Debug: {isDebugEnabled ? 'Zapnuto' : 'Vypnuto'}</span>
            </div>
            {currentIteration > 0 && (
              <Badge variant="outline">Iterace: {currentIteration}</Badge>
            )}
            <Badge variant="outline">{allLogs.length} logů</Badge>
          </div>
        </div>

        {/* Distances Display */}
        {Object.keys(distances).length > 0 && (
          <div className="px-6 py-3 border-b bg-blue-50">
            <h4 className="text-sm font-medium mb-2">Aktuální distances:</h4>
            <div className="grid grid-cols-3 gap-2 text-xs">
              {Object.entries(distances).map(([currency, distance]) => (
                <div key={currency} className="flex justify-between">
                  <span className="font-mono">{currency}:</span>
                  <span className={`font-mono ${distance < 0 ? 'text-red-600' : 'text-green-600'}`}>
                    {distance.toFixed(3)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Log Display */}
        <div 
          ref={logContainerRef}
          className="h-80 overflow-y-auto"
        >
          {allLogs.length === 0 ? (
            <div className="flex items-center justify-center h-full text-gray-500">
              <div className="text-center">
                <Terminal className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">Žádné debug logy</p>
                <p className="text-xs">Zapněte debug monitoring pro zobrazení logů</p>
              </div>
            </div>
          ) : (
            <div className="p-4 space-y-2">
              {allLogs.map((log) => (
                <div key={log.id} className="flex items-start gap-3 text-sm">
                  <span className="text-xs text-gray-400 mt-0.5 w-16 shrink-0">
                    {log.timestamp.toLocaleTimeString('cs-CZ', { 
                      hour12: false, 
                      hour: '2-digit', 
                      minute: '2-digit', 
                      second: '2-digit' 
                    })}
                  </span>
                  
                  <Badge 
                    variant="outline" 
                    className={`text-xs shrink-0 ${getLogTypeColor(log.type)}`}
                  >
                    {getLogTypeIcon(log.type)} {log.type}
                  </Badge>
                  
                  <div className="flex-1 min-w-0">
                    <div className="font-mono text-xs">{log.message}</div>
                    
                    {log.executionTime && (
                      <div className="text-xs text-purple-600 mt-1">
                        ⚡ {log.executionTime.toFixed(2)}ms
                      </div>
                    )}
                    
                    {log.data ? (
                      <details className="mt-1">
                        <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-700">
                          Zobrazit data
                        </summary>
                        <pre className="text-xs bg-gray-100 p-2 mt-1 rounded overflow-x-auto">
                          {JSON.stringify(log.data, null, 2)}
                        </pre>
                      </details>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}