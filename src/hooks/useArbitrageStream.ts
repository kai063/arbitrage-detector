'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { ArbitrageResult } from '@/lib/algorithms/arbitrage-dual-algorithm';
import { ExchangeRate } from '@/lib/types';
import { DebugLogEntry } from '@/components/AlgorithmDebug';

interface StreamState {
  isConnected: boolean;
  isConnecting: boolean;
  lastError: string | null;
  reconnectAttempts: number;
  currentRates: ExchangeRate[];
  detectedArbitrages: ArbitrageResult[];
  algorithmLogs: DebugLogEntry[];
  lastUpdate: Date | null;
  connectionQuality: 'excellent' | 'good' | 'poor' | 'disconnected';
}

interface StreamMessage {
  type: 'rates' | 'arbitrage' | 'error' | 'status' | 'log';
  data: unknown;
  timestamp: string;
}

interface UseArbitrageStreamOptions {
  autoConnect?: boolean;
  maxReconnectAttempts?: number;
  reconnectDelay?: number;
  enableNotifications?: boolean;
  enableLogs?: boolean;
}

export function useArbitrageStream(options: UseArbitrageStreamOptions = {}) {
  const {
    autoConnect = false,
    maxReconnectAttempts = parseInt(process.env.NEXT_PUBLIC_MAX_RECONNECT_ATTEMPTS || '10'),
    reconnectDelay = parseInt(process.env.NEXT_PUBLIC_RECONNECT_DELAY || '3000'),
    enableNotifications = process.env.NEXT_PUBLIC_ENABLE_NOTIFICATIONS === 'true',
    enableLogs = false
  } = options;

  const [state, setState] = useState<StreamState>({
    isConnected: false,
    isConnecting: false,
    lastError: null,
    reconnectAttempts: 0,
    currentRates: [],
    detectedArbitrages: [],
    algorithmLogs: [],
    lastUpdate: null,
    connectionQuality: 'disconnected'
  });

  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const heartbeatRef = useRef<NodeJS.Timeout | null>(null);
  const lastHeartbeatRef = useRef<Date>(new Date());

  // Audio notification
  const playNotificationSound = useCallback(() => {
    if (!enableNotifications) return;
    
    try {
      // Create audio context and play notification sound
      const audioContext = new (window.AudioContext || (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext || AudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
      oscillator.frequency.setValueAtTime(600, audioContext.currentTime + 0.1);
      oscillator.frequency.setValueAtTime(800, audioContext.currentTime + 0.2);
      
      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
      
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.3);
    } catch (error) {
      console.warn('Could not play notification sound:', error);
    }
  }, [enableNotifications]);

  // Desktop notification
  const showDesktopNotification = useCallback((arbitrage: ArbitrageResult) => {
    if (!enableNotifications || !('Notification' in window)) return;

    if (Notification.permission === 'granted') {
      const bestProfit = arbitrage.bestOpportunity?.profitPercentage || 0;
      const notification = new Notification('Arbitráž detekována!', {
        body: `Nalezena příležitost s ${bestProfit.toFixed(4)}% profitem`,
        icon: '/favicon.ico',
        badge: '/favicon.ico',
        tag: 'arbitrage-alert'
      });

      setTimeout(() => notification.close(), 5000);
    } else if (Notification.permission !== 'denied') {
      Notification.requestPermission();
    }
  }, [enableNotifications]);

  // Add log entry
  const addLog = useCallback((entry: Omit<DebugLogEntry, 'id' | 'timestamp'>) => {
    if (!enableLogs) return;

    const newEntry: DebugLogEntry = {
      ...entry,
      id: Math.random().toString(36).substr(2, 9),
      timestamp: new Date()
    };

    setState(prev => ({
      ...prev,
      algorithmLogs: [...prev.algorithmLogs, newEntry].slice(-100) // Keep last 100 logs
    }));
  }, [enableLogs]);

  // Calculate connection quality
  const calculateConnectionQuality = useCallback(() => {
    const now = new Date();
    const timeSinceHeartbeat = now.getTime() - lastHeartbeatRef.current.getTime();
    
    if (timeSinceHeartbeat < 5000) return 'excellent';
    if (timeSinceHeartbeat < 15000) return 'good';
    if (timeSinceHeartbeat < 30000) return 'poor';
    return 'disconnected';
  }, []);

  // Handle incoming messages
  const handleMessage = useCallback((event: MessageEvent) => {
    try {
      const message: StreamMessage = JSON.parse(event.data);
      lastHeartbeatRef.current = new Date();

      setState(prev => ({
        ...prev,
        lastUpdate: new Date(),
        connectionQuality: 'excellent'
      }));

      switch (message.type) {
        case 'rates':
          setState(prev => ({
            ...prev,
            currentRates: (message.data as { rates: ExchangeRate[] }).rates || []
          }));
          
          addLog({
            type: 'info',
            message: `Aktualizovány kurzy: ${(message.data as { totalPairs: number }).totalPairs} párů`
          });
          break;

        case 'arbitrage':
          const arbitrageData = message.data as ArbitrageResult;
          
          setState(prev => ({
            ...prev,
            detectedArbitrages: [...prev.detectedArbitrages, arbitrageData].slice(-50)
          }));

          addLog({
            type: 'cycle',
            message: `Detekováno ${arbitrageData.cycles.length} arbitrážních cyklů`,
            data: { 
              cycles: arbitrageData.cycles.length,
              bestProfit: arbitrageData.bestOpportunity?.profitPercentage 
            }
          });

          // Notify for high-profit arbitrage
          if (arbitrageData.bestOpportunity && arbitrageData.bestOpportunity.profitPercentage > 1) {
            playNotificationSound();
            showDesktopNotification(arbitrageData);
          }
          break;

        case 'error':
          setState(prev => ({
            ...prev,
            lastError: (message.data as { error: string }).error
          }));
          
          addLog({
            type: 'error',
            message: `Chyba: ${(message.data as { error: string }).error}`
          });
          break;

        case 'status':
          addLog({
            type: 'info',
            message: (message.data as { message: string }).message || 'Status update'
          });
          break;

        case 'log':
          if ((message.data as { entry: DebugLogEntry }).entry) {
            addLog((message.data as { entry: DebugLogEntry }).entry);
          }
          break;
      }
    } catch (error) {
      console.error('Error parsing SSE message:', error);
      addLog({
        type: 'error',
        message: 'Chyba při parsování zprávy ze serveru'
      });
    }
  }, [addLog, playNotificationSound, showDesktopNotification]);

  // Connect to stream
  const connect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    setState(prev => ({
      ...prev,
      isConnecting: true,
      lastError: null
    }));

    addLog({
      type: 'info',
      message: 'Připojování k real-time streamu...'
    });

    try {
      const eventSource = new EventSource('/api/arbitrage/stream', {
        withCredentials: false
      });

      eventSource.onopen = () => {
        setState(prev => ({
          ...prev,
          isConnected: true,
          isConnecting: false,
          reconnectAttempts: 0,
          connectionQuality: 'excellent'
        }));

        lastHeartbeatRef.current = new Date();
        
        addLog({
          type: 'info',
          message: 'Úspěšně připojeno k real-time streamu'
        });
      };

      eventSource.onmessage = handleMessage;

      eventSource.onerror = (error) => {
        console.error('EventSource error:', error);
        
        setState(prev => ({
          ...prev,
          isConnected: false,
          isConnecting: false,
          lastError: 'Chyba připojení',
          connectionQuality: 'disconnected'
        }));

        addLog({
          type: 'error',
          message: 'Ztraceno spojení se serverem'
        });

        // Schedule reconnect
        setTimeout(() => {
          if (state.reconnectAttempts < maxReconnectAttempts) {
            setState(prev => ({
              ...prev,
              reconnectAttempts: prev.reconnectAttempts + 1
            }));
            connect();
          }
        }, reconnectDelay);
      };

      eventSourceRef.current = eventSource;

      // Start heartbeat monitoring
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
      }
      
      heartbeatRef.current = setInterval(() => {
        const quality = calculateConnectionQuality();
        setState(prev => ({
          ...prev,
          connectionQuality: quality
        }));
      }, 5000);

    } catch {
      setState(prev => ({
        ...prev,
        isConnecting: false,
        lastError: 'Nepodařilo se vytvořit připojení'
      }));

      addLog({
        type: 'error',
        message: 'Nepodařilo se vytvořit připojení'
      });

      setTimeout(() => {
        if (state.reconnectAttempts < maxReconnectAttempts) {
          setState(prev => ({
            ...prev,
            reconnectAttempts: prev.reconnectAttempts + 1
          }));
          connect();
        }
      }, reconnectDelay);
    }
  }, [handleMessage, addLog, calculateConnectionQuality, state.reconnectAttempts, maxReconnectAttempts, reconnectDelay]);


  // Disconnect
  const disconnect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }

    setState(prev => ({
      ...prev,
      isConnected: false,
      isConnecting: false,
      connectionQuality: 'disconnected'
    }));

    addLog({
      type: 'info',
      message: 'Odpojeno od real-time streamu'
    });
  }, [addLog]);

  // Clear logs
  const clearLogs = useCallback(() => {
    setState(prev => ({
      ...prev,
      algorithmLogs: []
    }));
  }, []);

  // Auto-connect on mount
  useEffect(() => {
    if (autoConnect) {
      connect();
    }

    // Request notification permission on mount
    if (enableNotifications && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }

    return () => {
      disconnect();
    };
  }, [autoConnect, enableNotifications, connect, disconnect]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return {
    // State
    ...state,
    
    // Actions
    connect,
    disconnect,
    clearLogs,
    
    // Computed
    hasNewArbitrages: state.detectedArbitrages.length > 0,
    latestArbitrage: state.detectedArbitrages[state.detectedArbitrages.length - 1] || null,
    ratesCount: state.currentRates.length,
    
    // Status helpers
    isHealthy: state.isConnected && state.connectionQuality !== 'poor',
    needsAttention: state.connectionQuality === 'poor' || state.lastError !== null
  };
}