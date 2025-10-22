'use client';

import { useState, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArbitrageResult } from '@/lib/algorithms/arbitrage-dual-algorithm';
import { Download, TrendingUp, ArrowUpDown } from 'lucide-react';

interface ArbitrageEntry {
  id: string;
  timestamp: Date;
  path: string[];
  profitPercentage: number;
  spread: number;
  volume: number;
  type: 'manual' | 'realtime';
}

interface ArbitrageTableProps {
  arbitrageHistory: ArbitrageResult[];
}

type SortField = 'timestamp' | 'profitPercentage' | 'spread' | 'volume';
type SortDirection = 'asc' | 'desc';

export default function ArbitrageTable({ arbitrageHistory }: ArbitrageTableProps) {
  const [sortField, setSortField] = useState<SortField>('profitPercentage');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  // Convert arbitrage history to table entries
  const tableEntries = useMemo(() => {
    const entries: ArbitrageEntry[] = [];
    
    arbitrageHistory.forEach((result, resultIndex) => {
      result.cycles.forEach((cycle, cycleIndex) => {
        entries.push({
          id: `${resultIndex}-${cycleIndex}`,
          timestamp: result.timestamp,
          path: cycle.currencies,
          profitPercentage: cycle.profitPercentage,
          spread: cycle.profitPercentage / 100, // Convert to decimal
          volume: cycle.totalVolume,
          type: ((result as { type?: string }).type === 'realtime' ? 'realtime' : 'manual') as 'manual' | 'realtime'
        });
      });
    });
    
    return entries;
  }, [arbitrageHistory]);

  // Sort entries
  const sortedEntries = useMemo(() => {
    return [...tableEntries].sort((a, b) => {
      const aValue = a[sortField];
      const bValue = b[sortField];
      
      if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }, [tableEntries, sortField, sortDirection]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const exportToCSV = () => {
    const headers = ['Timestamp', 'Path', 'Profit %', 'Spread', 'Volume', 'Type'];
    const csvContent = [
      headers.join(','),
      ...sortedEntries.map(entry => [
        entry.timestamp.toISOString(),
        `"${entry.path.join(' → ')}"`,
        entry.profitPercentage.toFixed(4),
        entry.spread.toFixed(6),
        entry.volume.toFixed(6),
        entry.type
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `arbitrage-opportunities-${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getSortIcon = (field: SortField) => {
    if (sortField !== field) {
      return <ArrowUpDown className="h-4 w-4 opacity-50" />;
    }
    return (
      <ArrowUpDown 
        className={`h-4 w-4 ${sortDirection === 'desc' ? 'rotate-180' : ''} transition-transform`} 
      />
    );
  };

  const getProfitBadgeVariant = (profit: number) => {
    if (profit >= 2) return 'default';
    if (profit >= 1) return 'secondary';
    return 'outline';
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <div>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Detekované arbitráže
            </CardTitle>
            <CardDescription>
              Historie všech nalezených arbitrážních příležitostí
            </CardDescription>
          </div>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={exportToCSV}
            disabled={sortedEntries.length === 0}
          >
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {sortedEntries.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-gray-500">
            <div className="text-center">
              <TrendingUp className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">Žádné arbitráže nebyly detekovány</p>
              <p className="text-xs">Spusťte detekci pro zobrazení výsledků</p>
            </div>
          </div>
        ) : (
          <>
            {/* Summary Stats */}
            <div className="grid grid-cols-3 gap-4 mb-4 p-4 bg-gray-50 rounded-lg">
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">{sortedEntries.length}</div>
                <div className="text-sm text-gray-600">Celkem příležitostí</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">
                  {Math.max(...sortedEntries.map(e => e.profitPercentage)).toFixed(2)}%
                </div>
                <div className="text-sm text-gray-600">Nejvyšší profit</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-purple-600">
                  {(sortedEntries.reduce((sum, e) => sum + e.profitPercentage, 0) / sortedEntries.length).toFixed(2)}%
                </div>
                <div className="text-sm text-gray-600">Průměrný profit</div>
              </div>
            </div>

            {/* Table */}
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead 
                      className="cursor-pointer hover:bg-gray-50"
                      onClick={() => handleSort('timestamp')}
                    >
                      <div className="flex items-center gap-2">
                        Čas
                        {getSortIcon('timestamp')}
                      </div>
                    </TableHead>
                    <TableHead>Cesta</TableHead>
                    <TableHead 
                      className="cursor-pointer hover:bg-gray-50"
                      onClick={() => handleSort('profitPercentage')}
                    >
                      <div className="flex items-center gap-2">
                        Profit %
                        {getSortIcon('profitPercentage')}
                      </div>
                    </TableHead>
                    <TableHead 
                      className="cursor-pointer hover:bg-gray-50"
                      onClick={() => handleSort('spread')}
                    >
                      <div className="flex items-center gap-2">
                        Spread
                        {getSortIcon('spread')}
                      </div>
                    </TableHead>
                    <TableHead 
                      className="cursor-pointer hover:bg-gray-50"
                      onClick={() => handleSort('volume')}
                    >
                      <div className="flex items-center gap-2">
                        Volume
                        {getSortIcon('volume')}
                      </div>
                    </TableHead>
                    <TableHead>Typ</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedEntries.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell className="text-sm text-gray-600">
                        {entry.timestamp.toLocaleString('cs-CZ', {
                          day: '2-digit',
                          month: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit'
                        })}
                      </TableCell>
                      
                      <TableCell>
                        <div className="font-mono text-sm">
                          {entry.path.join(' → ')} → {entry.path[0]}
                        </div>
                      </TableCell>
                      
                      <TableCell>
                        <Badge variant={getProfitBadgeVariant(entry.profitPercentage)}>
                          +{entry.profitPercentage.toFixed(4)}%
                        </Badge>
                      </TableCell>
                      
                      <TableCell className="font-mono text-sm">
                        {entry.spread.toFixed(6)}
                      </TableCell>
                      
                      <TableCell className="font-mono text-sm">
                        {entry.volume.toFixed(6)}
                      </TableCell>
                      
                      <TableCell>
                        <Badge 
                          variant={entry.type === 'realtime' ? 'default' : 'secondary'}
                          className="text-xs"
                        >
                          {entry.type === 'realtime' ? 'Real-time' : 'Manuální'}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Pagination info */}
            <div className="flex justify-between items-center mt-4 text-sm text-gray-600">
              <div>
                Zobrazeno {sortedEntries.length} z {sortedEntries.length} příležitostí
              </div>
              <div>
                Seřazeno dle: {sortField} ({sortDirection === 'desc' ? 'sestupně' : 'vzestupně'})
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}