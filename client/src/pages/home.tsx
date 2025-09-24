import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MarketCard } from "@/components/market-card";
import { MarketData } from "@/types/market";
import { Search } from "lucide-react";

export default function Home() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");

  const { data: markets = [], isLoading } = useQuery<MarketData[]>({
    queryKey: ['/api/markets'],
  });

  const { data: stats } = useQuery({
    queryKey: ['/api/stats'],
  });

  const filteredMarkets = markets.filter(market => {
    const matchesSearch = market.question.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === "all" || market.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const formatCurrency = (amount: string | number) => {
    const num = typeof amount === 'string' ? parseFloat(amount) : amount;
    if (num >= 1000000) {
      return `$${(num / 1000000).toFixed(1)}M`;
    }
    if (num >= 1000) {
      return `$${(num / 1000).toFixed(1)}K`;
    }
    return `$${num.toFixed(0)}`;
  };

  if (isLoading) {
    return (
      <main className="container mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="space-y-6">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-muted rounded w-1/3"></div>
            <div className="h-4 bg-muted rounded w-1/2"></div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="bg-card border border-border rounded-lg p-4 animate-pulse">
                <div className="h-8 bg-muted rounded mb-2"></div>
                <div className="h-4 bg-muted rounded"></div>
              </div>
            ))}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="container mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold neon-text">Prediction Markets</h1>
            <p className="text-muted-foreground">🎮 Trade on real-world events with gaming precision</p>
          </div>
          <div className="flex items-center space-x-3">
            <div className="relative">
              <Input
                type="text"
                placeholder="Search markets..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-64 pl-10"
                data-testid="search-markets"
              />
              <Search className="absolute left-3 top-2.5 w-5 h-5 text-muted-foreground" />
            </div>
            <Select value={selectedCategory} onValueChange={setSelectedCategory}>
              <SelectTrigger className="w-48 glow-button" data-testid="category-filter">
                <SelectValue placeholder="🎯 All Categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">🎯 All Categories</SelectItem>
                <SelectItem value="crypto">🪙 Crypto</SelectItem>
                <SelectItem value="politics">🗳️ Politics</SelectItem>
                <SelectItem value="sports">⚽ Sports</SelectItem>
                <SelectItem value="tech">💻 Tech</SelectItem>
                <SelectItem value="entertainment">🎬 Entertainment</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Stats Bar */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="gaming-card rounded-lg p-4 glow-button">
            <div className="text-2xl font-bold text-chart-1" data-testid="total-volume">
              💰 {stats ? formatCurrency((stats as any).totalVolume) : '$0'}
            </div>
            <div className="text-sm text-muted-foreground">24h Volume</div>
          </div>
          <div className="gaming-card rounded-lg p-4 glow-button">
            <div className="text-2xl font-bold text-chart-2" data-testid="active-markets">
              🎯 {(stats as any)?.activeMarkets || 0}
            </div>
            <div className="text-sm text-muted-foreground">Active Markets</div>
          </div>
          <div className="gaming-card rounded-lg p-4 glow-button">
            <div className="text-2xl font-bold text-chart-4" data-testid="total-trades">
              ⚡ {(stats as any)?.totalTrades || 0}
            </div>
            <div className="text-sm text-muted-foreground">Total Trades</div>
          </div>
          <div className="gaming-card rounded-lg p-4 glow-button">
            <div className="text-2xl font-bold text-chart-3" data-testid="total-users">
              🎮 {(stats as any)?.totalUsers || 0}
            </div>
            <div className="text-sm text-muted-foreground">Active Traders</div>
          </div>
        </div>

        {/* Market Grid */}
        {filteredMarkets.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-muted-foreground mb-4">No markets found</div>
            {searchTerm && (
              <div className="text-sm text-muted-foreground">
                Try adjusting your search or filter criteria
              </div>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredMarkets.map((market) => (
              <MarketCard key={market.id} market={market} />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
