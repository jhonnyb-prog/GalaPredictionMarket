import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { PositionData, TradeData, OrderData } from "@/types/market";
import { useCurrentUserId } from "@/contexts/UserContext";

export default function Portfolio() {
  const [activeTab, setActiveTab] = useState<'positions' | 'history' | 'orders' | 'withdraw'>('positions');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [galachainAddress, setGalachainAddress] = useState('');
  const currentUserId = useCurrentUserId();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: positions = [] } = useQuery<PositionData[]>({
    queryKey: ['/api/users', currentUserId, 'positions'],
  });

  const { data: trades = [] } = useQuery<TradeData[]>({
    queryKey: ['/api/users', currentUserId, 'trades'],
  });

  const { data: orders = [] } = useQuery<OrderData[]>({
    queryKey: ['/api/users', currentUserId, 'orders'],
  });

  const { data: balance } = useQuery({
    queryKey: ['/api/users', currentUserId, 'balance'],
  });


  const resetBalanceMutation = useMutation({
    mutationFn: async () => {
      if (!currentUserId) throw new Error('User not authenticated');
      const response = await apiRequest('POST', `/api/users/${currentUserId}/reset-balance`, {});
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Balance Reset",
        description: data.message || "Your balance has been reset to $1000 for testing",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/users', currentUserId, 'balance'] });
    },
    onError: (error: any) => {
      toast({
        title: "Reset Failed", 
        description: error.message || "Failed to reset balance. Please try again.",
        variant: "destructive",
      });
    },
  });

  const withdrawMutation = useMutation({
    mutationFn: async (data: { amount: string; address: string }) => {
      if (!currentUserId) throw new Error('User not authenticated');
      const response = await apiRequest('POST', `/api/users/${currentUserId}/withdraw`, data);
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Withdrawal Submitted",
        description: `Successfully withdrew $${withdrawAmount} USDC to ${galachainAddress.slice(0, 10)}...`,
      });
      setWithdrawAmount('');
      setGalachainAddress('');
      queryClient.invalidateQueries({ queryKey: ['/api/users', currentUserId, 'balance'] });
    },
    onError: (error: any) => {
      toast({
        title: "Withdrawal Failed",
        description: error.message || "Failed to process withdrawal. Please try again.",
        variant: "destructive",
      });
    },
  });

  const tabs = [
    { id: 'positions', label: 'Positions' },
    { id: 'history', label: 'History' },
    { id: 'orders', label: 'Orders' },
    { id: 'withdraw', label: 'Withdraw' }
  ] as const;

  const calculatePortfolioValue = () => {
    // Mock calculation - in real app, this would use current market prices
    return positions.reduce((total, position) => {
      const currentValue = parseFloat(position.shares) * 0.7; // Mock current price
      return total + currentValue;
    }, 0);
  };

  const portfolioValue = calculatePortfolioValue();
  const totalCost = positions.reduce((total, pos) => total + parseFloat(pos.totalCost), 0);
  const pnl = portfolioValue - totalCost;

  return (
    <main className="container mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Portfolio</h1>
            <p className="text-muted-foreground">🎮 Testing Environment - Track your positions and trading history</p>
          </div>
          <div className="flex gap-3">
            <Button 
              variant="outline" 
              onClick={() => resetBalanceMutation.mutate()}
              disabled={resetBalanceMutation.isPending}
              data-testid="reset-balance-btn"
            >
              {resetBalanceMutation.isPending ? 'Resetting...' : 'Reset to $1000'}
            </Button>
          </div>
        </div>

        {/* Portfolio Summary */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-card border border-border rounded-lg p-4">
            <div className="text-2xl font-bold text-foreground" data-testid="portfolio-value">
              ${portfolioValue.toFixed(2)}
            </div>
            <div className="text-sm text-muted-foreground">Portfolio Value</div>
            <div className={`text-sm ${pnl >= 0 ? 'text-chart-1' : 'text-destructive'}`}>
              {pnl >= 0 ? '+' : ''}${pnl.toFixed(2)} ({((pnl / totalCost) * 100).toFixed(1)}%)
            </div>
          </div>
          <div className="bg-card border border-border rounded-lg p-4">
            <div className="text-2xl font-bold text-foreground" data-testid="available-balance">
              ${(balance as any)?.balance || '0.00'}
            </div>
            <div className="text-sm text-muted-foreground">Available Balance</div>
          </div>
          <div className="bg-card border border-border rounded-lg p-4">
            <div className="text-2xl font-bold text-foreground" data-testid="open-positions">
              {positions.length}
            </div>
            <div className="text-sm text-muted-foreground">Open Positions</div>
          </div>
          <div className="bg-card border border-border rounded-lg p-4">
            <div className="text-2xl font-bold text-foreground" data-testid="portfolio-pnl">
              {pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}
            </div>
            <div className="text-sm text-muted-foreground">Total P&L</div>
            <div className={`text-sm ${pnl >= 0 ? 'text-chart-1' : 'text-destructive'}`}>
              {((pnl / totalCost) * 100).toFixed(1)}%
            </div>
          </div>
        </div>

        {/* Portfolio Tabs */}
        <div className="flex space-x-1 bg-muted rounded-lg p-1 w-fit">
          {tabs.map((tab) => (
            <Button
              key={tab.id}
              variant={activeTab === tab.id ? 'default' : 'ghost'}
              className={`py-2 px-4 text-sm font-medium rounded-md ${
                activeTab === tab.id 
                  ? 'bg-background text-foreground' 
                  : 'text-muted-foreground'
              }`}
              onClick={() => setActiveTab(tab.id)}
              data-testid={`portfolio-tab-${tab.id}`}
            >
              {tab.label}
            </Button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          {activeTab === 'positions' && (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left p-4 text-sm font-medium text-muted-foreground">Market</th>
                    <th className="text-left p-4 text-sm font-medium text-muted-foreground">Position</th>
                    <th className="text-left p-4 text-sm font-medium text-muted-foreground">Shares</th>
                    <th className="text-left p-4 text-sm font-medium text-muted-foreground">Avg Price</th>
                    <th className="text-left p-4 text-sm font-medium text-muted-foreground">Current</th>
                    <th className="text-left p-4 text-sm font-medium text-muted-foreground">P&L</th>
                  </tr>
                </thead>
                <tbody>
                  {positions.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center py-8 text-muted-foreground">
                        No positions yet. Start trading to see your positions here.
                      </td>
                    </tr>
                  ) : (
                    positions.map((position) => {
                      const currentPrice = 0.7; // Mock current price
                      const currentValue = parseFloat(position.shares) * currentPrice;
                      const positionPnl = currentValue - parseFloat(position.totalCost);
                      
                      return (
                        <tr key={position.id} className="border-t border-border">
                          <td className="p-4">
                            <div className="font-medium text-foreground">Market #{position.marketId.slice(0, 8)}...</div>
                            <div className="text-sm text-muted-foreground">Crypto</div>
                          </td>
                          <td className="p-4">
                            <span className={`px-2 py-1 rounded-md text-sm font-medium ${
                              position.outcome === 'yes' 
                                ? 'bg-chart-1/20 text-chart-1' 
                                : 'bg-destructive/20 text-destructive'
                            }`}>
                              {position.outcome.toUpperCase()}
                            </span>
                          </td>
                          <td className="p-4 text-foreground">{parseFloat(position.shares).toFixed(1)}</td>
                          <td className="p-4 text-foreground">${parseFloat(position.avgPrice).toFixed(2)}</td>
                          <td className="p-4 text-foreground">${currentPrice.toFixed(2)}</td>
                          <td className={`p-4 ${positionPnl >= 0 ? 'text-chart-1' : 'text-destructive'}`}>
                            {positionPnl >= 0 ? '+' : ''}${positionPnl.toFixed(2)}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === 'history' && (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left p-4 text-sm font-medium text-muted-foreground">Date</th>
                    <th className="text-left p-4 text-sm font-medium text-muted-foreground">Market</th>
                    <th className="text-left p-4 text-sm font-medium text-muted-foreground">Type</th>
                    <th className="text-left p-4 text-sm font-medium text-muted-foreground">Shares</th>
                    <th className="text-left p-4 text-sm font-medium text-muted-foreground">Price</th>
                    <th className="text-left p-4 text-sm font-medium text-muted-foreground">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {trades.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center py-8 text-muted-foreground">
                        No trading history yet. Start trading to see your history here.
                      </td>
                    </tr>
                  ) : (
                    trades.map((trade) => (
                      <tr key={trade.id} className="border-t border-border">
                        <td className="p-4 text-foreground">
                          {new Date(trade.createdAt).toLocaleDateString()}
                        </td>
                        <td className="p-4">
                          <div className="font-medium text-foreground">Market #{trade.marketId.slice(0, 8)}...</div>
                        </td>
                        <td className="p-4">
                          <span className={`px-2 py-1 rounded-md text-sm font-medium ${
                            trade.outcome === 'yes' 
                              ? 'bg-chart-1/20 text-chart-1' 
                              : 'bg-destructive/20 text-destructive'
                          }`}>
                            BUY {trade.outcome.toUpperCase()}
                          </span>
                        </td>
                        <td className="p-4 text-foreground">{parseFloat(trade.shares).toFixed(1)}</td>
                        <td className="p-4 text-foreground">${parseFloat(trade.price).toFixed(2)}</td>
                        <td className="p-4 text-foreground">${parseFloat(trade.amount).toFixed(2)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === 'orders' && (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left p-4 text-sm font-medium text-muted-foreground">Date</th>
                    <th className="text-left p-4 text-sm font-medium text-muted-foreground">Market</th>
                    <th className="text-left p-4 text-sm font-medium text-muted-foreground">Type</th>
                    <th className="text-left p-4 text-sm font-medium text-muted-foreground">Shares</th>
                    <th className="text-left p-4 text-sm font-medium text-muted-foreground">Price</th>
                    <th className="text-left p-4 text-sm font-medium text-muted-foreground">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center py-8 text-muted-foreground">
                        No orders yet. Start trading to see your orders here.
                      </td>
                    </tr>
                  ) : (
                    orders.map((order) => (
                      <tr key={order.id} className="border-t border-border">
                        <td className="p-4 text-foreground">
                          {new Date(order.createdAt).toLocaleDateString()}
                        </td>
                        <td className="p-4">
                          <div className="font-medium text-foreground">Market #{order.marketId.slice(0, 8)}...</div>
                        </td>
                        <td className="p-4">
                          <span className={`px-2 py-1 rounded-md text-sm font-medium ${
                            order.outcome === 'yes' 
                              ? 'bg-chart-1/20 text-chart-1' 
                              : 'bg-destructive/20 text-destructive'
                          }`}>
                            {order.type.toUpperCase()} {order.outcome.toUpperCase()}
                          </span>
                        </td>
                        <td className="p-4 text-foreground">{parseFloat(order.shares).toFixed(1)}</td>
                        <td className="p-4 text-foreground">${parseFloat(order.price).toFixed(2)}</td>
                        <td className="p-4">
                          <span className={`px-2 py-1 rounded-md text-sm ${
                            order.filled 
                              ? 'bg-chart-1/20 text-chart-1' 
                              : 'bg-chart-2/20 text-chart-2'
                          }`}>
                            {order.filled ? 'Filled' : 'Open'}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* Withdraw Tab */}
          {activeTab === 'withdraw' && (
            <div className="bg-card border border-border rounded-lg p-6">
              <div className="max-w-2xl">
                <h3 className="text-xl font-semibold text-foreground mb-2">Withdraw USDC</h3>
                <p className="text-muted-foreground mb-6">
                  Withdraw your USDC balance to your GalaChain wallet address. This is a demo withdrawal that will reduce your balance.
                </p>
                
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="galachain-address">GalaChain Wallet Address *</Label>
                    <Input
                      id="galachain-address"
                      type="text"
                      placeholder="Enter your GalaChain wallet address"
                      value={galachainAddress}
                      onChange={(e) => setGalachainAddress(e.target.value)}
                      data-testid="withdraw-address-input"
                      className="mt-1"
                    />
                    <div className="text-xs text-muted-foreground mt-1">
                      Enter a valid GalaChain wallet address to receive your USDC
                    </div>
                  </div>
                  
                  <div>
                    <Label htmlFor="withdraw-amount">Amount (USDC) *</Label>
                    <Input
                      id="withdraw-amount"
                      type="number"
                      min="1"
                      max={balance?.balance ? parseFloat(balance.balance) : 0}
                      placeholder="Enter amount to withdraw"
                      value={withdrawAmount}
                      onChange={(e) => setWithdrawAmount(e.target.value)}
                      data-testid="withdraw-amount-input"
                      className="mt-1"
                    />
                    <div className="text-xs text-muted-foreground mt-1">
                      Available balance: ${balance?.balance ? parseFloat(balance.balance).toFixed(2) : '0.00'} USDC
                    </div>
                  </div>
                  
                  <div className="bg-muted/10 border border-muted rounded-lg p-4">
                    <div className="flex items-start space-x-3">
                      <div className="w-5 h-5 bg-yellow-500 rounded-full flex items-center justify-center mt-0.5">
                        <span className="text-white text-xs font-bold">!</span>
                      </div>
                      <div>
                        <div className="font-medium text-foreground mb-1">Demo Withdrawal</div>
                        <div className="text-sm text-muted-foreground">
                          This is a testing environment. No actual withdrawal will occur - your balance will simply be reduced for demonstration purposes.
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex justify-end space-x-3 pt-4">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setWithdrawAmount('');
                        setGalachainAddress('');
                      }}
                      data-testid="withdraw-cancel-btn"
                    >
                      Clear Form
                    </Button>
                    <Button
                      onClick={() => withdrawMutation.mutate({ 
                        amount: withdrawAmount, 
                        address: galachainAddress 
                      })}
                      disabled={!withdrawAmount || !galachainAddress || withdrawMutation.isPending || 
                                parseFloat(withdrawAmount) <= 0 || 
                                parseFloat(withdrawAmount) > (balance?.balance ? parseFloat(balance.balance) : 0)}
                      data-testid="withdraw-submit-btn"
                    >
                      {withdrawMutation.isPending ? 'Processing...' : `Withdraw $${withdrawAmount || '0'} USDC`}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
