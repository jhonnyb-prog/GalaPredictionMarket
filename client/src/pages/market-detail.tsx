import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { TradingInterface } from "@/components/trading-interface";
import { PriceChart } from "@/components/price-chart";
import { OrderHistory } from "@/components/order-history";
import { MarketData, OrderData } from "@/types/market";
import { ArrowLeft } from "lucide-react";
import { useUser } from "@/contexts/UserContext";

interface Position {
  id: string;
  marketId: string;
  outcome: 'yes' | 'no';
  shares: string;
  avgPrice: string;
  totalCost: string;
  createdAt: string;
  updatedAt: string;
}

export default function MarketDetail() {
  const { id } = useParams();
  const { user: currentUser } = useUser();
  const currentUserId = currentUser?.id;

  const { data: market, isLoading: marketLoading } = useQuery<MarketData>({
    queryKey: ['/api/markets', id],
  });

  const { data: orders = [] } = useQuery<OrderData[]>({
    queryKey: ['/api/markets', id, 'orders'],
    enabled: !!id,
  });

  // Fetch user positions for this specific market
  const { data: userPositions = [] } = useQuery<Position[]>({
    queryKey: ['/api/users', currentUserId, 'positions'],
    enabled: !!currentUserId,
  });

  // Filter positions for this specific market
  const currentMarketPositions = userPositions.filter(position => position.marketId === id);

  const categoryColors = {
    crypto: "bg-accent/20 text-accent",
    politics: "bg-chart-2/20 text-chart-2",
    sports: "bg-chart-4/20 text-chart-4",
    tech: "bg-chart-3/20 text-chart-3",
    entertainment: "bg-chart-5/20 text-chart-5",
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const formatCurrency = (amount: string) => {
    const num = parseFloat(amount);
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(num);
  };

  const yesOrders = orders.filter(order => order.outcome === 'yes' && !order.filled);
  const noOrders = orders.filter(order => order.outcome === 'no' && !order.filled);

  if (marketLoading) {
    return (
      <main className="container mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="animate-pulse space-y-6">
          <div className="h-6 bg-muted rounded w-32"></div>
          <div className="h-8 bg-muted rounded w-3/4"></div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <div className="h-64 bg-muted rounded"></div>
              <div className="h-64 bg-muted rounded"></div>
            </div>
            <div className="h-96 bg-muted rounded"></div>
          </div>
        </div>
      </main>
    );
  }

  if (!market) {
    return (
      <main className="container mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="text-center py-12">
          <div className="text-2xl font-bold text-foreground mb-4">Market Not Found</div>
          <div className="text-muted-foreground mb-6">The market you're looking for doesn't exist.</div>
          <Link href="/">
            <Button>Back to Markets</Button>
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="container mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <div className="space-y-6">
        {/* Back Button */}
        <Link href="/">
          <Button variant="ghost" className="flex items-center space-x-2" data-testid="back-to-markets">
            <ArrowLeft className="w-5 h-5" />
            <span>Back to Markets</span>
          </Button>
        </Link>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Market Info */}
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-card border border-border rounded-lg p-6">
              <div className="flex items-center space-x-2 mb-4">
                <span className={`px-2 py-1 rounded-md text-sm ${categoryColors[market.category]}`}>
                  {market.category.charAt(0).toUpperCase() + market.category.slice(1)}
                </span>
                <span className="text-sm text-muted-foreground">
                  Ends {formatDate(market.endDate)}
                </span>
              </div>
              <h1 className="text-2xl font-bold text-foreground mb-4" data-testid="market-title">
                {market.question}
              </h1>
              {market.description && (
                <p className="text-muted-foreground mb-6" data-testid="market-description">
                  {market.description}
                </p>
              )}
              
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <div className="text-sm text-muted-foreground">Volume</div>
                  <div className="text-xl font-bold text-foreground" data-testid="market-volume">
                    {formatCurrency(market.volume)}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Liquidity</div>
                  <div className="text-xl font-bold text-foreground" data-testid="market-liquidity">
                    {formatCurrency(market.liquidity)}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Traders</div>
                  <div className="text-xl font-bold text-foreground" data-testid="market-traders">
                    {Math.floor(Math.random() * 200) + 50}
                  </div>
                </div>
              </div>
            </div>

            {/* Price Chart */}
            <PriceChart marketId={market.id} market={market} />

            {/* Order Book */}
            <div className="bg-card border border-border rounded-lg p-6">
              <h3 className="text-lg font-semibold text-foreground mb-4">Order Book</h3>
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <div className="text-sm font-medium text-chart-1 mb-2">YES Orders</div>
                  <div className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Price</span>
                      <span className="text-muted-foreground">Size</span>
                    </div>
                    {yesOrders.slice(0, 3).map((order, index) => (
                      <div key={order.id} className="flex justify-between text-sm">
                        <span className="text-chart-1">
                          ${parseFloat(order.price).toFixed(2)}
                        </span>
                        <span className="text-foreground">
                          {formatCurrency(order.amount)}
                        </span>
                      </div>
                    ))}
                    {yesOrders.length === 0 && (
                      <div className="text-sm text-muted-foreground">No orders</div>
                    )}
                  </div>
                </div>
                <div>
                  <div className="text-sm font-medium text-destructive mb-2">NO Orders</div>
                  <div className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Price</span>
                      <span className="text-muted-foreground">Size</span>
                    </div>
                    {noOrders.slice(0, 3).map((order, index) => (
                      <div key={order.id} className="flex justify-between text-sm">
                        <span className="text-destructive">
                          ${parseFloat(order.price).toFixed(2)}
                        </span>
                        <span className="text-foreground">
                          {formatCurrency(order.amount)}
                        </span>
                      </div>
                    ))}
                    {noOrders.length === 0 && (
                      <div className="text-sm text-muted-foreground">No orders</div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Trading Panel */}
          <div className="space-y-6">
            <TradingInterface market={market} currentUser={currentUser || undefined} />

            {/* Current Position */}
            <div className="bg-card border border-border rounded-lg p-6">
              <h3 className="text-lg font-semibold text-foreground mb-4">Your Position</h3>
              {currentMarketPositions.length === 0 ? (
                <div className="text-center py-4">
                  <div className="text-muted-foreground mb-2">No position in this market</div>
                  <div className="text-sm text-muted-foreground">Start trading to see your position here</div>
                </div>
              ) : (
                <div className="space-y-4">
                  {currentMarketPositions.map((position) => {
                    const currentPrice = position.outcome === 'yes' ? 
                      parseFloat(market?.yesPrice || '0') : 
                      parseFloat(market?.noPrice || '0');
                    const positionValue = parseFloat(position.shares) * currentPrice;
                    const pnl = positionValue - parseFloat(position.totalCost);
                    const pnlPercentage = ((pnl / parseFloat(position.totalCost)) * 100);

                    return (
                      <div key={position.id} className="border border-border rounded-lg p-4">
                        <div className="flex items-center justify-between mb-3">
                          <span className={`px-3 py-1 rounded-md text-sm font-medium ${
                            position.outcome === 'yes' 
                              ? 'bg-chart-1/20 text-chart-1' 
                              : 'bg-destructive/20 text-destructive'
                          }`}>
                            {position.outcome.toUpperCase()}
                          </span>
                          <div className={`text-sm font-medium ${pnl >= 0 ? 'text-chart-1' : 'text-destructive'}`}>
                            {pnl >= 0 ? '+' : ''}{formatCurrency(pnl.toString())} ({pnlPercentage.toFixed(1)}%)
                          </div>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <div className="text-muted-foreground">Shares</div>
                            <div className="font-medium" data-testid={`position-shares-${position.outcome}`}>
                              {parseFloat(position.shares).toFixed(1)}
                            </div>
                          </div>
                          <div>
                            <div className="text-muted-foreground">Avg Price</div>
                            <div className="font-medium">{formatCurrency(position.avgPrice)}</div>
                          </div>
                          <div>
                            <div className="text-muted-foreground">Current Price</div>
                            <div className="font-medium">{formatCurrency(currentPrice.toString())}</div>
                          </div>
                          <div>
                            <div className="text-muted-foreground">Current Value</div>
                            <div className="font-medium">{formatCurrency(positionValue.toString())}</div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Order History - Full Width */}
        <div className="bg-card border border-border rounded-lg p-6">
          <OrderHistory marketId={id!} />
        </div>
      </div>
    </main>
  );
}
