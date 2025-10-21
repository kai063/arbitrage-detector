export interface ExchangeRate {
  from: string;
  to: string;
  rate: number;
  timestamp: Date;
}

export interface ArbitrageCycle {
  currencies: string[];
  profit: number;
  profitPercentage: number;
  rates: { from: string; to: string; rate: number }[];
  totalVolume: number;
}

export interface ArbitrageResult {
  cycles: ArbitrageCycle[];
  totalOpportunities: number;
  bestOpportunity: ArbitrageCycle | null;
  timestamp: Date;
  type?: 'manual' | 'realtime' | 'binance';
  dataSource?: {
    totalPairs: number;
    processedSymbols: number;
    skippedSymbols: number;
    cached: boolean;
    source?: string;
  };
}

export interface Graph {
  [currency: string]: { [toCurrency: string]: { weight: number; rate: number } };
}

export class ArbitrageDetector {
  private graph: Graph = {};
  private currencies: string[] = [];
  private exchangeRates: ExchangeRate[] = [];

  buildGraph(exchangeRates: ExchangeRate[]): void {
    this.exchangeRates = exchangeRates;
    this.graph = {};
    const currencySet = new Set<string>();

    for (const rate of exchangeRates) {
      currencySet.add(rate.from);
      currencySet.add(rate.to);

      if (!this.graph[rate.from]) {
        this.graph[rate.from] = {};
      }
      
      // Use negative logarithm for Bellman-Ford to detect positive cycles (arbitrage)
      const weight = -Math.log(rate.rate);
      this.graph[rate.from][rate.to] = { weight, rate: rate.rate };
    }

    this.currencies = Array.from(currencySet);
  }

  detectAllArbitrageCycles(settings?: AlgorithmSettings): ArbitrageResult {
    const cycles: ArbitrageCycle[] = [];
    const processedCycles = new Set<string>();
    const maxIterations = settings?.maxIterations || this.currencies.length;

    // Run Bellman-Ford from each currency to find all possible cycles
    // Limit iterations based on settings
    const currenciesToCheck = this.currencies.slice(0, Math.min(maxIterations, this.currencies.length));
    
    for (const startCurrency of currenciesToCheck) {
      const foundCycles = this.findCyclesFromStart(startCurrency, settings);
      
      for (const cycle of foundCycles) {
        const cycleKey = this.getCycleKey(cycle.currencies);
        if (!processedCycles.has(cycleKey)) {
          cycles.push(cycle);
          processedCycles.add(cycleKey);
        }
      }
    }

    const bestOpportunity = cycles.length > 0 
      ? cycles.reduce((best, current) => 
          current.profitPercentage > best.profitPercentage ? current : best
        )
      : null;

    return {
      cycles,
      totalOpportunities: cycles.length,
      bestOpportunity,
      timestamp: new Date()
    };
  }

  private findCyclesFromStart(startCurrency: string, settings?: AlgorithmSettings): ArbitrageCycle[] {
    const distances: { [currency: string]: number } = {};
    const predecessors: { [currency: string]: string | null } = {};
    const cycles: ArbitrageCycle[] = [];

    // Initialize distances
    for (const currency of this.currencies) {
      distances[currency] = Infinity;
      predecessors[currency] = null;
    }
    distances[startCurrency] = 0;

    // Relax edges V-1 times
    for (let i = 0; i < this.currencies.length - 1; i++) {
      let updated = false;
      for (const from of this.currencies) {
        if (!this.graph[from] || distances[from] === Infinity) continue;

        for (const to in this.graph[from]) {
          const weight = this.graph[from][to].weight;
          if (distances[from] + weight < distances[to]) {
            distances[to] = distances[from] + weight;
            predecessors[to] = from;
            updated = true;
          }
        }
      }
      if (!updated) break; // Early termination if no updates
    }

    // Check for negative cycles (arbitrage opportunities)
    const inCycle = new Set<string>();
    for (const from of this.currencies) {
      if (!this.graph[from] || distances[from] === Infinity) continue;

      for (const to in this.graph[from]) {
        const weight = this.graph[from][to].weight;
        if (distances[from] + weight < distances[to] && !inCycle.has(to)) {
          // Found a negative cycle, extract it
          const cycle = this.extractCycle(predecessors, to);
          if (cycle.length > 1) {
            const arbitrageCycle = this.calculateCycleDetails(cycle);
            
            // Apply settings-based filtering
            const minProfit = settings?.minProfitThreshold ? settings.minProfitThreshold * 100 : 0.001;
            const maxLength = settings?.maxPathLength || Infinity;
            
            if (arbitrageCycle.profitPercentage > minProfit && 
                arbitrageCycle.currencies.length <= maxLength) {
              cycles.push(arbitrageCycle);
              cycle.forEach(currency => inCycle.add(currency));
            }
          }
        }
      }
    }

    return cycles;
  }

