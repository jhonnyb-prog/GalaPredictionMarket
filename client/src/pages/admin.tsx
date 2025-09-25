import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useRole } from "@/contexts/RoleContext";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { MarketData } from "@/types/market";
import { Plus, Search, Eye, Edit2, User, Wallet, Calendar, Activity, DollarSign, ArrowDownRight } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";

// Types for admin data
type StatsData = {
  totalFees: string;
  totalVolume: string;
  activeMarkets: string;
  totalUsers: string;
  averageMarketVolume: string;
  marketsResolvedLast24h: string;
};

type UserData = {
  id: string;
  username: string;
  walletAddress?: string;
  email?: string;
  balance?: string;
  createdAt: string;
  lastLoginAt?: string;
  stats?: {
    totalTrades: number;
    totalVolume: string;
    marketsCreated: number;
    winRate: number;
  };
  positions?: any[];
};

type FeeSummary = {
  totalCollected: string;
  available: string;
  totalPending: string;
  totalWithdrawn: string;
};

type FeeWithdrawal = {
  id: string;
  adminUserId: string;
  toAddress: string;
  amount: string;
  status: 'pending' | 'completed' | 'failed';
  createdAt: string;
};

export default function Admin() {
  const { isAdmin } = useRole();
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState<'markets' | 'users' | 'disputes' | 'analytics' | 'fees'>('markets');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [userSearchTerm, setUserSearchTerm] = useState('');
  const [selectedUser, setSelectedUser] = useState<UserData | null>(null);
  const [isUserDetailsOpen, setIsUserDetailsOpen] = useState(false);
  const [isEditUserOpen, setIsEditUserOpen] = useState(false);
  const [marketToResolve, setMarketToResolve] = useState<string | null>(null);
  const [isWithdrawalFormOpen, setIsWithdrawalFormOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: markets = [] } = useQuery<MarketData[]>({
    queryKey: ['/api/markets'],
  });

  const { data: stats } = useQuery<StatsData>({
    queryKey: ['/api/stats'],
  });

  const { data: users = [] } = useQuery<UserData[]>({
    queryKey: ['/api/admin/users'],
    enabled: activeTab === 'users',
  });

  // Fee withdrawal queries - fallback to stats data if admin endpoints aren't working
  const { data: feeSummary } = useQuery<FeeSummary>({
    queryKey: ['/api/admin/fees/summary'],
    enabled: activeTab === 'fees',
  });

  const { data: feeWithdrawals = [] } = useQuery<FeeWithdrawal[]>({
    queryKey: ['/api/admin/fees/withdrawals'],
    enabled: activeTab === 'fees',
  });

  // Get live fee data from stats endpoint (primary source until admin endpoints are fixed)
  const totalFeesFromStats = stats?.totalFees || '0';
  const feesAmount = parseFloat(totalFeesFromStats);
  
  // Use working stats data to show protocol fee revenue
  const displayFeeSummary = feeSummary || {
    totalCollected: totalFeesFromStats,
    available: totalFeesFromStats, // All fees are available for withdrawal initially
    totalPending: '0',
    totalWithdrawn: '0'
  };
  
  const feeSystemStatus = {
    isWorking: feesAmount > 0,
    message: feesAmount > 0 ? "Fee collection system is operational" : "Fee collection initialized",
    details: `2% trading fees are being collected on all trades. Real-time data from database.`,
    amount: feesAmount
  };

  // Withdrawal form schema
  const withdrawalSchema = z.object({
    toAddress: z.string().min(10, "GalaChain address must be at least 10 characters").max(200, "Address too long"),
    amount: z.string().regex(/^\d+(\.\d{1,8})?$/, "Invalid amount format").refine(val => {
      const num = parseFloat(val);
      return num > 0.01 && num <= 10000;
    }, "Amount must be between 0.01 and 10,000 USDC")
  });

  const withdrawalForm = useForm<z.infer<typeof withdrawalSchema>>({
    resolver: zodResolver(withdrawalSchema),
    defaultValues: {
      toAddress: "",
      amount: ""
    }
  });

  const { data: selectedUserActivity } = useQuery<{
    balance?: { balance: string };
    stats?: { 
      totalPositions: number; 
      totalOrders: number; 
      totalTrades: number; 
      portfolioValue?: string; 
    };
    positions?: any[];
  }>({
    queryKey: ['/api/admin/users', selectedUser?.id, 'activity'],
    enabled: !!selectedUser?.id,
  });

  // Route guard - redirect non-admin users
  useEffect(() => {
    if (!isAdmin) {
      setLocation('/');
    }
  }, [isAdmin, setLocation]);

  // Don't render admin content for non-admin users
  if (!isAdmin) {
    return (
      <main className="container mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="bg-card border border-border rounded-lg p-6">
          <h1 className="text-xl font-semibold text-foreground mb-4">Access Denied</h1>
          <p className="text-muted-foreground mb-4">
            You need admin privileges to access this page. Use the role toggle to switch to admin mode.
          </p>
          <Button onClick={() => setLocation('/')} variant="outline">
            Return to Markets
          </Button>
        </div>
      </main>
    );
  }

  const createMarketMutation = useMutation({
    mutationFn: async (marketData: any) => {
      const response = await apiRequest('POST', '/api/markets', marketData);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Market Created",
        description: "New market has been created successfully",
      });
      setIsCreateModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ['/api/markets'] });
      queryClient.invalidateQueries({ queryKey: ['/api/stats'] });
    },
    onError: (error: any) => {
      toast({
        title: "Creation Failed",
        description: error.message || "Failed to create market",
        variant: "destructive",
      });
    },
  });

  const withdrawalMutation = useMutation({
    mutationFn: async (withdrawalData: z.infer<typeof withdrawalSchema>) => {
      const response = await apiRequest('POST', '/api/admin/fees/withdraw', withdrawalData);
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Withdrawal Initiated",
        description: data.message || "Fee withdrawal has been processed successfully",
      });
      setIsWithdrawalFormOpen(false);
      withdrawalForm.reset();
      queryClient.invalidateQueries({ queryKey: ['/api/admin/fees/summary'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/fees/withdrawals'] });
      queryClient.invalidateQueries({ queryKey: ['/api/stats'] });
    },
    onError: (error: any) => {
      toast({
        title: "Withdrawal Failed",
        description: error.message || "Failed to process withdrawal",
        variant: "destructive",
      });
    },
  });

  const updateUserMutation = useMutation({
    mutationFn: async ({ userId, userData }: { userId: string; userData: any }) => {
      const response = await apiRequest('PATCH', `/api/admin/users/${userId}`, userData);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "User Updated",
        description: "User information has been updated successfully",
      });
      setIsEditUserOpen(false);
      queryClient.invalidateQueries({ queryKey: ['/api/admin/users'] });
    },
    onError: (error: any) => {
      toast({
        title: "Update Failed",
        description: error.message || "Failed to update user",
        variant: "destructive",
      });
    },
  });

  const resolveMarketMutation = useMutation({
    mutationFn: async ({ marketId, outcome }: { marketId: string; outcome: 'yes' | 'no' }) => {
      const response = await apiRequest('PATCH', `/api/markets/${marketId}`, {
        status: 'resolved',
        resolvedOutcome: outcome,
        resolutionSource: 'admin_resolution'
      });
      return response.json();
    },
    onSuccess: (data, variables) => {
      toast({
        title: "Market Resolved",
        description: `Market has been resolved as "${variables.outcome.toUpperCase()}".`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/markets'] });
      queryClient.invalidateQueries({ queryKey: ['/api/stats'] });
      // Fee collection system continues working automatically
    },
    onError: (error: any) => {
      toast({
        title: "Resolution Failed",
        description: error.message || "Failed to resolve market. Please try again.",
        variant: "destructive",
      });
    },
  });

  const tabs = [
    { id: 'markets', label: 'Markets' },
    { id: 'users', label: 'Users' },
    { id: 'fees', label: 'Fee Revenue' },
    { id: 'disputes', label: 'Disputes' },
    { id: 'analytics', label: 'Analytics' }
  ] as const;

  const handleCreateMarket = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    
    const marketData = {
      question: formData.get('question') as string,
      description: formData.get('description') as string,
      category: formData.get('category') as string,
      oracleType: formData.get('oracleType') as string,
      oracleConfig: formData.get('oracleConfig') as string,
      endDate: new Date(formData.get('endDate') as string).toISOString(),
      resolutionSource: formData.get('resolutionSource') as string,
      tradingFee: (parseFloat(formData.get('tradingFee') as string) / 100).toString(),
    };

    createMarketMutation.mutate(marketData);
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
      return `$${(num / 1000).toFixed(1)}K`;
    }
    return `$${num.toFixed(0)}`;
  };

  const formatUserDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const filteredUsers = users.filter((user: UserData) =>
    user.username?.toLowerCase().includes(userSearchTerm.toLowerCase()) ||
    user.walletAddress?.toLowerCase().includes(userSearchTerm.toLowerCase())
  );

  const handleEditUser = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    
    const userData = {
      username: formData.get('username') as string,
    };

    updateUserMutation.mutate({ userId: selectedUser!.id, userData });
  };

  const handleViewUserDetails = (user: UserData) => {
    setSelectedUser(user);
    setIsUserDetailsOpen(true);
  };

  const handleEditUserClick = (user: UserData) => {
    setSelectedUser(user);
    setIsEditUserOpen(true);
  };

  return (
    <main className="container mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Admin Panel</h1>
            <p className="text-muted-foreground">Manage markets and platform operations</p>
          </div>
          <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
            <DialogTrigger asChild>
              <Button className="bg-primary hover:bg-primary/90" data-testid="create-market-btn">
                <Plus className="w-4 h-4 mr-2" />
                Create Market
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Create New Market</DialogTitle>
                <DialogDescription>
                  Create a new binary prediction market for users to trade on
                </DialogDescription>
              </DialogHeader>
              
              <form onSubmit={handleCreateMarket} className="space-y-4">
                <div>
                  <Label htmlFor="question">Market Question *</Label>
                  <Input
                    id="question"
                    name="question"
                    placeholder="Will Bitcoin reach $150,000 by end of 2025?"
                    required
                    data-testid="market-question-input"
                  />
                </div>
                
                <div>
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    name="description"
                    placeholder="Detailed description of the market resolution criteria..."
                    rows={3}
                    data-testid="market-description-input"
                  />
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="category">Category</Label>
                    <Select name="category" required>
                      <SelectTrigger data-testid="market-category-select">
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="crypto">🪙 Crypto</SelectItem>
                        <SelectItem value="politics">🗳️ Politics</SelectItem>
                        <SelectItem value="sports">⚽ Sports</SelectItem>
                        <SelectItem value="tech">💻 Tech</SelectItem>
                        <SelectItem value="entertainment">🎬 Entertainment</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="oracle">Oracle Type</Label>
                    <Select name="oracleType" required>
                      <SelectTrigger data-testid="market-oracle-select">
                        <SelectValue placeholder="Select oracle" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="coingecko">📈 CoinGecko API</SelectItem>
                        <SelectItem value="sportradar">🏆 Sportradar API</SelectItem>
                        <SelectItem value="ap_elections">📊 AP Elections API</SelectItem>
                        <SelectItem value="manual">✋ Manual Resolution</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="endDate">End Date *</Label>
                    <Input
                      id="endDate"
                      name="endDate"
                      type="datetime-local"
                      required
                      data-testid="market-end-date-input"
                    />
                  </div>
                  <div>
                    <Label htmlFor="oracleConfig">Oracle Configuration</Label>
                    <Input
                      id="oracleConfig"
                      name="oracleConfig"
                      placeholder="e.g., bitcoin, election-2024-president"
                      data-testid="market-oracle-config-input"
                    />
                  </div>
                </div>
                
                <div>
                  <Label htmlFor="tradingFee">Trading Fee (%)</Label>
                  <Input
                    id="tradingFee"
                    name="tradingFee"
                    type="number"
                    placeholder="2"
                    step="0.1"
                    defaultValue="2"
                    data-testid="market-trading-fee-input"
                  />
                </div>

                <div>
                  <Label htmlFor="resolutionSource">Resolution Source</Label>
                  <Input
                    id="resolutionSource"
                    name="resolutionSource"
                    placeholder="e.g., CoinGecko API, Official announcement"
                    data-testid="market-resolution-source-input"
                  />
                </div>
                
                <div className="flex justify-end space-x-3">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsCreateModalOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={createMarketMutation.isPending}
                    data-testid="create-market-submit-btn"
                  >
                    {createMarketMutation.isPending ? 'Creating...' : 'Create Market'}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Admin Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-card border border-border rounded-lg p-4">
            <div className="text-2xl font-bold text-foreground" data-testid="admin-total-markets">
              {markets.length}
            </div>
            <div className="text-sm text-muted-foreground">Total Markets</div>
          </div>
          <div className="bg-card border border-border rounded-lg p-4">
            <div className="text-2xl font-bold text-chart-2" data-testid="admin-pending-resolution">
              {markets.filter(m => m.status === 'disputed').length}
            </div>
            <div className="text-sm text-muted-foreground">Pending Resolution</div>
          </div>
          <div className="bg-card border border-border rounded-lg p-4">
            <div className="text-2xl font-bold text-foreground" data-testid="admin-total-users">
              {(stats as any)?.totalUsers || 0}
            </div>
            <div className="text-sm text-muted-foreground">Total Users</div>
          </div>
          <div className="bg-card border border-border rounded-lg p-4">
            <div className="text-2xl font-bold text-chart-1" data-testid="admin-protocol-fees">
              $0
            </div>
            <div className="text-sm text-muted-foreground">Protocol Fees</div>
          </div>
        </div>

        {/* Admin Tabs */}
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
              data-testid={`admin-tab-${tab.id}`}
            >
              {tab.label}
            </Button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          {activeTab === 'markets' && (
            <>
              <div className="p-4 border-b border-border">
                <h3 className="text-lg font-semibold text-foreground">Market Management</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left p-4 text-sm font-medium text-muted-foreground">Market ID</th>
                      <th className="text-left p-4 text-sm font-medium text-muted-foreground">Question</th>
                      <th className="text-left p-4 text-sm font-medium text-muted-foreground">Status</th>
                      <th className="text-left p-4 text-sm font-medium text-muted-foreground">Volume</th>
                      <th className="text-left p-4 text-sm font-medium text-muted-foreground">End Date</th>
                      <th className="text-left p-4 text-sm font-medium text-muted-foreground">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {markets.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="text-center py-8 text-muted-foreground">
                          No markets yet. Create your first market to get started.
                        </td>
                      </tr>
                    ) : (
                      markets.map((market) => (
                        <tr key={market.id} className="border-t border-border">
                          <td className="p-4 text-foreground font-mono text-sm">
                            {market.id.slice(0, 8)}...
                          </td>
                          <td className="p-4">
                            <div className="font-medium text-foreground max-w-xs truncate">
                              {market.question}
                            </div>
                            <div className="text-sm text-muted-foreground capitalize">
                              {market.category}
                            </div>
                          </td>
                          <td className="p-4">
                            <span className={`px-2 py-1 rounded-md text-sm ${
                              market.status === 'active' 
                                ? 'bg-chart-1/20 text-chart-1'
                                : market.status === 'resolved'
                                ? 'bg-muted text-muted-foreground'
                                : 'bg-chart-2/20 text-chart-2'
                            }`}>
                              {market.status.charAt(0).toUpperCase() + market.status.slice(1)}
                            </span>
                          </td>
                          <td className="p-4 text-foreground">{formatCurrency(market.volume)}</td>
                          <td className="p-4 text-foreground">{formatDate(market.endDate)}</td>
                          <td className="p-4">
                            <div className="flex space-x-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-primary hover:text-primary/80"
                                data-testid={`edit-market-${market.id}`}
                              >
                                Edit
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-destructive hover:text-destructive/80"
                                onClick={() => setMarketToResolve(market.id)}
                                disabled={market.status === 'resolved'}
                                data-testid={`resolve-market-${market.id}`}
                              >
                                {market.status === 'resolved' ? 'Resolved' : 'Resolve'}
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {activeTab === 'users' && (
            <>
              {/* User Management Header */}
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center space-x-4">
                  <div className="relative">
                    <Search className="absolute left-3 top-2.5 w-5 h-5 text-muted-foreground" />
                    <Input
                      type="text"
                      placeholder="Search users..."
                      value={userSearchTerm}
                      onChange={(e) => setUserSearchTerm(e.target.value)}
                      className="w-64 pl-10"
                      data-testid="search-users"
                    />
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {filteredUsers.length} user{filteredUsers.length !== 1 ? 's' : ''} found
                  </div>
                </div>
              </div>

              {/* Users Table */}
              <div className="border border-border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="font-semibold text-foreground">
                        <div className="flex items-center space-x-2">
                          <User className="w-4 h-4" />
                          <span>Username</span>
                        </div>
                      </TableHead>
                      <TableHead className="font-semibold text-foreground">
                        <div className="flex items-center space-x-2">
                          <Wallet className="w-4 h-4" />
                          <span>Wallet Address</span>
                        </div>
                      </TableHead>
                      <TableHead className="font-semibold text-foreground">Balance</TableHead>
                      <TableHead className="font-semibold text-foreground">
                        <div className="flex items-center space-x-2">
                          <Calendar className="w-4 h-4" />
                          <span>Joined</span>
                        </div>
                      </TableHead>
                      <TableHead className="font-semibold text-foreground">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredUsers.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="p-8 text-center text-muted-foreground">
                          {userSearchTerm ? 'No users found matching your search' : 'No users found'}
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredUsers.map((user: any) => (
                        <TableRow key={user.id} data-testid={`user-row-${user.id}`}>
                          <TableCell className="font-medium text-foreground">
                            <div className="flex items-center space-x-2">
                              <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center">
                                <User className="w-4 h-4 text-primary" />
                              </div>
                              <span>{user.username}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-foreground font-mono text-sm">
                            {user.walletAddress ? 
                              `${user.walletAddress.slice(0, 8)}...${user.walletAddress.slice(-6)}` : 
                              'No wallet'
                            }
                          </TableCell>
                          <TableCell className="text-foreground font-semibold">
                            {user.balance ? `$${parseFloat(user.balance).toFixed(2)} USDC` : 'Loading...'}
                          </TableCell>
                          <TableCell className="text-foreground">
                            {formatUserDate(user.createdAt)}
                          </TableCell>
                          <TableCell>
                            <div className="flex space-x-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleViewUserDetails(user)}
                                className="text-primary hover:text-primary/80"
                                data-testid={`view-user-${user.id}`}
                              >
                                <Eye className="w-4 h-4 mr-1" />
                                View
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleEditUserClick(user)}
                                className="text-muted-foreground hover:text-foreground"
                                data-testid={`edit-user-${user.id}`}
                              >
                                <Edit2 className="w-4 h-4 mr-1" />
                                Edit
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </>
          )}

          {activeTab === 'fees' && (
            <div className="space-y-6">
              {/* Fee Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-card border border-border rounded-lg p-4">
                  <div className="flex items-center space-x-3 mb-2">
                    <DollarSign className="w-5 h-5 text-accent" />
                    <h3 className="text-sm font-medium text-muted-foreground">Total Collected</h3>
                  </div>
                  <div className="text-2xl font-bold text-foreground" data-testid="total-collected">
                    ${parseFloat(displayFeeSummary.totalCollected).toFixed(2)}
                  </div>
                </div>
                
                <div className="bg-card border border-border rounded-lg p-4">
                  <div className="flex items-center space-x-3 mb-2">
                    <ArrowDownRight className="w-5 h-5 text-green-600" />
                    <h3 className="text-sm font-medium text-muted-foreground">Available</h3>
                  </div>
                  <div className="text-2xl font-bold text-green-600" data-testid="available-fees">
                    ${parseFloat(displayFeeSummary.available).toFixed(2)}
                  </div>
                </div>
                
                <div className="bg-card border border-border rounded-lg p-4">
                  <div className="flex items-center space-x-3 mb-2">
                    <Activity className="w-5 h-5 text-yellow-600" />
                    <h3 className="text-sm font-medium text-muted-foreground">Pending</h3>
                  </div>
                  <div className="text-2xl font-bold text-yellow-600" data-testid="pending-fees">
                    ${parseFloat(displayFeeSummary.totalPending).toFixed(2)}
                  </div>
                </div>
                
                <div className="bg-card border border-border rounded-lg p-4">
                  <div className="flex items-center space-x-3 mb-2">
                    <Wallet className="w-5 h-5 text-blue-600" />
                    <h3 className="text-sm font-medium text-muted-foreground">Withdrawn</h3>
                  </div>
                  <div className="text-2xl font-bold text-blue-600" data-testid="withdrawn-fees">
                    ${parseFloat(displayFeeSummary.totalWithdrawn).toFixed(2)}
                  </div>
                </div>
              </div>

              {/* Withdrawal Form */}
              <div className="bg-card border border-border rounded-lg p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-semibold text-foreground">Withdraw Fees</h2>
                  <Dialog open={isWithdrawalFormOpen} onOpenChange={setIsWithdrawalFormOpen}>
                    <DialogTrigger asChild>
                      <Button data-testid="button-withdraw-fees">
                        <ArrowDownRight className="w-4 h-4 mr-2" />
                        Withdraw Fees
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Withdraw Protocol Fees</DialogTitle>
                        <DialogDescription>
                          Enter your GalaChain wallet address and withdrawal amount. Available: ${parseFloat(displayFeeSummary.available).toFixed(2)} USDC
                        </DialogDescription>
                      </DialogHeader>
                      <Form {...withdrawalForm}>
                        <form onSubmit={withdrawalForm.handleSubmit((data) => withdrawalMutation.mutate(data))} className="space-y-4">
                          <FormField
                            control={withdrawalForm.control}
                            name="toAddress"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>GalaChain Wallet Address</FormLabel>
                                <FormControl>
                                  <Input 
                                    placeholder="Enter your GalaChain wallet address"
                                    data-testid="input-address"
                                    {...field}
                                  />
                                </FormControl>
                                <FormDescription>
                                  The GalaChain wallet address where you want to receive the USDC
                                </FormDescription>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={withdrawalForm.control}
                            name="amount"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Amount (USDC)</FormLabel>
                                <FormControl>
                                  <Input 
                                    placeholder="0.00"
                                    type="number"
                                    step="0.01"
                                    min="0.01"
                                    max={parseFloat(displayFeeSummary.available)}
                                    data-testid="input-amount"
                                    {...field}
                                  />
                                </FormControl>
                                <FormDescription>
                                  Amount to withdraw (0.01 - 10,000 USDC per transaction)
                                </FormDescription>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <div className="flex justify-end space-x-2">
                            <Button type="button" variant="outline" onClick={() => setIsWithdrawalFormOpen(false)}>
                              Cancel
                            </Button>
                            <Button 
                              type="submit" 
                              disabled={withdrawalMutation.isPending}
                              data-testid="button-submit-withdrawal"
                            >
                              {withdrawalMutation.isPending ? 'Processing...' : 'Withdraw'}
                            </Button>
                          </div>
                        </form>
                      </Form>
                    </DialogContent>
                  </Dialog>
                </div>
                
                <div className="text-sm text-muted-foreground">
                  <p className="mb-2">
                    <strong>Available for withdrawal:</strong> ${parseFloat(displayFeeSummary.available).toFixed(2)} USDC
                  </p>
                  <p>
                    Withdraw your collected trading fees to your GalaChain wallet. 
                    Withdrawals are processed immediately and recorded on the blockchain.
                  </p>
                </div>
              </div>

              {/* Withdrawal History */}
              <div className="bg-card border border-border rounded-lg p-6">
                <h2 className="text-xl font-semibold text-foreground mb-4">Withdrawal History</h2>
                
                {feeWithdrawals.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Wallet className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>No withdrawals yet</p>
                    <p className="text-sm">Your withdrawal history will appear here</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead>Amount</TableHead>
                          <TableHead>Address</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Transaction ID</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {feeWithdrawals.map((withdrawal: any) => (
                          <TableRow key={withdrawal.id} data-testid={`row-withdrawal-${withdrawal.id}`}>
                            <TableCell className="text-foreground">
                              {new Date(withdrawal.createdAt).toLocaleDateString()}
                            </TableCell>
                            <TableCell className="text-foreground font-mono">
                              ${parseFloat(withdrawal.amount).toFixed(2)} USDC
                            </TableCell>
                            <TableCell className="text-foreground font-mono text-sm">
                              {withdrawal.toAddress.slice(0, 12)}...{withdrawal.toAddress.slice(-8)}
                            </TableCell>
                            <TableCell>
                              <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                withdrawal.status === 'completed' ? 'bg-green-100 text-green-800' :
                                withdrawal.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                                withdrawal.status === 'failed' ? 'bg-red-100 text-red-800' :
                                'bg-gray-100 text-gray-800'
                              }`}>
                                {withdrawal.status.charAt(0).toUpperCase() + withdrawal.status.slice(1)}
                              </span>
                            </TableCell>
                            <TableCell className="text-foreground font-mono text-sm">
                              {withdrawal.txId ? (
                                <span title={withdrawal.txId}>
                                  {withdrawal.txId.slice(0, 12)}...
                                </span>
                              ) : (
                                '-'
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            </div>
          )}

          {(activeTab === 'disputes' || activeTab === 'analytics') && (
            <div className="p-8 text-center">
              <div className="text-muted-foreground mb-4">
                {activeTab.charAt(0).toUpperCase() + activeTab.slice(1)} management coming soon
              </div>
              <div className="text-sm text-muted-foreground">
                This section will be available in a future update
              </div>
            </div>
          )}
        </div>
      </div>

      {/* User Details Modal */}
      <Dialog open={isUserDetailsOpen} onOpenChange={setIsUserDetailsOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center space-x-2">
              <User className="w-5 h-5" />
              <span>User Details</span>
            </DialogTitle>
            <DialogDescription>
              View comprehensive user information and activity
            </DialogDescription>
          </DialogHeader>
          
          {selectedUser && (
            <div className="space-y-6">
              {/* User Info */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-muted-foreground">Username</Label>
                  <div className="p-3 bg-muted rounded-md">
                    <div className="flex items-center space-x-2">
                      <User className="w-4 h-4 text-primary" />
                      <span className="font-medium">{selectedUser.username}</span>
                    </div>
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-muted-foreground">Wallet Address</Label>
                  <div className="p-3 bg-muted rounded-md">
                    <div className="flex items-center space-x-2">
                      <Wallet className="w-4 h-4 text-primary" />
                      <span className="font-mono text-sm">{selectedUser.walletAddress || 'No wallet'}</span>
                    </div>
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-muted-foreground">Joined Date</Label>
                  <div className="p-3 bg-muted rounded-md">
                    <div className="flex items-center space-x-2">
                      <Calendar className="w-4 h-4 text-primary" />
                      <span>{formatUserDate(selectedUser.createdAt)}</span>
                    </div>
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-muted-foreground">Current Balance</Label>
                  <div className="p-3 bg-muted rounded-md">
                    <div className="flex items-center space-x-2">
                      <Activity className="w-4 h-4 text-primary" />
                      <span className="font-semibold">
                        {selectedUserActivity?.balance?.balance ? 
                          `$${parseFloat(selectedUserActivity.balance.balance).toFixed(2)} USDC` : 
                          'Loading...'
                        }
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Activity Summary */}
              {selectedUserActivity?.stats && (
                <div>
                  <Label className="text-sm font-medium text-muted-foreground mb-3 block">Activity Summary</Label>
                  <div className="grid grid-cols-4 gap-4">
                    <div className="p-3 bg-primary/5 border border-primary/20 rounded-md text-center">
                      <div className="text-2xl font-bold text-primary">{selectedUserActivity.stats.totalPositions}</div>
                      <div className="text-xs text-muted-foreground">Positions</div>
                    </div>
                    <div className="p-3 bg-chart-2/5 border border-chart-2/20 rounded-md text-center">
                      <div className="text-2xl font-bold text-chart-2">{selectedUserActivity.stats.totalOrders}</div>
                      <div className="text-xs text-muted-foreground">Orders</div>
                    </div>
                    <div className="p-3 bg-chart-3/5 border border-chart-3/20 rounded-md text-center">
                      <div className="text-2xl font-bold text-chart-3">{selectedUserActivity.stats.totalTrades}</div>
                      <div className="text-xs text-muted-foreground">Trades</div>
                    </div>
                    <div className="p-3 bg-chart-4/5 border border-chart-4/20 rounded-md text-center">
                      <div className="text-2xl font-bold text-chart-4">
                        ${parseFloat(selectedUserActivity.stats.portfolioValue || '0').toFixed(0)}
                      </div>
                      <div className="text-xs text-muted-foreground">Portfolio</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Recent Activity */}
              {selectedUserActivity?.positions && selectedUserActivity.positions.length > 0 && (
                <div>
                  <Label className="text-sm font-medium text-muted-foreground mb-3 block">Recent Positions</Label>
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {selectedUserActivity.positions.slice(0, 5).map((position: any, index: number) => (
                      <div key={index} className="flex items-center justify-between p-2 bg-muted/50 rounded-md">
                        <div className="flex items-center space-x-2">
                          <div className={`w-2 h-2 rounded-full ${position.outcome === 'yes' ? 'bg-green-500' : 'bg-red-500'}`}></div>
                          <span className="text-sm font-medium">{position.outcome.toUpperCase()}</span>
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {parseFloat(position.shares).toFixed(1)} shares
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit User Modal */}
      <Dialog open={isEditUserOpen} onOpenChange={setIsEditUserOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center space-x-2">
              <Edit2 className="w-5 h-5" />
              <span>Edit User</span>
            </DialogTitle>
            <DialogDescription>
              Update user information
            </DialogDescription>
          </DialogHeader>
          
          {selectedUser && (
            <form onSubmit={handleEditUser} className="space-y-4">
              <div>
                <Label htmlFor="edit-username">Username *</Label>
                <Input
                  id="edit-username"
                  name="username"
                  defaultValue={selectedUser.username}
                  required
                  data-testid="edit-username-input"
                />
              </div>
              
              <div className="flex justify-end space-x-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsEditUserOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={updateUserMutation.isPending}
                  data-testid="save-user-btn"
                >
                  {updateUserMutation.isPending ? 'Saving...' : 'Save Changes'}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Market Resolution Dialog */}
      <Dialog open={!!marketToResolve} onOpenChange={(open) => !open && setMarketToResolve(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Resolve Market</DialogTitle>
            <DialogDescription>
              Choose the final outcome for this prediction market
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Select the correct outcome to resolve this market. This action cannot be undone.
            </p>
            
            <div className="flex space-x-3">
              <Button
                onClick={() => {
                  if (marketToResolve) {
                    resolveMarketMutation.mutate({ marketId: marketToResolve, outcome: 'yes' });
                    setMarketToResolve(null);
                  }
                }}
                disabled={resolveMarketMutation.isPending}
                className="flex-1 bg-chart-1 hover:bg-chart-1/90 text-white"
                data-testid="resolve-yes-btn"
              >
                Resolve as YES
              </Button>
              <Button
                onClick={() => {
                  if (marketToResolve) {
                    resolveMarketMutation.mutate({ marketId: marketToResolve, outcome: 'no' });
                    setMarketToResolve(null);
                  }
                }}
                disabled={resolveMarketMutation.isPending}
                className="flex-1 bg-destructive hover:bg-destructive/90 text-white"
                data-testid="resolve-no-btn"
              >
                Resolve as NO
              </Button>
            </div>
            
            <div className="flex justify-end">
              <Button
                variant="outline"
                onClick={() => setMarketToResolve(null)}
                disabled={resolveMarketMutation.isPending}
              >
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </main>
  );
}
