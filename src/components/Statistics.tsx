'use client';

import { useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';
import { ArbitrageResult } from '@/lib/algorithms/arbitrage';
import { TrendingUp, Target, Clock, BarChart3 } from 'lucide-react';

interface StatisticsProps {
  arbitrageHistory: ArbitrageResult[];
  totalRuns: number;
  isRealTimeActive: boolean;
}

interface ChartDataPoint {
  time: string;
  timestamp: number;
  profit: number;
  opportunities: number;
  avgProfit: number;
}

export default function Statistics({ arbitrageHistory, totalRuns, isRealTimeActive }: StatisticsProps) {
  // Calculate statistics
  const stats = useMemo(() => {
    const allCycles = arbitrageHistory.flatMap(result => result.cycles);
    const totalOpportunities = allCycles.length;
    const totalProfit = allCycles.reduce((sum, cycle) => sum + cycle.profitPercentage, 0);
    const avgProfit = totalOpportunities > 0 ? totalProfit / totalOpportunities : 0;
    const maxProfit = totalOpportunities > 0 ? Math.max(...allCycles.map(c => c.profitPercentage)) : 0;
    const minProfit = totalOpportunities > 0 ? Math.min(...allCycles.map(c => c.profitPercentage)) : 0;
    
    // Success rate
    const successfulRuns = arbitrageHistory.filter(result => result.cycles.length > 0).length;
    const successRate = totalRuns > 0 ? (successfulRuns / totalRuns) * 100 : 0;
    
    // Recent performance (last 10 runs)
    const recentHistory = arbitrageHistory.slice(-10);
    const recentOpportunities = recentHistory.reduce((sum, result) => sum + result.cycles.length, 0);
    const recentAvgProfit = recentHistory.length > 0 
      ? recentHistory.reduce((sum, result) => {
          const resultProfit = result.cycles.reduce((s, c) => s + c.profitPercentage, 0);
          return sum + (result.cycles.length > 0 ? resultProfit / result.cycles.length : 0);
        }, 0) / recentHistory.length
      : 0;
    
    return {
      totalOpportunities,
      avgProfit,
      maxProfit,
      minProfit,
      successRate,
      recentOpportunities,
      recentAvgProfit
    };
  }, [arbitrageHistory, totalRuns]);

  // Prepare chart data
  const chartData = useMemo(() => {
    const data: ChartDataPoint[] = [];
    
    arbitrageHistory.forEach((result, index) => {
      const maxProfitInResult = result.cycles.length > 0 
        ? Math.max(...result.cycles.map(c => c.profitPercentage))
        : 0;
      
      const avgProfitInResult = result.cycles.length > 0
        ? result.cycles.reduce((sum, c) => sum + c.profitPercentage, 0) / result.cycles.length
        : 0;

      data.push({
        time: result.timestamp.toLocaleTimeString('cs-CZ', { 
          hour: '2-digit', 
          minute: '2-digit',
          second: '2-digit'
        }),
        timestamp: result.timestamp.getTime(),
        profit: maxProfitInResult,
        opportunities: result.cycles.length,
        avgProfit: avgProfitInResult
      });
    });
    
    return data.slice(-20); // Keep last 20 data points
  }, [arbitrageHistory]);

  const formatTooltip = (value: any, name: string) => {
    if (name === 'profit' || name === 'avgProfit') {
      return [`${Number(value).toFixed(4)}%`, name === 'profit' ? 'Max Profit' : 'Avg Profit'];
    }
    if (name === 'opportunities') {
      return [`${value}`, 'Příležitosti'];
    }
    return [value, name];
  };

  return (
    <div className="space-y-6">
      {/* Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Celkem běhů</p>
                <p className="text-2xl font-bold text-blue-600">{totalRuns}</p>
              </div>
              <Clock className="h-8 w-8 text-blue-500" />
            </div>
            <div className="mt-2">
              <Badge variant={isRealTimeActive ? "default" : "secondary"} className="text-xs">
                {isRealTimeActive ? 'Real-time aktivní' : 'Manuální režim'}
              </Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Nalezené arbitráže</p>
                <p className="text-2xl font-bold text-green-600">{stats.totalOpportunities}</p>
              </div>
              <Target className="h-8 w-8 text-green-500" />
            </div>
            <div className="mt-2">
              <p className="text-xs text-gray-500">
                Úspěšnost: {stats.successRate.toFixed(1)}%
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Průměrný profit</p>
                <p className="text-2xl font-bold text-purple-600">{stats.avgProfit.toFixed(3)}%</p>
              </div>
              <TrendingUp className="h-8 w-8 text-purple-500" />
            </div>
            <div className="mt-2">
              <p className="text-xs text-gray-500">
                Max: {stats.maxProfit.toFixed(3)}%
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Poslední výkon</p>
                <p className="text-2xl font-bold text-orange-600">{stats.recentOpportunities}</p>
              </div>
              <BarChart3 className="h-8 w-8 text-orange-500" />
            </div>
            <div className="mt-2">
              <p className="text-xs text-gray-500">
                Avg: {stats.recentAvgProfit.toFixed(3)}%
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Profit History Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Historie profitů</CardTitle>
            <CardDescription>
              Vývoj maximálních a průměrných profitů v čase
            </CardDescription>
          </CardHeader>
          <CardContent>
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    dataKey="time" 
                    fontSize={12}
                    tickMargin={5}
                  />
                  <YAxis 
                    fontSize={12}
                    tickFormatter={(value) => `${value}%`}
                  />
                  <Tooltip 
                    formatter={formatTooltip}
                    labelFormatter={(label) => `Čas: ${label}`}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="profit" 
                    stroke="#8b5cf6" 
                    strokeWidth={2}
                    dot={{ fill: '#8b5cf6', strokeWidth: 2, r: 3 }}
                    name="profit"
                  />
                  <Line 
                    type="monotone" 
                    dataKey="avgProfit" 
                    stroke="#06b6d4" 
                    strokeWidth={2}
                    strokeDasharray="5 5"
                    dot={{ fill: '#06b6d4', strokeWidth: 2, r: 3 }}
                    name="avgProfit"
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-64 text-gray-500">
                <div className="text-center">
                  <TrendingUp className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">Žádná data pro graf</p>
                  <p className="text-xs">Spusťte detekci pro zobrazení historických dat</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Opportunities Timeline */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Počet příležitostí</CardTitle>
            <CardDescription>
              Množství detekovaných arbitráží v jednotlivých běhách
            </CardDescription>
          </CardHeader>
          <CardContent>
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <AreaChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    dataKey="time" 
                    fontSize={12}
                    tickMargin={5}
                  />
                  <YAxis 
                    fontSize={12}
                    allowDecimals={false}
                  />
                  <Tooltip 
                    formatter={formatTooltip}
                    labelFormatter={(label) => `Čas: ${label}`}
                  />
                  <Area
                    type="monotone"
                    dataKey="opportunities"
                    stroke="#10b981"
                    fill="#10b981"
                    fillOpacity={0.3}
                    strokeWidth={2}
                    name="opportunities"
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-64 text-gray-500">
                <div className="text-center">
                  <BarChart3 className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">Žádná data pro graf</p>
                  <p className="text-xs">Spusťte detekci pro zobrazení počtu příležitostí</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Performance Summary */}
      {stats.totalOpportunities > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Souhrn výkonu</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div className="text-center p-3 bg-gray-50 rounded">
                <div className="font-semibold text-gray-600">Úspěšnost detekce</div>
                <div className="text-lg font-bold text-blue-600">
                  {stats.successRate.toFixed(1)}%
                </div>
              </div>
              <div className="text-center p-3 bg-gray-50 rounded">
                <div className="font-semibold text-gray-600">Rozptyl profitů</div>
                <div className="text-lg font-bold text-green-600">
                  {(stats.maxProfit - stats.minProfit).toFixed(3)}%
                </div>
              </div>
              <div className="text-center p-3 bg-gray-50 rounded">
                <div className="font-semibold text-gray-600">Posl. 10 běhů</div>
                <div className="text-lg font-bold text-orange-600">
                  {stats.recentOpportunities} opp.
                </div>
              </div>
              <div className="text-center p-3 bg-gray-50 rounded">
                <div className="font-semibold text-gray-600">Trendy výkon</div>
                <div className="text-lg font-bold text-purple-600">
                  {stats.recentAvgProfit > stats.avgProfit ? '↗️' : '↘️'} 
                  {((stats.recentAvgProfit / stats.avgProfit - 1) * 100).toFixed(1)}%
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}