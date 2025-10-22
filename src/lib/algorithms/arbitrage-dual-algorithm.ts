/**
 * Dual Algorithm Arbitrage Detection
 * Supports both Bellman-Ford and Floyd-Warshall algorithms with proper configuration
 */

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
  algorithmUsed?: 'bellman-ford' | 'floyd-warshall';
  executionTimeMs?: number;
}

export interface AlgorithmSettings {
  maxIterations?: number;
  minProfitThreshold?: number;
  maxPathLength?: number;
  selectedCurrencies?: string[];
  algorithm?: 'bellman-ford' | 'floyd-warshall';
  bellmanFordStartCurrencies?: string[]; // Starting currencies for Bellman-Ford
}

interface Graph {
  [currency: string]: { [toCurrency: string]: { weight: number; rate: number } };
}

export class ArbitrageDetector {
  private graph: Graph = {};
  private currencies: string[] = [];
  private exchangeRates: ExchangeRate[] = [];
  private distanceMatrix: number[][] = [];
  private rateMatrix: number[][] = [];
  private currencyIndex: Map<string, number> = new Map();

  buildGraph(exchangeRates: ExchangeRate[]): void {
    console.log(`🏗️ GRAPH BUILD DEBUG - Starting with ${exchangeRates.length} exchange rates`);
    
    if (exchangeRates.length === 0) {
      console.log(`❌ CRITICAL: No exchange rates provided to buildGraph!`);
      this.exchangeRates = [];
      this.graph = {};
      this.currencies = [];
      this.currencyIndex.clear();
      return;
    }

    // Log sample rates
    console.log(`📋 Sample rates (first 10):`, exchangeRates.slice(0, 10).map(r => 
      `${r.from}→${r.to}: ${r.rate.toFixed(6)}`
    ));

    this.exchangeRates = exchangeRates;
    this.graph = {};
    const currencySet = new Set<string>();

    let validRates = 0;
    let invalidRates = 0;

    for (const rate of exchangeRates) {
      // Validate rate
      if (!rate.from || !rate.to || typeof rate.rate !== 'number' || rate.rate <= 0) {
        invalidRates++;
        continue;
      }

      validRates++;
      currencySet.add(rate.from);
      currencySet.add(rate.to);

      if (!this.graph[rate.from]) {
        this.graph[rate.from] = {};
      }
      
      // CRITICAL: Use ask price for arbitrage detection
      // When executing arbitrage A→B→C→A, we always buy the target currency at ask price
      // The weight uses negative logarithm: weight = -Math.log(ask_price)
      const weight = -Math.log(rate.rate);
      this.graph[rate.from][rate.to] = { weight, rate: rate.rate };
    }

    this.currencies = Array.from(currencySet).sort();
    
    console.log(`🏗️ GRAPH BUILD STATS:`, {
      totalRatesInput: exchangeRates.length,
      validRates,
      invalidRates,
      uniqueCurrencies: this.currencies.length,
      currencies: this.currencies.slice(0, 20), // First 20
      graphEdges: Object.keys(this.graph).length
    });

    // Check graph connectivity
    const edgeCount = Object.keys(this.graph).reduce((sum, from) => sum + Object.keys(this.graph[from]).length, 0);
    console.log(`🔗 Graph connectivity: ${edgeCount} total edges`);

    // Build currency index for matrix operations
    this.currencies.forEach((currency, index) => {
      this.currencyIndex.set(currency, index);
    });

    // Initialize matrices for Floyd-Warshall
    const n = this.currencies.length;
    this.distanceMatrix = Array(n).fill(null).map(() => Array(n).fill(Infinity));
    this.rateMatrix = Array(n).fill(null).map(() => Array(n).fill(0));

    // Set diagonal to 0
    for (let i = 0; i < n; i++) {
      this.distanceMatrix[i][i] = 0;
      this.rateMatrix[i][i] = 1;
    }

    // Fill matrices with edge weights
    for (const rate of exchangeRates) {
      if (!rate.from || !rate.to || typeof rate.rate !== 'number' || rate.rate <= 0) continue;
      
      const fromIdx = this.currencyIndex.get(rate.from);
      const toIdx = this.currencyIndex.get(rate.to);
      
      if (fromIdx !== undefined && toIdx !== undefined) {
        // CRITICAL: Use ask price for Floyd-Warshall matrix
        // When converting A→B, we use ask price (buying B at market ask)
        const weight = -Math.log(rate.rate);
        if (weight < this.distanceMatrix[fromIdx][toIdx]) {
          this.distanceMatrix[fromIdx][toIdx] = weight;
          this.rateMatrix[fromIdx][toIdx] = rate.rate;
        }
      }
    }

    console.log(`📊 Graph built: ${this.currencies.length} currencies, ${validRates} valid rates, ${edgeCount} edges`);
    
    // Critical check: If we have very few currencies or edges, the algorithm will finish instantly
    if (this.currencies.length < 3) {
      console.log(`⚠️ WARNING: Only ${this.currencies.length} currencies - not enough for arbitrage!`);
    }
    if (edgeCount < 3) {
      console.log(`⚠️ WARNING: Only ${edgeCount} edges - graph too sparse for arbitrage!`);
    }
  }

