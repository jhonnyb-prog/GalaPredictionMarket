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
  const [activeTab, setActiveTab] = useState<'positions' | 'history' | 'orders' | 'withdraw' | 'apikeys'>('positions');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [galachainAddress, setGalachainAddress] = useState('');
  const [showApiKeySecret, setShowApiKeySecret] = useState<string | null>(null);
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

  const { data: apiKeys = [] } = useQuery<any[]>({
    queryKey: ['/api/me/apikeys'],
    enabled: activeTab === 'apikeys',
  });

  const createApiKeyMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/me/apikeys', {});
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "API Key Created",
        description: "Your API key has been generated successfully. Save the signing secret shown below - it will not be displayed again.",
      });
      setShowApiKeySecret(data.apiKey.signingSecret);
      queryClient.invalidateQueries({ queryKey: ['/api/me/apikeys'] });
    },
    onError: (error: any) => {
      toast({
        title: "API Key Creation Failed",
        description: error.message || "Failed to create API key. Please try again.",
        variant: "destructive",
      });
    },
  });

  const deleteApiKeyMutation = useMutation({
    mutationFn: async (keyId: string) => {
      const response = await apiRequest('DELETE', `/api/me/apikeys/${keyId}`, {});
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "API Key Deleted",
        description: "API key has been deleted successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/me/apikeys'] });
    },
    onError: (error: any) => {
      toast({
        title: "Deletion Failed",
        description: error.message || "Failed to delete API key. Please try again.",
        variant: "destructive",
      });
    },
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
    { id: 'withdraw', label: 'Withdraw' },
    { id: 'apikeys', label: 'API Keys' }
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

          {/* API Keys Tab */}
          {activeTab === 'apikeys' && (
            <div className="p-6 space-y-6">
              <div className="max-w-4xl">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-xl font-semibold text-foreground">API Keys</h3>
                    <p className="text-muted-foreground">
                      Generate API keys to access GalaMarket programmatically. Keys include read and trade permissions.
                    </p>
                  </div>
                  <Button 
                    onClick={() => createApiKeyMutation.mutate()}
                    disabled={createApiKeyMutation.isPending}
                    data-testid="generate-api-key-btn"
                    className="bg-chart-1 hover:bg-chart-1/90"
                  >
                    {createApiKeyMutation.isPending ? 'Generating...' : '🔑 Generate API Key'}
                  </Button>
                </div>

                {/* Show signing secret immediately after creation */}
                {showApiKeySecret && (
                  <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700 rounded-lg p-4 mb-6">
                    <div className="flex items-start space-x-3">
                      <div className="w-5 h-5 bg-yellow-500 rounded-full flex items-center justify-center mt-0.5">
                        <span className="text-white text-xs font-bold">!</span>
                      </div>
                      <div className="flex-1">
                        <div className="font-medium text-yellow-800 dark:text-yellow-200 mb-2">
                          Save Your Signing Secret - This Will Not Be Shown Again!
                        </div>
                        <div className="bg-white dark:bg-gray-800 border rounded-lg p-3 mb-3 font-mono text-sm break-all">
                          {showApiKeySecret}
                        </div>
                        <div className="text-sm text-yellow-700 dark:text-yellow-300 space-y-1">
                          <p>• Copy this signing secret to a secure location</p>
                          <p>• You'll need both the API Key ID and signing secret for API access</p>
                          <p>• The signing secret cannot be retrieved after closing this message</p>
                        </div>
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="mt-3"
                          onClick={() => setShowApiKeySecret(null)}
                        >
                          I've Saved It - Close This Message
                        </Button>
                      </div>
                    </div>
                  </div>
                )}

                {/* API Keys List */}
                <div className="bg-card border border-border rounded-lg overflow-hidden">
                  {apiKeys.length === 0 ? (
                    <div className="text-center py-12">
                      <div className="text-4xl mb-4">🔑</div>
                      <div className="text-lg font-medium text-foreground mb-2">No API Keys Yet</div>
                      <div className="text-muted-foreground mb-4">
                        Generate your first API key to start using the GalaMarket API
                      </div>
                      <Button 
                        onClick={() => createApiKeyMutation.mutate()}
                        disabled={createApiKeyMutation.isPending}
                        className="bg-chart-1 hover:bg-chart-1/90"
                      >
                        {createApiKeyMutation.isPending ? 'Generating...' : 'Generate Your First API Key'}
                      </Button>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead className="bg-muted/50">
                          <tr>
                            <th className="text-left p-4 text-sm font-medium text-muted-foreground">API Key ID</th>
                            <th className="text-left p-4 text-sm font-medium text-muted-foreground">Label</th>
                            <th className="text-left p-4 text-sm font-medium text-muted-foreground">Scopes</th>
                            <th className="text-left p-4 text-sm font-medium text-muted-foreground">Status</th>
                            <th className="text-left p-4 text-sm font-medium text-muted-foreground">Last Used</th>
                            <th className="text-left p-4 text-sm font-medium text-muted-foreground">Created</th>
                            <th className="text-left p-4 text-sm font-medium text-muted-foreground">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {apiKeys.map((apiKey: any) => (
                            <tr key={apiKey.id} className="border-t border-border">
                              <td className="p-4">
                                <div className="font-mono text-sm text-foreground">
                                  {apiKey.id}
                                </div>
                              </td>
                              <td className="p-4 text-foreground">{apiKey.label}</td>
                              <td className="p-4">
                                <div className="flex gap-1">
                                  {apiKey.scopes.map((scope: string) => (
                                    <span 
                                      key={scope}
                                      className="px-2 py-1 bg-chart-1/20 text-chart-1 rounded-md text-xs font-medium"
                                    >
                                      {scope}
                                    </span>
                                  ))}
                                </div>
                              </td>
                              <td className="p-4">
                                <span className={`px-2 py-1 rounded-md text-xs font-medium ${
                                  apiKey.status === 'active' 
                                    ? 'bg-chart-1/20 text-chart-1' 
                                    : 'bg-destructive/20 text-destructive'
                                }`}>
                                  {apiKey.status.toUpperCase()}
                                </span>
                              </td>
                              <td className="p-4 text-foreground text-sm">
                                {apiKey.lastUsedAt 
                                  ? new Date(apiKey.lastUsedAt).toLocaleDateString()
                                  : 'Never'
                                }
                              </td>
                              <td className="p-4 text-foreground text-sm">
                                {new Date(apiKey.createdAt).toLocaleDateString()}
                              </td>
                              <td className="p-4">
                                <Dialog>
                                  <DialogTrigger asChild>
                                    <Button 
                                      variant="outline" 
                                      size="sm" 
                                      className="text-destructive hover:text-destructive"
                                    >
                                      Delete
                                    </Button>
                                  </DialogTrigger>
                                  <DialogContent>
                                    <DialogHeader>
                                      <DialogTitle>Delete API Key</DialogTitle>
                                      <DialogDescription>
                                        Are you sure you want to delete this API key? This action cannot be undone and will immediately revoke access for any applications using this key.
                                      </DialogDescription>
                                    </DialogHeader>
                                    <div className="flex justify-end space-x-3 pt-4">
                                      <DialogTrigger asChild>
                                        <Button variant="outline">Cancel</Button>
                                      </DialogTrigger>
                                      <Button 
                                        variant="destructive"
                                        onClick={() => deleteApiKeyMutation.mutate(apiKey.id)}
                                        disabled={deleteApiKeyMutation.isPending}
                                      >
                                        {deleteApiKeyMutation.isPending ? 'Deleting...' : 'Delete API Key'}
                                      </Button>
                                    </div>
                                  </DialogContent>
                                </Dialog>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* API Documentation Link */}
                <div className="bg-muted/10 border border-muted rounded-lg p-4">
                  <div className="flex items-start space-x-3">
                    <div className="w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center mt-0.5">
                      <span className="text-white text-xs font-bold">i</span>
                    </div>
                    <div>
                      <div className="font-medium text-foreground mb-1">API Documentation</div>
                      <div className="text-sm text-muted-foreground mb-3">
                        Learn how to use your API keys to access markets, place orders, and manage your account programmatically.
                      </div>
                      <Button variant="outline" size="sm" asChild>
                        <a href="/docs/api" target="_blank" rel="noopener noreferrer">
                          View API Documentation →
                        </a>
                      </Button>
                    </div>
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
