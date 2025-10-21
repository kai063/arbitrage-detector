'use client';

import { useEffect, useRef, useState } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import { ExchangeRate, ArbitrageResult } from '@/lib/algorithms/arbitrage';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface GraphNode {
  id: string;
  name: string;
  color: string;
  size: number;
  fx?: number;
  fy?: number;
}

interface GraphLink {
  source: string;
  target: string;
  rate: number;
  color: string;
  width: number;
  isArbitrage: boolean;
  curvature: number;
}

interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

interface CurrencyGraphProps {
  exchangeRates: ExchangeRate[];
  arbitrageResult: ArbitrageResult | null;
  width?: number;
  height?: number;
}

export default function CurrencyGraph({ 
  exchangeRates, 
  arbitrageResult, 
  width = 800, 
  height = 600 
}: CurrencyGraphProps) {
  const graphRef = useRef<any>();
  const [graphData, setGraphData] = useState<GraphData>({ nodes: [], links: [] });
  const [hoveredLink, setHoveredLink] = useState<GraphLink | null>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; content: string } | null>(null);

  useEffect(() => {
    if (exchangeRates.length === 0) {
      setGraphData({ nodes: [], links: [] });
      return;
    }

    // Extract unique currencies
    const currencies = new Set<string>();
    exchangeRates.forEach(rate => {
      currencies.add(rate.from);
      currencies.add(rate.to);
    });

    // Get arbitrage currencies for highlighting
    const arbitrageCurrencies = new Set<string>();
    const arbitrageEdges = new Set<string>();
    
    if (arbitrageResult?.cycles) {
      arbitrageResult.cycles.forEach(cycle => {
        cycle.currencies.forEach(currency => arbitrageCurrencies.add(currency));
        
        // Add edges for the cycle
        for (let i = 0; i < cycle.currencies.length; i++) {
          const from = cycle.currencies[i];
          const to = cycle.currencies[(i + 1) % cycle.currencies.length];
          arbitrageEdges.add(`${from}-${to}`);
        }
      });
    }

    // Create nodes
    const nodes: GraphNode[] = Array.from(currencies).map(currency => ({
      id: currency,
      name: currency,
      color: arbitrageCurrencies.has(currency) ? '#ef4444' : '#3b82f6',
      size: arbitrageCurrencies.has(currency) ? 8 : 6
    }));

    // Create links with curvature for multiple edges between same nodes
    const linkMap = new Map<string, GraphLink[]>();
    
    exchangeRates.forEach(rate => {
      const linkId = `${rate.from}-${rate.to}`;
      const reverseId = `${rate.to}-${rate.from}`;
      
      const isArbitrage = arbitrageEdges.has(linkId);
      
      const link: GraphLink = {
        source: rate.from,
        target: rate.to,
        rate: rate.rate,
        color: isArbitrage ? '#ef4444' : '#64748b',
        width: isArbitrage ? 3 : 1,
        isArbitrage,
        curvature: 0
      };

      if (!linkMap.has(linkId)) {
        linkMap.set(linkId, []);
      }
      linkMap.get(linkId)!.push(link);
    });

    // Apply curvature for multiple links between same nodes
    const links: GraphLink[] = [];
    linkMap.forEach((linkList, linkId) => {
      linkList.forEach((link, index) => {
        if (linkList.length > 1) {
          // Apply curvature for multiple links
          link.curvature = (index - (linkList.length - 1) / 2) * 0.3;
        }
        links.push(link);
      });
    });

    setGraphData({ nodes, links });
  }, [exchangeRates, arbitrageResult]);

  const handleLinkHover = (link: GraphLink | null, event?: MouseEvent) => {
    setHoveredLink(link);
    
    if (link && event) {
      setTooltip({
        x: event.clientX + 10,
        y: event.clientY - 10,
        content: `${link.source} → ${link.target}: ${link.rate.toFixed(6)}`
      });
    } else {
      setTooltip(null);
    }
  };

  const handleNodeDrag = (node: GraphNode) => {
    // Fix node position during drag
    node.fx = node.x;
    node.fy = node.y;
  };

  const handleNodeDragEnd = (node: GraphNode) => {
    // Release node position after drag
    node.fx = undefined;
    node.fy = undefined;
  };

  const handleEngineStop = () => {
    // Auto-fit graph when simulation stops
    if (graphRef.current) {
      graphRef.current.zoomToFit(400, 50);
    }
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex justify-between items-center">
          <div>
            <CardTitle>Vizualizace měnového grafu</CardTitle>
            <CardDescription>
              Síť směnných kurzů a arbitrážních příležitostí
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Badge variant="outline" className="flex items-center gap-1">
              <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
              Normální měna
            </Badge>
            <Badge variant="outline" className="flex items-center gap-1">
              <div className="w-2 h-2 bg-red-500 rounded-full"></div>
              Arbitráž
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="relative border rounded-lg overflow-hidden bg-gray-50">
          {graphData.nodes.length > 0 ? (
            <ForceGraph2D
              ref={graphRef}
              graphData={graphData}
              width={width}
              height={height}
              backgroundColor="#f8fafc"
              
              // Node styling
              nodeLabel="name"
              nodeColor={(node: any) => node.color}
              nodeRelSize={4}
              nodeVal={(node: any) => node.size}
              
              // Link styling
              linkColor={(link: any) => link.color}
              linkWidth={(link: any) => link.width}
              linkCurvature={(link: any) => link.curvature}
              linkDirectionalArrowLength={6}
              linkDirectionalArrowRelPos={1}
              linkDirectionalArrowColor={(link: any) => link.color}
              
              // Interactions
              onLinkHover={handleLinkHover}
              onNodeDrag={handleNodeDrag}
              onNodeDragEnd={handleNodeDragEnd}
              onEngineStop={handleEngineStop}
              
              // Physics
              linkDistance={80}
              linkStrength={0.5}
              chargeStrength={-300}
              
              // Rendering
              nodeCanvasObject={(node: any, ctx, globalScale) => {
                const label = node.name;
                const fontSize = 12 / globalScale;
                ctx.font = `${fontSize}px Sans-Serif`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                
                // Draw node circle
                ctx.beginPath();
                ctx.arc(node.x, node.y, node.size, 0, 2 * Math.PI, false);
                ctx.fillStyle = node.color;
                ctx.fill();
                
                // Draw border
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 2 / globalScale;
                ctx.stroke();
                
                // Draw label
                ctx.fillStyle = '#ffffff';
                ctx.fillText(label, node.x, node.y);
              }}
              
              linkCanvasObject={(link: any, ctx, globalScale) => {
                const start = link.source;
                const end = link.target;
                
                // Skip default rendering, we'll do custom
                if (!start || !end || typeof start !== 'object' || typeof end !== 'object') return;
                
                ctx.strokeStyle = link.color;
                ctx.lineWidth = link.width / globalScale;
                
                ctx.beginPath();
                if (link.curvature) {
                  // Draw curved line
                  const dx = end.x - start.x;
                  const dy = end.y - start.y;
                  const midX = start.x + dx / 2;
                  const midY = start.y + dy / 2;
                  const offsetX = -dy * link.curvature;
                  const offsetY = dx * link.curvature;
                  
                  ctx.moveTo(start.x, start.y);
                  ctx.quadraticCurveTo(midX + offsetX, midY + offsetY, end.x, end.y);
                } else {
                  // Draw straight line
                  ctx.moveTo(start.x, start.y);
                  ctx.lineTo(end.x, end.y);
                }
                ctx.stroke();
                
                // Draw arrow
                if (link.width > 1) {
                  const arrowLength = 8 / globalScale;
                  const dx = end.x - start.x;
                  const dy = end.y - start.y;
                  const angle = Math.atan2(dy, dx);
                  
                  ctx.fillStyle = link.color;
                  ctx.beginPath();
                  ctx.moveTo(end.x, end.y);
                  ctx.lineTo(
                    end.x - arrowLength * Math.cos(angle - Math.PI / 6),
                    end.y - arrowLength * Math.sin(angle - Math.PI / 6)
                  );
                  ctx.lineTo(
                    end.x - arrowLength * Math.cos(angle + Math.PI / 6),
                    end.y - arrowLength * Math.sin(angle + Math.PI / 6)
                  );
                  ctx.closePath();
                  ctx.fill();
                }
              }}
            />
          ) : (
            <div className="flex items-center justify-center h-96 text-gray-500">
              <div className="text-center">
                <p className="text-lg font-medium">Žádná data pro vizualizaci</p>
                <p className="text-sm">Přidejte směnné kurzy pro zobrazení grafu</p>
              </div>
            </div>
          )}
          
          {/* Tooltip */}
          {tooltip && (
            <div
              className="absolute z-50 px-2 py-1 text-xs bg-gray-900 text-white rounded shadow-lg pointer-events-none"
              style={{
                left: tooltip.x,
                top: tooltip.y,
                transform: 'translate(-50%, -100%)'
              }}
            >
              {tooltip.content}
            </div>
          )}
        </div>
        
        {/* Graph Statistics */}
        {graphData.nodes.length > 0 && (
          <div className="mt-4 flex justify-between text-sm text-gray-600">
            <div className="flex gap-4">
              <span>{graphData.nodes.length} měn</span>
              <span>{graphData.links.length} směnných kurzů</span>
            </div>
            {arbitrageResult && arbitrageResult.cycles.length > 0 && (
              <div className="text-red-600 font-medium">
                {arbitrageResult.cycles.length} arbitrážních cyklů detekováno
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}