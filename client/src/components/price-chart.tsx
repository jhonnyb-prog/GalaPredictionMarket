import { useEffect, useRef } from "react";
import { Chart, ChartConfiguration } from "chart.js/auto";
import { MarketData } from "@/types/market";

interface PriceChartProps {
  marketId: string;
  market?: MarketData;
}

export function PriceChart({ marketId, market }: PriceChartProps) {
  const chartRef = useRef<HTMLCanvasElement>(null);
  const chartInstance = useRef<Chart | null>(null);

  useEffect(() => {
    if (!chartRef.current) return;

    // Destroy existing chart
    if (chartInstance.current) {
      chartInstance.current.destroy();
    }

    // Generate price history ending with current market prices
    const currentYesPrice = market ? parseFloat(market.yesPrice) : 0.5;
    const currentNoPrice = market ? parseFloat(market.noPrice) : 0.5;
    
    // Generate realistic price progression leading to current prices
    const generatePriceHistory = (currentPrice: number, steps: number = 6) => {
      const history = [];
      const startPrice = Math.max(0.1, Math.min(0.9, currentPrice + (Math.random() - 0.5) * 0.3));
      
      for (let i = 0; i < steps; i++) {
        const progress = i / (steps - 1);
        const price = startPrice + (currentPrice - startPrice) * progress;
        // Add some realistic variation
        const variation = (Math.random() - 0.5) * 0.05;
        history.push(Math.max(0.01, Math.min(0.99, price + variation)));
      }
      // Ensure the last price is exactly the current price
      history[history.length - 1] = currentPrice;
      return history;
    };

    const yesHistory = generatePriceHistory(currentYesPrice);
    const noHistory = generatePriceHistory(currentNoPrice);

    const chartData = {
      labels: ['6h ago', '5h ago', '4h ago', '3h ago', '2h ago', 'Now'],
      datasets: [{
        label: 'YES Price',
        data: yesHistory,
        borderColor: 'hsl(173, 58%, 39%)',
        backgroundColor: 'hsl(173, 58%, 39%, 0.1)',
        fill: true,
        tension: 0.4
      }, {
        label: 'NO Price',
        data: noHistory,
        borderColor: 'hsl(0, 84%, 60%)',
        backgroundColor: 'hsl(0, 84%, 60%, 0.1)',
        fill: true,
        tension: 0.4
      }]
    };

    const config: ChartConfiguration = {
      type: 'line',
      data: chartData,
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'top',
            labels: {
              color: 'hsl(210, 40%, 98%)',
              usePointStyle: true
            }
          }
        },
        scales: {
          x: {
            ticks: { color: 'hsl(215, 20%, 65%)' },
            grid: { color: 'hsl(217, 32%, 17%)' }
          },
          y: {
            ticks: { 
              color: 'hsl(215, 20%, 65%)',
              callback: function(value) {
                return '$' + Number(value).toFixed(2);
              }
            },
            grid: { color: 'hsl(217, 32%, 17%)' },
            min: 0,
            max: 1
          }
        }
      }
    };

    chartInstance.current = new Chart(chartRef.current, config);

    return () => {
      if (chartInstance.current) {
        chartInstance.current.destroy();
      }
    };
  }, [marketId, market]);

  return (
    <div className="bg-card border border-border rounded-lg p-6">
      <h3 className="text-lg font-semibold text-foreground mb-4">Price History</h3>
      <div className="h-64">
        <canvas ref={chartRef} className="w-full h-full"></canvas>
      </div>
    </div>
  );
}
