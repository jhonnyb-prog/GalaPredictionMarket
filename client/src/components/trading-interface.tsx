import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, Settings } from "lucide-react";
import { MarketData } from "@/types/market";
import { calculateSharesFromAmount, calculatePotentialReturn } from "@/lib/amm";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useMutation, useQueryClient } from "@tanstack/react-query";

interface TradingInterfaceProps {
  market: MarketData;
  currentUser: { id: string; walletAddress: string } | null;
}

export function TradingInterface({ market, currentUser }: TradingInterfaceProps) {
  const [selectedOutcome, setSelectedOutcome] = useState<'yes' | 'no'>('yes');
  const [orderType, setOrderType] = useState<'market' | 'limit'>('market');
  const [orderSide, setOrderSide] = useState<'buy' | 'sell'>('buy');
  const [amount, setAmount] = useState('');
  const [limitPrice, setLimitPrice] = useState('');
  const [maxSlippage, setMaxSlippage] = useState('5');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const currentPrice = selectedOutcome === 'yes' ? parseFloat(market.yesPrice) : parseFloat(market.noPrice);
  const shares = amount ? calculateSharesFromAmount(parseFloat(amount), currentPrice) : 0;
  const potentialReturn = shares ? calculatePotentialReturn(shares, currentPrice) : 0;

  const tradeMutation = useMutation({
    mutationFn: async (orderData: any) => {
      const response = await apiRequest('POST', '/api/orders', orderData);
      return response.json();
    },
    onSuccess: (data) => {
      const message = data.executed 
        ? `Successfully ${orderSide} ${shares.toFixed(1)} ${selectedOutcome.toUpperCase()} shares${data.executionPrice ? ` at $${data.executionPrice.toFixed(3)}` : ''}`
        : data.message || `${orderType === 'limit' ? 'Limit' : 'Market'} order placed successfully`;
      
      toast({
        title: data.executed ? "Trade Executed" : "Order Placed",
        description: message,
      });
      setAmount('');
      if (orderType === 'limit') setLimitPrice('');
      queryClient.invalidateQueries({ queryKey: ['/api/markets', market.id] });
      queryClient.invalidateQueries({ queryKey: ['/api/users', currentUser?.id, 'positions'] });
      queryClient.invalidateQueries({ queryKey: ['/api/users', currentUser?.id, 'balance'] });
      queryClient.invalidateQueries({ queryKey: ['/api/users', currentUser?.id, 'orders'] });
      queryClient.invalidateQueries({ queryKey: ['/api/stats'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/fees'] });
    },
    onError: (error: any) => {
      toast({
        title: "Trade Failed",
        description: error.message || "Failed to execute trade",
        variant: "destructive",
      });
    },
  });

  const handleTrade = () => {
    if (!currentUser) {
      toast({
        title: "Connect Wallet",
        description: "Please connect your wallet to trade",
        variant: "destructive",
      });
      return;
    }

    if (!amount || parseFloat(amount) <= 0) {
      toast({
        title: "Invalid Amount",
        description: "Please enter a valid amount",
        variant: "destructive",
      });
      return;
    }

    if (orderType === 'limit' && (!limitPrice || parseFloat(limitPrice) <= 0)) {
      toast({
        title: "Invalid Limit Price",
        description: "Please enter a valid limit price for limit orders",
        variant: "destructive",
      });
      return;
    }

    const orderData = {
      userId: currentUser.id,
      marketId: market.id,
      type: orderType,
      side: orderSide,
      outcome: selectedOutcome,
      amount: amount,
      shares: shares.toString(),
      ...(orderType === 'limit' && { limitPrice }),
      maxSlippage: (parseFloat(maxSlippage) / 100).toString(),
      ...(minPrice && { minPrice }),
      ...(maxPrice && { maxPrice }),
    };

    tradeMutation.mutate(orderData);
  };

  return (
    <div className="bg-card border border-border rounded-lg p-6">
      <h3 className="text-lg font-semibold text-foreground mb-4">Advanced Trading</h3>
      
      <Tabs value={orderType} onValueChange={(value) => setOrderType(value as 'market' | 'limit')} className="mb-4">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="market" data-testid="market-order-tab">Market Order</TabsTrigger>
          <TabsTrigger value="limit" data-testid="limit-order-tab">Limit Order</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Order Side Selection */}
      <div className="flex space-x-1 mb-4 bg-muted rounded-lg p-1">
        <Button
          variant={orderSide === 'buy' ? 'default' : 'ghost'}
          className={`flex-1 py-2 px-3 text-sm font-medium rounded-md ${
            orderSide === 'buy' 
              ? 'bg-background text-foreground' 
              : 'text-muted-foreground'
          }`}
          onClick={() => setOrderSide('buy')}
          data-testid="buy-side-btn"
        >
          BUY
        </Button>
        <Button
          variant={orderSide === 'sell' ? 'default' : 'ghost'}
          className={`flex-1 py-2 px-3 text-sm font-medium rounded-md ${
            orderSide === 'sell' 
              ? 'bg-background text-foreground' 
              : 'text-muted-foreground'
          }`}
          onClick={() => setOrderSide('sell')}
          data-testid="sell-side-btn"
        >
          SELL
        </Button>
      </div>
      
      {/* Outcome Selection */}
      <div className="flex space-x-1 mb-4 bg-muted rounded-lg p-1">
        <Button
          variant={selectedOutcome === 'yes' ? 'default' : 'ghost'}
          className={`flex-1 py-2 px-3 text-sm font-medium rounded-md ${
            selectedOutcome === 'yes' 
              ? 'bg-background text-foreground' 
              : 'text-muted-foreground'
          }`}
          onClick={() => setSelectedOutcome('yes')}
          data-testid="trade-yes-btn"
        >
          YES {Math.round(parseFloat(market.yesPrice) * 100)}¢
        </Button>
        <Button
          variant={selectedOutcome === 'no' ? 'default' : 'ghost'}
          className={`flex-1 py-2 px-3 text-sm font-medium rounded-md ${
            selectedOutcome === 'no' 
              ? 'bg-background text-foreground' 
              : 'text-muted-foreground'
          }`}
          onClick={() => setSelectedOutcome('no')}
          data-testid="trade-no-btn"
        >
          NO {Math.round(parseFloat(market.noPrice) * 100)}¢
        </Button>
      </div>

      {/* Trading Inputs */}
      <div className="space-y-4">
        <div>
          <Label htmlFor="trade-amount" className="block text-sm font-medium text-foreground mb-2">
            Amount (USDC)
          </Label>
          <Input
            id="trade-amount"
            type="number"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full"
            data-testid="trade-amount-input"
          />
        </div>

        {orderType === 'limit' && (
          <div>
            <Label htmlFor="limit-price" className="block text-sm font-medium text-foreground mb-2">
              Limit Price ($)
            </Label>
            <Input
              id="limit-price"
              type="number"
              placeholder={currentPrice.toFixed(3)}
              value={limitPrice}
              onChange={(e) => setLimitPrice(e.target.value)}
              className="w-full"
              data-testid="limit-price-input"
            />
          </div>
        )}

        {/* Advanced Options */}
        <Collapsible open={showAdvanced} onOpenChange={setShowAdvanced}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" className="w-full justify-between text-sm" data-testid="advanced-options-btn">
              <span className="flex items-center">
                <Settings className="w-4 h-4 mr-2" />
                Advanced Options
              </span>
              <ChevronDown className={`w-4 h-4 transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-4 pt-4">
            <div>
              <Label htmlFor="max-slippage" className="block text-sm font-medium text-foreground mb-2">
                Max Slippage (%)
              </Label>
              <Input
                id="max-slippage"
                type="number"
                placeholder="5"
                value={maxSlippage}
                onChange={(e) => setMaxSlippage(e.target.value)}
                className="w-full"
                data-testid="max-slippage-input"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="min-price" className="block text-sm font-medium text-foreground mb-2">
                  Min Price ($)
                </Label>
                <Input
                  id="min-price"
                  type="number"
                  placeholder="0.05"
                  value={minPrice}
                  onChange={(e) => setMinPrice(e.target.value)}
                  className="w-full"
                  data-testid="min-price-input"
                />
              </div>
              <div>
                <Label htmlFor="max-price" className="block text-sm font-medium text-foreground mb-2">
                  Max Price ($)
                </Label>
                <Input
                  id="max-price"
                  type="number"
                  placeholder="0.95"
                  value={maxPrice}
                  onChange={(e) => setMaxPrice(e.target.value)}
                  className="w-full"
                  data-testid="max-price-input"
                />
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>
        
        {/* Trade Summary */}
        <div className="bg-muted/50 rounded-lg p-3">
          <div className="flex justify-between text-sm mb-1">
            <span className="text-muted-foreground">Order Type:</span>
            <span className="text-foreground font-medium capitalize" data-testid="order-type-display">
              {orderType} {orderSide}
            </span>
          </div>
          <div className="flex justify-between text-sm mb-1">
            <span className="text-muted-foreground">Shares to {orderSide}:</span>
            <span className="text-foreground font-medium" data-testid="shares-estimate">
              {shares.toFixed(1)}
            </span>
          </div>
          <div className="flex justify-between text-sm mb-1">
            <span className="text-muted-foreground">
              {orderType === 'limit' && limitPrice ? 'Limit' : 'Current'} price:
            </span>
            <span className="text-foreground font-medium" data-testid="execution-price">
              ${orderType === 'limit' && limitPrice ? parseFloat(limitPrice).toFixed(3) : currentPrice.toFixed(3)}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Potential {orderSide === 'buy' ? 'return' : 'proceeds'}:</span>
            <span className="text-chart-1 font-medium" data-testid="potential-return">
              {orderSide === 'buy' ? '+' : ''}${potentialReturn.toFixed(2)}
            </span>
          </div>
        </div>

        <Button
          className="w-full py-3 font-medium"
          onClick={handleTrade}
          disabled={!amount || parseFloat(amount) <= 0 || tradeMutation.isPending || (orderType === 'limit' && (!limitPrice || parseFloat(limitPrice) <= 0))}
          data-testid="place-trade-btn"
        >
          {tradeMutation.isPending 
            ? 'Processing...' 
            : `${orderType === 'limit' ? 'Place Limit' : orderSide === 'buy' ? 'Buy' : 'Sell'} ${selectedOutcome.toUpperCase()} for $${amount || '0.00'}`}
        </Button>

        <div className="text-xs text-muted-foreground text-center">
          Trading fee: {(parseFloat(market.tradingFee) * 100).toFixed(1)}% • Max slippage: {maxSlippage}%
          {orderType === 'limit' && <span> • Limit orders execute when price conditions are met</span>}
        </div>
      </div>
    </div>
  );
}