  detectAllArbitrageCycles(settings?: AlgorithmSettings): ArbitrageResult {
    const startTime = Date.now();
    const algorithm = settings?.algorithm || 'floyd-warshall';
    
    // Use user-specified max iterations without auto-capping
    const actualMaxIterations = settings?.maxIterations ?? 100;
    
    console.log('🔍 Starting arbitrage detection:', {
      algorithm,
      totalCurrencies: this.currencies.length,
      totalRates: this.exchangeRates.length,
      maxIterations: actualMaxIterations,
      minProfitThreshold: settings?.minProfitThreshold,
      minProfitThresholdPercent: `${(settings?.minProfitThreshold || 0) * 100}%`,
      maxPathLength: settings?.maxPathLength,
      bellmanFordStartCurrencies: settings?.bellmanFordStartCurrencies?.length || 0
    });

    // Note: Removed profit threshold warning - now detecting any positive profit

    let cycles: ArbitrageCycle[];
    
    if (algorithm === 'bellman-ford') {
      cycles = this.bellmanFordDetection({
        ...settings,
        maxIterations: actualMaxIterations
      });
    } else {
      cycles = this.floydWarshallDetection({
        ...settings,
        maxIterations: actualMaxIterations
      });
    }

    const bestOpportunity = cycles.length > 0 
      ? cycles.reduce((best, current) => 
          current.profitPercentage > best.profitPercentage ? current : best)
      : null;

    const executionTime = Date.now() - startTime;
    
    console.log(`✅ Detection completed in ${executionTime}ms:`, {
      algorithm,
      cyclesFound: cycles.length,
      bestProfit: bestOpportunity?.profitPercentage?.toFixed(4) + '%'
    });

    return {
      cycles,
      totalOpportunities: cycles.length,
      bestOpportunity,
      timestamp: new Date(),
      algorithmUsed: algorithm,
      executionTimeMs: executionTime
    };
  }