  private extractCycle(predecessors: { [currency: string]: string | null }, start: string): string[] {
    let current = start;
    
    // Find a node that's definitely in the cycle
    for (let i = 0; i < this.currencies.length && current; i++) {
      const next = predecessors[current];
      if (next === null || next === undefined) break;
      current = next;
    }

    if (!current) return [];

    // Extract the actual cycle
    const cycle: string[] = [];
    const cycleStart = current;
    
    do {
      cycle.push(current);
      current = predecessors[current]!;
    } while (current !== cycleStart && cycle.length < this.currencies.length);
    
    cycle.push(cycleStart); // Close the cycle
    return cycle.reverse(); // Reverse to get correct order
  }

  private calculateCycleDetails(cycle: string[]): ArbitrageCycle {
    const rates: { from: string; to: string; rate: number }[] = [];
    let totalLogWeight = 0;

    for (let i = 0; i < cycle.length - 1; i++) {
      const from = cycle[i];
      const to = cycle[i + 1];
      
      if (this.graph[from] && this.graph[from][to]) {
        const { weight, rate } = this.graph[from][to];
        rates.push({ from, to, rate });
        totalLogWeight += weight;
      }
    }

    // Calculate profit from the cycle
    const profit = Math.exp(-totalLogWeight);
    const profitPercentage = (profit - 1) * 100;

    return {
      currencies: cycle.slice(0, -1), // Remove duplicate last currency
      profit,
      profitPercentage,
      rates,
      totalVolume: profit
    };
  }

  private getCycleKey(currencies: string[]): string {
    // Create a normalized key for the cycle to avoid duplicates
    const sorted = [...currencies].sort();
    return sorted.join('-');
  }

  // Utility methods
  getGraph(): Graph {
    return { ...this.graph };
  }

  getCurrencies(): string[] {
    return [...this.currencies];
  }

  getExchangeRates(): ExchangeRate[] {
    return [...this.exchangeRates];
  }

  // Find specific arbitrage between currencies
  findArbitrageBetween(currencies: string[]): ArbitrageCycle | null {
    if (currencies.length < 3) return null;

    // Create a subgraph with only specified currencies
    const subGraph: Graph = {};
    for (const currency of currencies) {
      if (this.graph[currency]) {
        subGraph[currency] = {};
        for (const target of currencies) {
          if (this.graph[currency][target]) {
            subGraph[currency][target] = this.graph[currency][target];
          }
        }
      }
    }

    // Use simplified cycle detection for specific currencies
    const tempDetector = new ArbitrageDetector();
    tempDetector.graph = subGraph;
    tempDetector.currencies = currencies;
    
    const result = tempDetector.detectAllArbitrageCycles();
    return result.bestOpportunity;
  }
}

interface AlgorithmSettings {
  maxIterations?: number;
  minProfitThreshold?: number;
  maxPathLength?: number;
  selectedCurrencies?: string[];
}

