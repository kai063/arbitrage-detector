'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, RefreshCw, Search } from 'lucide-react';

interface TradingPair {
  symbol: string;
  baseCurrency: string;
  quoteCurrency: string;
  bidPrice: number;
  askPrice: number;
  spread: number;
  spreadPercentage: number;
  volume24h?: number;
  isActive: boolean;
}

interface BinanceDataTableProps {
  isVisible: boolean;
}

export default function BinanceDataTable({ isVisible }: BinanceDataTableProps) {
  const [data, setData] = useState<TradingPair[]>([]);
  const [filteredData, setFilteredData] = useState<TradingPair[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [showAll, setShowAll] = useState(false);
  
  const INITIAL_DISPLAY_COUNT = 50;

  const fetchBinanceData = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch('/api/binance/pairs?quote=USDT&maxSpread=5');
      const result = await response.json();
      
      if (result.success && result.data && result.data.pairs) {
        setData(result.data.pairs);
        setFilteredData(result.data.pairs);
        setLastUpdate(new Date(result.timestamp));
        console.log('Binance data loaded:', {
          totalPairs: result.data.pairs.length,
          cached: result.cached,
          timestamp: result.timestamp
        });
      } else {
        setError(result.error || 'Failed to fetch data');
      }
    } catch (err) {
      setError('Network error: ' + (err as Error).message);
      console.error('Error fetching Binance data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isVisible && data.length === 0) {
      fetchBinanceData();
    }
  }, [isVisible, data.length]);

  useEffect(() => {
    if (!Array.isArray(data)) {
      setFilteredData([]);
      return;
    }
    
    if (searchTerm) {
      const filtered = data.filter(item => 
        item.symbol.toLowerCase().includes(searchTerm.toLowerCase())
      );
      setFilteredData(filtered);
    } else {
      setFilteredData(data);
    }
  }, [searchTerm, data]);

  const formatPrice = (price: number): string => {
    if (price === 0) return '0';
    if (price < 0.01) return price.toExponential(4);
    if (price < 1) return price.toFixed(6);
    if (price < 100) return price.toFixed(4);
    return price.toFixed(2);
  };

  if (!isVisible) return null;

  return (
    <Card className="w-full mt-6">
      <CardHeader>
        <div className="flex justify-between items-center">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Search className="h-5 w-5" />
              Binance Data Overview
            </CardTitle>
            <CardDescription>
              Zobrazení všech načtených trading párů z Binance API
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {lastUpdate && (
              <Badge variant="outline" className="text-xs">
                Poslední aktualizace: {lastUpdate.toLocaleTimeString('cs-CZ')}
              </Badge>
            )}
            <Button 
              onClick={fetchBinanceData} 
              disabled={loading}
              size="sm"
              variant="outline"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Obnovit
            </Button>
          </div>
        </div>
      </CardHeader>
      
      <CardContent>
        {/* Search and Stats */}
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center gap-4">
            <Input
              placeholder="Hledat symbol (např. BTC, ETH...)"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-64"
            />
            <Badge variant="secondary">
              Zobrazeno: {filteredData.length} / {data.length}
            </Badge>
          </div>
          
          {data.length > 0 && (
            <div className="flex gap-2 text-sm text-gray-600">
              <span>Celkem párů: {data.length}</span>
              <span>•</span>
              <span>Průměrný spread: {
                (data.reduce((sum, item) => sum + item.spreadPercentage, 0) / data.length).toFixed(4)
              }%</span>
            </div>
          )}
        </div>

        {/* Error Message */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
            <p className="text-red-700 font-medium">Chyba při načítání dat:</p>
            <p className="text-red-600 text-sm">{error}</p>
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
            <span className="ml-2 text-gray-600">Načítání Binance dat...</span>
          </div>
        )}

        {/* Data Table */}
        {!loading && filteredData.length > 0 && (
          <div className="border rounded-lg overflow-hidden">
            <div className="max-h-96 overflow-y-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-white">
                  <TableRow>
                    <TableHead className="w-24">Symbol</TableHead>
                    <TableHead className="w-16">Base</TableHead>
                    <TableHead className="w-16">Quote</TableHead>
                    <TableHead className="text-right">Bid Price</TableHead>
                    <TableHead className="text-right">Ask Price</TableHead>
                    <TableHead className="text-right">Spread (%)</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(showAll ? filteredData : filteredData.slice(0, INITIAL_DISPLAY_COUNT)).map((item, index) => {
                    return (
                      <TableRow key={`${item.symbol}-${index}`} className="hover:bg-gray-50">
                        <TableCell className="font-medium">
                          {item.symbol}
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          {item.baseCurrency}
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          {item.quoteCurrency}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {formatPrice(item.bidPrice)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {formatPrice(item.askPrice)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge 
                            variant={item.spreadPercentage > 2 ? "destructive" : item.spreadPercentage > 1 ? "default" : "secondary"}
                            className="text-xs"
                          >
                            {item.spreadPercentage.toFixed(4)}%
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge 
                            variant={item.isActive ? "default" : "destructive"}
                            className="text-xs"
                          >
                            {item.isActive ? "Active" : "Inactive"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            
            {/* Show More/Less Button */}
            {filteredData.length > INITIAL_DISPLAY_COUNT && (
              <div className="border-t bg-gray-50 p-4 text-center">
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => setShowAll(!showAll)}
                >
                  {showAll ? 
                    `Zobrazit méně (prvních ${INITIAL_DISPLAY_COUNT})` : 
                    `Zobrazit všech ${filteredData.length} párů`
                  }
                </Button>
              </div>
            )}
          </div>
        )}

        {/* No Data Message */}
        {!loading && !error && filteredData.length === 0 && data.length > 0 && (
          <div className="text-center py-8 text-gray-500">
            Žádné páry neodpovídají hledání &quot;{searchTerm}&quot;
          </div>
        )}

        {/* Empty State */}
        {!loading && !error && data.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            <p className="text-lg font-medium">Žádná data nejsou načtena</p>
            <p className="text-sm">Klikněte na &quot;Obnovit&quot; pro načtení dat z Binance API</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}