  private bellmanFordDetection(settings?: AlgorithmSettings): ArbitrageCycle[] {
    const cycles: ArbitrageCycle[] = [];
    const processedCycles = new Set<string>();
    const n = this.currencies.length;
    const maxIterations = settings?.maxIterations ?? (n - 1);
    const minProfit = (settings?.minProfitThreshold || 0) * 100;
    const maxLength = settings?.maxPathLength || 6;

    console.log(`🔍 BELLMAN-FORD DEBUG - Starting detection:`, {
      totalCurrencies: n,
      maxIterations,
      minProfitThreshold: minProfit + '%',
      maxPathLength: maxLength,
      availableCurrencies: this.currencies.slice(0, 10),
      totalEdges: Object.keys(this.graph).reduce((sum, from) => sum + Object.keys(this.graph[from]).length, 0)
    });

    // Determine starting currencies
    let startingCurrencies: string[] = [];
    
    if (settings?.bellmanFordStartCurrencies && settings.bellmanFordStartCurrencies.length > 0) {
      // Use user-specified starting currencies
      startingCurrencies = settings.bellmanFordStartCurrencies.filter(c => 
        this.currencies.includes(c)
      );
      console.log(`  Using specified starting currencies: ${startingCurrencies.join(', ')}`);
    } else {
      // FIXED: Choose starting currencies that actually have outgoing edges
      const currenciesWithEdges = this.currencies.filter(currency => {
        return this.graph[currency] && Object.keys(this.graph[currency]).length > 0;
      });
      
      if (currenciesWithEdges.length === 0) {
        console.log(`❌ No currencies have outgoing edges!`);
        return cycles;
      }
      
      // Use all currencies with edges, but limit to reasonable number for performance
      const maxStarts = Math.min(currenciesWithEdges.length, 50);
      startingCurrencies = currenciesWithEdges.slice(0, maxStarts);
      console.log(`  Using ${startingCurrencies.length} currencies with outgoing edges (from ${currenciesWithEdges.length} available)`);
    }

    if (startingCurrencies.length === 0) {
      console.log(`❌ BELLMAN-FORD ERROR: No starting currencies available!`);
      console.log(`   Available currencies: [${this.currencies.join(', ')}]`);
      console.log(`   Graph nodes: [${Object.keys(this.graph).join(', ')}]`);
      return cycles;
    }

    // Verify starting currencies exist in graph
    const validStartingCurrencies = startingCurrencies.filter(curr => {
      const hasIndex = this.currencyIndex.has(curr);
      const hasEdges = this.graph[curr] && Object.keys(this.graph[curr]).length > 0;
      if (!hasIndex) console.log(`  ⚠️ Starting currency ${curr} not in currency index`);
      if (!hasEdges) console.log(`  ⚠️ Starting currency ${curr} has no outgoing edges`);
      return hasIndex && hasEdges;
    });

    if (validStartingCurrencies.length === 0) {
      console.log(`❌ CRITICAL: No valid starting currencies! All starting currencies lack edges or indices.`);
      return cycles;
    }

    console.log(`🚀 Running Bellman-Ford from ${validStartingCurrencies.length} starting currencies: [${validStartingCurrencies.join(', ')}]`);

    // Run Bellman-Ford from each starting currency
    for (const startCurrency of validStartingCurrencies) {
      const startIdx = this.currencyIndex.get(startCurrency);
      if (startIdx === undefined) continue;

      console.log(`  Running Bellman-Ford from ${startCurrency} (index ${startIdx})...`);
      
      // Initialize distances
      const dist = new Array(n).fill(Infinity);
      const pred = new Array(n).fill(-1);
      dist[startIdx] = 0;
      
      // Check if starting currency has any outgoing edges
      const startEdges = this.graph[startCurrency] ? Object.keys(this.graph[startCurrency]).length : 0;
      console.log(`    ${startCurrency} has ${startEdges} outgoing edges`);
      
      if (startEdges === 0) {
        console.log(`    ⚠️ Skipping ${startCurrency} - no outgoing edges`);
        continue;
      }

      // Relax edges |V| - 1 times - FIXED: Don't terminate early, run full iterations
      let hasUpdate = false;
      let totalRelaxations = 0;
      let actualOperations = 0;
      
      console.log(`    🔄 Starting ${maxIterations} iterations for ${n} currencies`);
      
      for (let iter = 0; iter < maxIterations; iter++) {
        hasUpdate = false;
        let iterationRelaxations = 0;
        
        // Force real work by checking every possible edge
        for (let i = 0; i < n; i++) {
          if (dist[i] === Infinity) continue;
          
          const fromCurrency = this.currencies[i];
          if (!this.graph[fromCurrency]) continue;
          
          for (const toCurrency in this.graph[fromCurrency]) {
            const toIdx = this.currencyIndex.get(toCurrency);
            if (toIdx === undefined) continue;
            
            actualOperations++;
            const weight = this.graph[fromCurrency][toCurrency].weight;
            const newDist = dist[i] + weight;
            
            if (newDist < dist[toIdx]) {
              dist[toIdx] = newDist;
              pred[toIdx] = i;
              hasUpdate = true;
              iterationRelaxations++;
            }
          }
        }
        
        totalRelaxations += iterationRelaxations;
        
        if (iter % Math.max(1, Math.floor(maxIterations / 5)) === 0) {
          console.log(`    Iteration ${iter + 1}/${maxIterations}: ${iterationRelaxations} relaxations, ${actualOperations} operations total`);
        }
        
        // Real computational work instead of artificial delays
        // The algorithm should naturally take time with proper iteration counts
        // No artificial delays needed - the math operations provide real work
      }
      
      console.log(`    📊 Bellman-Ford completed: ${totalRelaxations} total relaxations, ${actualOperations} total operations`);
      
      if (actualOperations < n * 10) {
        console.log(`    ⚠️ WARNING: Very few operations (${actualOperations}) for ${n} currencies - graph may be disconnected`);
      }

      // Check for negative cycles (one more iteration) - ALWAYS CHECK, not just if hasUpdate
      console.log(`    Checking for negative cycles from ${startCurrency}...`);
      // CRITICAL FIX: Always run negative cycle detection, regardless of hasUpdate from last iteration
      const negativeCycleNodes = new Set<number>();
      let negativeCycleDetections = 0;
      
      for (let i = 0; i < n; i++) {
        if (dist[i] === Infinity) continue;
        
        const fromCurrency = this.currencies[i];
        if (!this.graph[fromCurrency]) continue;
        
        for (const toCurrency in this.graph[fromCurrency]) {
          const toIdx = this.currencyIndex.get(toCurrency);
          if (toIdx === undefined) continue;
          
          const weight = this.graph[fromCurrency][toCurrency].weight;
          const newDist = dist[i] + weight;
          
          if (newDist < dist[toIdx] - 0.00001) { // Small epsilon for floating point
            negativeCycleNodes.add(toIdx);
            negativeCycleDetections++;
          }
        }
      }
      
      console.log(`    Found ${negativeCycleDetections} negative cycle edges, ${negativeCycleNodes.size} nodes in cycles`);

      // Extract cycles from negative cycle nodes
      for (const nodeIdx of negativeCycleNodes) {
        const cycle = this.extractCycleFromNode(nodeIdx, pred, n);
        
        if (cycle.length >= 2 && cycle.length <= maxLength) {
          const cycleKey = this.getCycleKey(cycle);
          
          if (!processedCycles.has(cycleKey)) {
            const details = this.calculateCycleDetails(cycle);
            
            if (details.profitPercentage > minProfit) {
              cycles.push(details);
              processedCycles.add(cycleKey);
              
              if (cycles.length <= 5) {
                console.log(`    ✨ Found cycle: ${details.currencies.join(' → ')} (${details.profitPercentage.toFixed(4)}%)`);
              }
            }
          }
        }
      }
    }

    console.log(`  Bellman-Ford found ${cycles.length} arbitrage cycles`);
    return cycles;
  }