// Main function for detecting currency arbitrage
export function detectCurrencyArbitrage(
  exchangeRates: ExchangeRate[], 
  settings?: AlgorithmSettings
): ArbitrageResult {
  console.log('🔍 detectCurrencyArbitrage started:', {
    inputRates: exchangeRates.length,
    settings: settings
  });
  
  const detector = new ArbitrageDetector();
  
  // Apply currency filtering if specified
  let filteredRates = exchangeRates;
  if (settings?.selectedCurrencies && settings.selectedCurrencies.length > 0) {
    const originalLength = filteredRates.length;
    filteredRates = exchangeRates.filter(rate => 
      settings.selectedCurrencies!.includes(rate.from) && 
      settings.selectedCurrencies!.includes(rate.to)
    );
    console.log(`📊 Currency filtering: ${originalLength} → ${filteredRates.length} rates`);
  }
  
  console.log('🏗️ Building graph with rates:', filteredRates.length);
  detector.buildGraph(filteredRates);
  
  console.log('🔄 Starting arbitrage cycle detection...');
  const result = detector.detectAllArbitrageCycles(settings);
  console.log(`✅ Initial detection found ${result.cycles.length} cycles`);
  
  // Apply profit threshold filtering
  if (settings?.minProfitThreshold) {
    const thresholdPercent = settings.minProfitThreshold * 100;
    const beforeFiltering = result.cycles.length;
    result.cycles = result.cycles.filter(cycle => 
      cycle.profitPercentage >= thresholdPercent
    );
    console.log(`💰 Profit filtering (${thresholdPercent}%): ${beforeFiltering} → ${result.cycles.length} cycles`);
    result.totalOpportunities = result.cycles.length;
    result.bestOpportunity = result.cycles.length > 0 
      ? result.cycles.reduce((best, current) => 
          current.profitPercentage > best.profitPercentage ? current : best
        )
      : null;
  }
  
  // Apply path length filtering
  if (settings?.maxPathLength) {
    const beforeFiltering = result.cycles.length;
    result.cycles = result.cycles.filter(cycle => 
      cycle.currencies.length <= settings.maxPathLength!
    );
    console.log(`📏 Path length filtering (max ${settings.maxPathLength}): ${beforeFiltering} → ${result.cycles.length} cycles`);
    result.totalOpportunities = result.cycles.length;
    result.bestOpportunity = result.cycles.length > 0 
      ? result.cycles.reduce((best, current) => 
          current.profitPercentage > best.profitPercentage ? current : best
        )
      : null;
  }
  
  console.log('🎯 Final result:', {
    totalCycles: result.cycles.length,
    bestProfit: result.bestOpportunity?.profitPercentage,
    timestamp: result.timestamp
  });
  
  return result;
}

// Helper function to validate exchange rates
export function validateExchangeRates(exchangeRates: ExchangeRate[]): string[] {
  const errors: string[] = [];
  
  exchangeRates.forEach((rate, index) => {
    if (!rate.from || !rate.to) {
      errors.push(`Rate ${index + 1}: Missing currency codes`);
    }
    if (rate.from === rate.to) {
      errors.push(`Rate ${index + 1}: Source and target currencies cannot be the same`);
    }
    if (rate.rate <= 0) {
      errors.push(`Rate ${index + 1}: Exchange rate must be positive`);
    }
    if (!rate.timestamp || isNaN(rate.timestamp.getTime())) {
      errors.push(`Rate ${index + 1}: Invalid timestamp`);
    }
  });

  return errors;
}

// Helper function to format arbitrage results
export function formatArbitrageResult(result: ArbitrageResult): string {
  if (result.cycles.length === 0) {
    return "No arbitrage opportunities found.";
  }

  let output = `Found ${result.totalOpportunities} arbitrage opportunities:\n\n`;
  
  result.cycles.forEach((cycle, index) => {
    output += `${index + 1}. ${cycle.currencies.join(' → ')} → ${cycle.currencies[0]}\n`;
    output += `   Profit: ${cycle.profitPercentage.toFixed(4)}%\n`;
    output += `   Path: ${cycle.rates.map(r => `${r.from}→${r.to} (${r.rate.toFixed(6)})`).join(', ')}\n\n`;
  });

  if (result.bestOpportunity) {
    output += `Best opportunity: ${result.bestOpportunity.profitPercentage.toFixed(4)}% profit`;
  }

  return output;
}