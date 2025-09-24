import { MarketData } from "@/types/market";
import { Link } from "wouter";

interface MarketCardProps {
  market: MarketData;
}

export function MarketCard({ market }: MarketCardProps) {
  const categoryColors = {
    crypto: "bg-accent/20 text-accent",
    politics: "bg-chart-2/20 text-chart-2",
    sports: "bg-chart-4/20 text-chart-4",
    tech: "bg-chart-3/20 text-chart-3",
    entertainment: "bg-chart-5/20 text-chart-5",
  };
  
  const categoryIcons = {
    crypto: "🪙",
    politics: "🗳️",
    sports: "⚽",
    tech: "💻",
    entertainment: "🎬",
  };
  
  const oracleIcons = {
    coingecko: "📈",
    sportradar: "🏆",
    ap_elections: "📊",
    manual: "✋",
  };
  
  const oracleNames = {
    coingecko: "CoinGecko",
    sportradar: "Sportradar",
    ap_elections: "AP Elections",
    manual: "Manual",
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
    if (num >= 1000) {
      return `$${(num / 1000).toFixed(0)}K`;
    }
    return `$${num.toFixed(0)}`;
  };

  const formatPrice = (price: string) => {
    return `${Math.round(parseFloat(price) * 100)}¢`;
  };

  return (
    <Link href={`/market/${market.id}`}>
      <div 
        className={`gaming-card rounded-lg p-6 cursor-pointer category-${market.category}`}
        data-testid={`market-card-${market.id}`}
      >
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1">
            <h3 className="font-semibold text-foreground mb-2" data-testid={`market-question-${market.id}`}>
              {market.question}
            </h3>
            <div className="flex items-center justify-between text-sm text-muted-foreground mb-2">
              <div className="flex items-center space-x-2">
                <span className={`px-2 py-1 rounded-md text-sm font-medium ${categoryColors[market.category]}`}>
                  {categoryIcons[market.category]} {market.category.charAt(0).toUpperCase() + market.category.slice(1)}
                </span>
                <span>Ends {formatDate(market.endDate)}</span>
              </div>
            </div>
            <div className="flex items-center space-x-1 text-xs text-muted-foreground">
              <span className="text-primary">{oracleIcons[market.oracleType || 'manual']}</span>
              <span>Oracle: {oracleNames[market.oracleType || 'manual']}</span>
            </div>
          </div>
        </div>
        
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="bg-chart-1/20 border-2 border-chart-1/30 rounded-lg p-3 text-center hover:bg-chart-1/30 transition-colors">
            <div 
              className="text-xl font-bold text-chart-1"
              data-testid={`yes-price-${market.id}`}
            >
              {formatPrice(market.yesPrice)}
            </div>
            <div className="text-xs text-muted-foreground font-semibold">YES 💚</div>
          </div>
          <div className="bg-destructive/20 border-2 border-destructive/30 rounded-lg p-3 text-center hover:bg-destructive/30 transition-colors">
            <div 
              className="text-xl font-bold text-destructive"
              data-testid={`no-price-${market.id}`}
            >
              {formatPrice(market.noPrice)}
            </div>
            <div className="text-xs text-muted-foreground font-semibold">NO ❌</div>
          </div>
        </div>
        
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            Volume: <span data-testid={`volume-${market.id}`}>{formatCurrency(market.volume)}</span>
          </span>
          <span className="text-muted-foreground">
            Liquidity: <span data-testid={`liquidity-${market.id}`}>{formatCurrency(market.liquidity)}</span>
          </span>
        </div>
      </div>
    </Link>
  );
}