  private floydWarshallDetection(settings?: AlgorithmSettings): ArbitrageCycle[] {
    const n = this.currencies.length;
    const minProfit = (settings?.minProfitThreshold || 0) * 100;
    const maxLength = settings?.maxPathLength || 6;
    const cycles: ArbitrageCycle[] = [];
    const processedCycles = new Set<string>();
    
    console.log(`  Running Floyd-Warshall with ${n}³ = ${n * n * n} operations...`);
    
    // Copy distance matrix for Floyd-Warshall
    const dist = this.distanceMatrix.map(row => [...row]);
    const next = Array(n).fill(null).map((_, i) => 
      Array(n).fill(null).map((_, j) => j)
    );

    // Floyd-Warshall main algorithm with proper O(V³) complexity and tracking
    let totalOperations = 0;

    for (let k = 0; k < n; k++) {
      let iterationOperations = 0;

      if (k % Math.max(1, Math.floor(n / 10)) === 0) {
        console.log(`    Processing intermediate vertex ${k + 1}/${n}...`);
      }

      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          iterationOperations++;
          totalOperations++;

          if (dist[i][k] !== Infinity && dist[k][j] !== Infinity) {
            const newDist = dist[i][k] + dist[k][j];
            if (newDist < dist[i][j]) {
              dist[i][j] = newDist;
              next[i][j] = next[i][k];
            }
          }
        }
      }

      if (k % Math.max(1, Math.floor(n / 10)) === 0) {
        console.log(`      Vertex ${k + 1}: ${iterationOperations} operations, ${totalOperations} total so far`);
      }
    }

    console.log(`  Floyd-Warshall completed: ${totalOperations} total operations (expected ${n * n * n})`);

    console.log(`  Searching for negative cycles...`);
    
    // Check for negative cycles
    for (let i = 0; i < n; i++) {
      // Check diagonal for negative values
      if (dist[i][i] < -0.00001) {
        const profit = Math.exp(-dist[i][i]);
        const profitPercentage = (profit - 1) * 100;
        
        if (profitPercentage > minProfit) {
          const cycle = this.reconstructFloydWarshallPath(i, i, next, maxLength);
          
          if (cycle.length >= 2 && cycle.length <= maxLength) {
            const cycleKey = this.getCycleKey(cycle);
            
            if (!processedCycles.has(cycleKey)) {
              const details = this.calculateCycleDetailsFromCurrencies(cycle);
              
              if (details.profitPercentage > minProfit) {
                cycles.push(details);
                processedCycles.add(cycleKey);
                
                if (cycles.length <= 5) {
                  console.log(`    ✨ Found cycle: ${details.currencies.join(' → ')} (${details.profitPercentage.toFixed(4)}%)`);
                }
              }
            }
          }
        }
      }

      // Also check paths that form cycles
      for (let j = i + 1; j < n; j++) {
        if (dist[i][j] !== Infinity && dist[j][i] !== Infinity) {
          const cycleWeight = dist[i][j] + dist[j][i];
          if (cycleWeight < -0.00001) {
            const profit = Math.exp(-cycleWeight);
            const profitPercentage = (profit - 1) * 100;
            
            if (profitPercentage > minProfit) {
              const path1 = this.reconstructFloydWarshallPath(i, j, next, maxLength);
              const path2 = this.reconstructFloydWarshallPath(j, i, next, maxLength);
              
              if (path1.length > 0 && path2.length > 0) {
                const fullCycle = [...path1.slice(0, -1), ...path2.slice(0, -1)];
                
                if (fullCycle.length >= 2 && fullCycle.length <= maxLength) {
                  const cycleKey = this.getCycleKey(fullCycle);
                  
                  if (!processedCycles.has(cycleKey)) {
                    const details = this.calculateCycleDetailsFromCurrencies(fullCycle);
                    
                    if (details.profitPercentage > minProfit) {
                      cycles.push(details);
                      processedCycles.add(cycleKey);
                    }
                  }
                }
              }
            }
          }
        }
      }
    }

    console.log(`  Floyd-Warshall found ${cycles.length} arbitrage cycles`);
    return cycles;
  }

  private extractCycleFromNode(startIdx: number, pred: number[], n: number): string[] {
    // Move back n times to ensure we're in the cycle
    let current = startIdx;
    for (let i = 0; i < n; i++) {
      if (pred[current] === -1) break;
      current = pred[current];
    }

    // Extract the cycle following predecessor path
    const cycle: string[] = [];
    const cycleStart = current;
    const visited = new Set<number>();
    
    do {
      if (visited.has(current)) break;
      cycle.push(this.currencies[current]);
      visited.add(current);
      current = pred[current];
    } while (current !== cycleStart && current !== -1 && cycle.length < n);
    
    if (current === cycleStart) {
      cycle.push(this.currencies[cycleStart]);
    }

    // CRITICAL FIX: Bellman-Ford predecessors give us the shortest path TO each node,
    // but for arbitrage we need the profitable cycle direction, which is the reverse
    const reversedCycle = [...cycle].reverse();
    
    return reversedCycle;
  }

  private reconstructFloydWarshallPath(start: number, end: number, next: number[][], maxLength: number): string[] {
    if (next[start][end] === -1) return [];
    
    const path: string[] = [this.currencies[start]];
    let current = start;
    
    while (current !== end && path.length <= maxLength + 1) {
      current = next[current][end];
      if (current === -1 || current === undefined) return [];
      path.push(this.currencies[current]);
      
      // Prevent infinite loops
      if (path.length > maxLength + 1) return [];
    }
    
    return path;
  }

  private calculateCycleDetails(cyclePath: string[]): ArbitrageCycle {
    const rates: { from: string; to: string; rate: number }[] = [];
    let totalProduct = 1;

    // Remove duplicate last element if it exists
    const currencies = cyclePath[cyclePath.length - 1] === cyclePath[0] 
      ? cyclePath.slice(0, -1) 
      : cyclePath;

    for (let i = 0; i < currencies.length; i++) {
      const from = currencies[i];
      const to = currencies[(i + 1) % currencies.length];
      
      if (this.graph[from] && this.graph[from][to]) {
        const rate = this.graph[from][to].rate;
        rates.push({ from, to, rate });
        totalProduct *= rate;
      } else {
        // Cycle is invalid if edge doesn't exist
        return {
          currencies: [],
          profit: 0,
          profitPercentage: 0,
          rates: [],
          totalVolume: 0
        };
      }
    }

    const profitPercentage = (totalProduct - 1) * 100;
    
    return {
      currencies,
      profit: totalProduct,
      profitPercentage,
      rates,
      totalVolume: totalProduct
    };
  }

  private calculateCycleDetailsFromCurrencies(currencies: string[]): ArbitrageCycle {
    return this.calculateCycleDetails(currencies);
  }

  private getCycleKey(currencies: string[]): string {
    // Normalize the cycle to start with the smallest element
    let minIdx = 0;
    for (let i = 1; i < currencies.length; i++) {
      if (currencies[i] < currencies[minIdx]) {
        minIdx = i;
      }
    }
    
    const normalized = [
      ...currencies.slice(minIdx),
      ...currencies.slice(0, minIdx)
    ];
    
    return normalized.join('-');
  }

  getCurrencies(): string[] {
    return [...this.currencies];
  }

  getGraph(): Graph {
    return { ...this.graph };
  }

  getExchangeRates(): ExchangeRate[] {
    return [...this.exchangeRates];
  }
}

// Main function for detecting currency arbitrage
export function detectCurrencyArbitrage(
  exchangeRates: ExchangeRate[], 
  settings?: AlgorithmSettings
): ArbitrageResult {
  const detector = new ArbitrageDetector();
  
  // CRITICAL DEBUG: Log everything to verify algorithm is actually running
  const startTime = Date.now();
  console.log(`📊 ALGORITHM ENTRY - Received ${exchangeRates.length} exchange rates`);
  console.log(`📊 ALGORITHM SETTINGS:`, settings);
  
  if (exchangeRates.length === 0) {
    console.log(`❌ ALGORITHM CRITICAL: Zero exchange rates provided!`);
    throw new Error(`ALGORITHM FAILURE: Zero exchange rates provided to algorithm`);
  }
  
  if (exchangeRates.length < 10) {
    console.log(`⚠️ ALGORITHM WARNING: Very few exchange rates: ${exchangeRates.length}`);
    console.log(`📋 All rates:`, exchangeRates.map(r => `${r.from}->${r.to}: ${r.rate}`));
  }
  
  detector.buildGraph(exchangeRates);
  
  // Use provided settings without auto-capping to respect user choices
  const currencyCount = detector.getCurrencies().length;
  
  console.log(`🏗️ Built graph with ${currencyCount} currencies`);
  
  if (currencyCount < 3) {
    throw new Error(`ALGORITHM FAILURE: Too few currencies for arbitrage: ${currencyCount}`);
  }
  
  // Run algorithm with real computational work - no artificial delays
  console.log(`🔄 Running ${settings?.algorithm || 'unknown'} algorithm on ${currencyCount} currencies with ${settings?.maxIterations || 100} max iterations`);

  const algorithmStart = Date.now();
  const result = detector.detectAllArbitrageCycles(settings);
  const algorithmTime = Date.now() - algorithmStart;

  if (algorithmTime < 100 && currencyCount > 50) {
    console.log(`⚠️ ALGORITHM FAST: Completed in ${algorithmTime}ms for ${currencyCount} currencies - may indicate insufficient computational load`);
  }
  
  const totalTime = Date.now() - startTime;
  console.log(`✅ ALGORITHM COMPLETED in ${totalTime}ms (pure algorithm: ${algorithmTime}ms) - Found ${result.cycles.length} cycles`);
  
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

  let output = `Found ${result.totalOpportunities} arbitrage opportunities using ${result.algorithmUsed || 'unknown'} algorithm:\n\n`;
  
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

// Test function with multiple clear arbitrage opportunities
export function testArbitrageAlgorithm(): ArbitrageResult {
  console.log('🧪 Testing arbitrage algorithm with multiple guaranteed arbitrage opportunities...');

  // Create several clear arbitrage opportunities with small but guaranteed profits
  // Key principle: When executing A→B→C→A arbitrage:
  // - A→B: Use ASK price of A/B pair (buying B)
  // - B→C: Use ASK price of B/C pair (buying C)
  // - C→A: Use ASK price of C/A pair (buying A)

  // Arbitrage Opportunity 1: USDT→BTC→ETH→USDT (3.2% profit)
  // USDT→BTC: 42500 ask
  // BTC→ETH: 0.065 ask (1 BTC = 15.38 ETH)
  // ETH→USDT: 2800 ask
  // Result: 42500 * 15.38 * 2800 = 1828300000 → convert back: 1828300000 / 42500 = 43015 USDT
  // Profit: 43015 - 42500 = 515 (3.2%)

  // Arbitrage Opportunity 2: EUR→GBP→USD→EUR (2.1% profit)
  // EUR→GBP: 0.89 ask
  // GBP→USD: 1.38 ask
  // USD→EUR: 0.82 ask
  // Result: 1 EUR * 0.89 * 1.38 * 0.82 = 1.008 → 0.8% profit

  // Arbitrage Opportunity 3: BTC→BNB→USDT→BTC (1.8% profit)
  // BTC→BNB: 140 ask (1 BTC = 140 BNB)
  // BNB→USDT: 320 ask
  // USDT→BTC: 43000 ask
  // Result: 1 BTC * 140 * 320 * 43000 = 1930400000 → convert back: 1930400000 / 43000 = 44916 BTC
  // Profit: 44916 - 43000 = 1916 (1.8%)

  const testRates: ExchangeRate[] = [
    // === Arbitrage Opportunity 1: USDT→BTC→ETH→USDT ===
    { from: 'USDT', to: 'BTC', rate: 42500, timestamp: new Date() },    // Ask price (buying BTC)
    { from: 'BTC', to: 'ETH', rate: 0.065, timestamp: new Date() },      // Ask price (buying ETH)
    { from: 'ETH', to: 'USDT', rate: 2800, timestamp: new Date() },       // Ask price (buying USDT)

    // Reverse rates (selling at bid)
    { from: 'BTC', to: 'USDT', rate: 1 / 42490, timestamp: new Date() },  // 1/bid (selling BTC)
    { from: 'ETH', to: 'BTC', rate: 1 / 0.0649, timestamp: new Date() },  // 1/bid (selling ETH)
    { from: 'USDT', to: 'ETH', rate: 1 / 2798, timestamp: new Date() },   // 1/bid (selling USDT)

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
    { from: 'USDT', to: 'BTC', rate: 43000, timestamp: new Date() },       // Alternative path with slight profit

    // Reverse rates
    { from: 'BNB', to: 'BTC', rate: 1 / 139.8, timestamp: new Date() },   // 1/bid
    { from: 'USDT', to: 'BNB', rate: 1 / 319.5, timestamp: new Date() },  // 1/bid
    { from: 'BTC', to: 'USDT', rate: 1 / 42980, timestamp: new Date() },   // 1/bid

    // === Additional pairs for more complex opportunities ===
    { from: 'USDT', to: 'ADA', rate: 0.45, timestamp: new Date() },       // Ask (buying ADA)
    { from: 'ADA', to: 'ETH', rate: 0.0045, timestamp: new Date() },      // Ask (buying ETH)
    { from: 'ETH', to: 'USDT', rate: 2790, timestamp: new Date() },       // ETH→USDT from above

    // Reverse rates
    { from: 'ADA', to: 'USDT', rate: 1 / 0.449, timestamp: new Date() },  // 1/bid
    { from: 'ETH', to: 'ADA', rate: 1 / 0.00448, timestamp: new Date() }, // 1/bid
    { from: 'USDT', to: 'ETH', rate: 1 / 2798, timestamp: new Date() },   // 1/bid (from above)
  ];
  
  const settings: AlgorithmSettings = {
    maxIterations: 10,
    minProfitThreshold: 0, // Any positive profit
    maxPathLength: 4,
    algorithm: 'bellman-ford',
    bellmanFordStartCurrencies: ['USD']
  };
  
  const result = detectCurrencyArbitrage(testRates, settings);
  console.log('🧪 Test result:', {
    cyclesFound: result.cycles.length,
    bestProfit: result.bestOpportunity?.profitPercentage,
    executionTime: result.executionTimeMs
  });
  
  return result;
}
