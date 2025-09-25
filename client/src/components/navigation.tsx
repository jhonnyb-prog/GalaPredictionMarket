import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Menu, Plus, UserCog, Wallet, LogOut, User, Settings } from "lucide-react";
import { useUser } from "@/contexts/UserContext";
import { useRole } from "@/contexts/RoleContext";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { ethers } from "ethers";
import { ethereumWalletProvider, detectAvailableWallets } from "@/lib/galachain";
import type { DepositConfig } from "@shared/schema";

export function Navigation() {
  const { user } = useUser();
  const { role, setRole, isAdmin } = useRole();
  const [location] = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const [isAddFundsOpen, setIsAddFundsOpen] = useState(false);
  const [depositAmount, setDepositAmount] = useState('100');
  const [selectedToken, setSelectedToken] = useState<'USDC' | 'USDT'>('USDC');
  const [walletConnected, setWalletConnected] = useState(false);
  const [userAddress, setUserAddress] = useState<string>('');
  const [gasEstimate, setGasEstimate] = useState<string>('');
  const [status, setStatus] = useState<{ message: string; type: 'info' | 'success' | 'error' | 'warning' }>({ message: '', type: 'info' });
  const [depositConfig, setDepositConfig] = useState<DepositConfig | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // ERC20 ABI (minimal for transfer)
  const ERC20_ABI = [
    'function balanceOf(address owner) view returns (uint256)',
    'function transfer(address to, uint256 amount) returns (bool)',
    'function decimals() view returns (uint8)',
    'function symbol() view returns (string)'
  ];

  // Load deposit configuration on component mount
  useEffect(() => {
    const loadDepositConfig = async () => {
      try {
        const response = await fetch('/api/deposits/config', {
          method: 'GET',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
        });
        if (response.status === 401) {
          showStatus('Please sign in to access deposit features', 'warning');
          return;
        }
        
        const config = await response.json();
        setDepositConfig(config);
      } catch (error) {
        console.error('Failed to load deposit config:', error);
        showStatus('Failed to load deposit configuration', 'error');
      }
    };

    if (user) {
      loadDepositConfig();
    }
  }, [user]);

  // Helper function to show status
  const showStatus = (message: string, type: 'info' | 'success' | 'error' | 'warning') => {
    setStatus({ message, type });
  };

  // Connect to MetaMask or Phantom wallet and create user account
  const connectWallet = async () => {
    try {
      showStatus('🔄 Connecting wallet...', 'info');

      // Use the new Ethereum wallet provider for real MetaMask/Phantom connections
      const walletInfo = await ethereumWalletProvider.connect();
      
      // Create/connect user account via backend
      const response = await fetch('/api/auth/wallet-connect', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          walletAddress: walletInfo.address
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Wallet connection failed');
      }

      setUserAddress(walletInfo.address);
      setWalletConnected(true);
      showStatus(`✅ Connected via ${walletInfo.walletType} - ${data.message}`, 'success');
      
      toast({
        title: `${walletInfo.walletType === 'metamask' ? 'MetaMask' : 'Phantom'} Connected!`,
        description: "You can now add funds and trade prediction markets.",
      });

      // Refresh user data
      queryClient.invalidateQueries({ queryKey: ['/api/auth/me'] });

    } catch (error: any) {
      console.error('Wallet connection error:', error);
      if (error.message?.includes('No Ethereum wallet detected')) {
        showStatus('Please install MetaMask or Phantom wallet.', 'error');
        const confirmInstall = confirm('No wallet detected. Install MetaMask?');
        if (confirmInstall) {
          window.open('https://metamask.io/download/', '_blank');
        }
      } else if (error.message?.includes('cancelled')) {
        showStatus('❌ Connection cancelled by user', 'error');
      } else {
        showStatus(`Failed to connect wallet: ${error.message}`, 'error');
      }
    }
  };

  // Estimate gas fee using ethers v6
  const estimateGasFee = async () => {
    if (!walletConnected || !window.ethereum || !depositAmount || !depositConfig) return;

    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const feeData = await provider.getFeeData();
      const gasLimit = 65000n; // Typical for ERC20 transfer
      
      const gasCost = (feeData.gasPrice || 0n) * gasLimit;
      const gasCostEth = ethers.formatEther(gasCost);
      
      setGasEstimate(`~${parseFloat(gasCostEth).toFixed(6)} ETH`);
    } catch (error) {
      console.error('Gas estimation error:', error);
      setGasEstimate('Unable to estimate');
    }
  };

  // Send payment using the new Ethereum wallet provider with customerID
  const sendPayment = async () => {
    if (!walletConnected || !user?.id || !depositAmount || !depositConfig) {
      showStatus('❌ Please connect wallet and enter amount', 'error');
      return;
    }

    const parsedAmount = parseFloat(depositAmount);
    if (parsedAmount < depositConfig.minAmount) {
      showStatus(`❌ Minimum deposit is ${depositConfig.minAmount} ${selectedToken}`, 'error');
      return;
    }

    try {
      showStatus('🔄 Preparing transaction...', 'info');
      
      // Use ONLY server-controlled configuration (NO hardcoded fallbacks)
      const recipientAddress = depositConfig.recipientAddress;
      const tokenInfo = depositConfig.allowedTokens[selectedToken];
      
      if (!recipientAddress || !tokenInfo) {
        showStatus('❌ Invalid deposit configuration', 'error');
        return;
      }

      showStatus('🔄 Sending transaction... Please confirm in your wallet', 'info');
      
      // Use the new Ethereum wallet provider with automatic customerID inclusion
      const txHash = await ethereumWalletProvider.sendPayment({
        token: selectedToken,
        amount: depositAmount,
        recipientAddress: recipientAddress,
        customerID: user.id // Automatically included, user cannot modify
      });

      showStatus('⏳ Transaction submitted. Waiting for confirmation...', 'warning');
      
      // Store pending deposit with minimal client data (server validates everything)
      await apiRequest('POST', '/api/deposits/pending', {
        transactionHash: txHash,
        tokenType: selectedToken,
        amount: depositAmount,
        chainId: depositConfig.chainId
      });

      showStatus('✅ Transaction confirmed! Funds will be credited shortly.', 'success');
      toast({
        title: "Deposit Submitted",
        description: `${depositAmount} ${selectedToken} deposit submitted with transaction hash: ${txHash.substring(0, 10)}...`,
      });
      
      // Show Etherscan link
      console.log(`View transaction: https://etherscan.io/tx/${txHash}`);
      
      // Reset form
      setDepositAmount('100');
      setIsAddFundsOpen(false);
      
      // Refresh balance (will update when background service processes the deposit)
      queryClient.invalidateQueries({ queryKey: ['/api/users', user?.id, 'balance'] });

    } catch (error: any) {
      console.error('Payment error:', error);
      if (error.message?.includes('cancelled')) {
        showStatus('❌ Transaction cancelled by user', 'error');
      } else if (error.message?.includes('insufficient funds')) {
        showStatus('❌ Insufficient funds for transaction or gas fee', 'error');
      } else {
        showStatus(`❌ Transaction failed: ${error.message}`, 'error');
      }
    }
  };

  // Update gas estimate when amount or token changes
  useEffect(() => {
    if (walletConnected && depositAmount) {
      estimateGasFee();
    }
  }, [walletConnected, depositAmount, selectedToken]);

  const getUserNavItems = () => [
    { path: "/", label: "Markets", id: "markets" },
    { path: "/portfolio", label: "Portfolio", id: "portfolio" },
  ];

  const getAdminNavItems = () => [
    { path: "/", label: "Markets", id: "markets" },
    { path: "/portfolio", label: "Portfolio", id: "portfolio" },
    { path: "/admin", label: "Admin", id: "admin" },
  ];

  const navItems = isAdmin ? getAdminNavItems() : getUserNavItems();

  // Handle logout
  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
      });
      
      // Force page reload to clear all state
      window.location.href = '/';
    } catch (error) {
      console.error('Logout error:', error);
      // Force reload even if API fails
      window.location.href = '/';
    }
  };

  const isActive = (path: string) => {
    if (path === "/" && location === "/") return true;
    if (path !== "/" && location.startsWith(path)) return true;
    return false;
  };

  return (
    <nav className="sticky top-0 z-50 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          <div className="flex items-center space-x-4">
            <Link href="/" className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-accent rounded-lg flex items-center justify-center">
                <span className="text-accent-foreground font-bold text-sm">8B</span>
              </div>
              <span className="text-xl font-bold text-foreground">Gala 8Ball</span>
            </Link>
            <div className="hidden md:flex items-center space-x-6 ml-8">
              {navItems.map((item) => (
                <Button
                  key={item.id}
                  variant="ghost"
                  className={`text-sm font-medium transition-colors ${
                    isActive(item.path)
                      ? "text-foreground"
                      : "text-muted-foreground hover:text-primary"
                  }`}
                  data-testid={`nav-${item.id}`}
                  asChild
                >
                  <Link href={item.path}>
                    {item.label}
                  </Link>
                </Button>
              ))}
            </div>
          </div>
          
          <div className="flex items-center space-x-4">
            {/* Desktop Role Toggle */}
            {user && (
              <div className="hidden md:flex items-center space-x-3 px-3 py-1.5 bg-card border border-border rounded-lg">
                <span className={`text-xs font-medium ${role === 'user' ? 'text-foreground' : 'text-muted-foreground'}`}>
                  User
                </span>
                <Switch
                  checked={role === 'admin'}
                  onCheckedChange={(checked) => setRole(checked ? 'admin' : 'user')}
                  data-testid="desktop-role-toggle"
                />
                <span className={`text-xs font-medium ${role === 'admin' ? 'text-foreground' : 'text-muted-foreground'}`}>
                  Admin
                </span>
              </div>
            )}
            
            {user && (
              <Dialog open={isAddFundsOpen} onOpenChange={setIsAddFundsOpen}>
                <DialogTrigger asChild>
                  <Button
                    variant="default"
                    size="sm"
                    className="bg-accent hover:bg-accent/90 text-accent-foreground"
                    data-testid="add-funds-btn"
                  >
                    <Wallet className="w-4 h-4 mr-2" />
                    Add Funds
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-lg">
                  <DialogHeader>
                    <DialogTitle>Add Funds with Cryptocurrency</DialogTitle>
                    <DialogDescription>
                      Deposit USDC or USDT from your Ethereum wallet to fund your prediction market account
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    {/* Wallet Connection Status */}
                    {!walletConnected ? (
                      <div className="text-center py-4">
                        <Button 
                          onClick={connectWallet} 
                          className="w-full"
                          data-testid="connect-wallet-btn"
                        >
                          <Wallet className="w-4 h-4 mr-2" />
                          Connect Wallet
                        </Button>
                      </div>
                    ) : (
                      <>
                        <div className="bg-muted/50 p-3 rounded-lg">
                          <div className="text-sm text-muted-foreground">Connected Wallet:</div>
                          <div className="font-mono text-sm">{userAddress.substring(0, 6)}...{userAddress.substring(38)}</div>
                        </div>

                        {/* Token Selection */}
                        <div>
                          <Label htmlFor="token-select">Select Token</Label>
                          <Select value={selectedToken} onValueChange={(value) => setSelectedToken(value as 'USDC' | 'USDT')}>
                            <SelectTrigger id="token-select" data-testid="token-select">
                              <SelectValue placeholder="Select token" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="USDC">USDC</SelectItem>
                              <SelectItem value="USDT">USDT</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        {/* Amount Input */}
                        <div>
                          <Label htmlFor="deposit-amount">Amount to Deposit</Label>
                          <Input
                            id="deposit-amount"
                            type="number"
                            min="1"
                            placeholder="100"
                            value={depositAmount}
                            onChange={(e) => setDepositAmount(e.target.value)}
                            data-testid="deposit-amount-input"
                          />
                          <div className="text-xs text-muted-foreground mt-1">
                            Minimum: 1 {selectedToken} • Real cryptocurrency deposits from Ethereum mainnet
                          </div>
                        </div>

                        {/* Gas Fee Estimation */}
                        {gasEstimate && (
                          <div className="bg-muted/50 p-3 rounded-lg">
                            <div className="text-sm text-muted-foreground">Estimated Gas Fee:</div>
                            <div className="font-medium">{gasEstimate}</div>
                          </div>
                        )}
                      </>
                    )}

                    {/* Status Messages */}
                    {status.message && (
                      <div className={`p-3 rounded-lg text-sm ${
                        status.type === 'success' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' :
                        status.type === 'error' ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200' :
                        status.type === 'warning' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200' :
                        'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
                      }`} data-testid="status-message">
                        {status.message}
                      </div>
                    )}

                    {/* Action Buttons */}
                    <div className="flex justify-end space-x-3">
                      <Button
                        variant="outline" 
                        onClick={() => {
                          setIsAddFundsOpen(false);
                          setStatus({ message: '', type: 'info' });
                          setWalletConnected(false);
                          setUserAddress('');
                        }}
                      >
                        Cancel
                      </Button>
                      {walletConnected && (
                        <Button
                          onClick={sendPayment}
                          disabled={!depositAmount || parseFloat(depositAmount) < 1}
                          data-testid="send-payment-btn"
                        >
                          Send {depositAmount || '0'} {selectedToken}
                        </Button>
                      )}
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            )}
            
            {/* User Status (Wallet-based) */}
            {user ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    className="hidden sm:flex items-center space-x-2"
                    data-testid="user-menu-trigger"
                  >
                    <div className="w-2 h-2 rounded-full bg-chart-1"></div>
                    <User className="w-4 h-4" />
                    <span className="text-sm font-medium">{user.username || 'Trader'}</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>Wallet Connected</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link href="/portfolio" data-testid="nav-profile">
                      <User className="w-4 h-4 mr-2" />
                      Portfolio
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/admin" data-testid="nav-admin">
                      <User className="w-4 h-4 mr-2" />
                      Admin Panel
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleLogout} data-testid="nav-logout">
                    <LogOut className="w-4 h-4 mr-2" />
                    Disconnect Wallet
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <div className="hidden sm:flex items-center space-x-2">
                <Button 
                  variant="outline" 
                  size="sm"
                  data-testid="nav-login"
                  className="text-sm font-medium"
                  asChild
                >
                  <Link href="/login">
                    Login
                  </Link>
                </Button>
                <Button 
                  variant="default" 
                  size="sm"
                  data-testid="nav-signup"
                  className="text-sm font-medium bg-accent hover:bg-accent/90 text-accent-foreground"
                  asChild
                >
                  <Link href="/signup">
                    Sign Up
                  </Link>
                </Button>
              </div>
            )}
            
            {/* Wallet Connection for Funding */}
            <Button
              variant="outline"
              className="hidden sm:flex items-center space-x-2"
              data-testid="wallet-connect-btn"
              id="wallet-connect-trigger"
            >
              <div className={`w-2 h-2 rounded-full ${user ? 'bg-chart-1' : 'bg-muted'}`}></div>
              <Wallet className="w-4 h-4" />
              <span className="text-sm font-medium">
                {walletConnected ? `${userAddress.substring(0, 6)}...${userAddress.substring(38)}` : 'Connect Wallet'}
              </span>
            </Button>
            
            <Sheet open={isOpen} onOpenChange={setIsOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="md:hidden">
                  <Menu className="w-6 h-6" />
                </Button>
              </SheetTrigger>
              <SheetContent side="right">
                <div className="flex flex-col space-y-6 mt-8">
                  
                  {/* Mobile Authentication */}
                  {!user ? (
                    <div className="bg-card border border-border rounded-lg p-4">
                      <div className="text-sm font-medium mb-3">Get Started</div>
                      <div className="text-xs text-muted-foreground mb-4">
                        Create an account or sign in to start trading prediction markets
                      </div>
                      <div className="flex flex-col space-y-2">
                        <Button 
                          variant="outline" 
                          className="w-full text-sm"
                          data-testid="nav-mobile-login"
                          onClick={() => setIsOpen(false)}
                          asChild
                        >
                          <Link href="/login">
                            Login
                          </Link>
                        </Button>
                        <Button 
                          variant="default" 
                          className="w-full text-sm bg-accent hover:bg-accent/90 text-accent-foreground"
                          data-testid="nav-mobile-signup"
                          onClick={() => setIsOpen(false)}
                          asChild
                        >
                          <Link href="/signup">
                            Sign Up
                          </Link>
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-card border border-border rounded-lg p-4">
                      <div className="flex items-center space-x-3 mb-3">
                        <User className="w-5 h-5 text-muted-foreground" />
                        <div>
                          <div className="font-medium text-sm">{user.username || user.email || 'User'}</div>
                          <div className="text-xs text-muted-foreground">
                            {user.email && user.emailVerified ? 'Verified Account' : 'Account'}
                          </div>
                        </div>
                      </div>
                      <Button 
                        variant="outline" 
                        onClick={handleLogout}
                        className="w-full text-sm"
                        data-testid="nav-mobile-logout"
                      >
                        <LogOut className="w-4 h-4 mr-2" />
                        Sign Out
                      </Button>
                    </div>
                  )}
                  {/* Role Toggle */}
                  <div className="bg-card border border-border rounded-lg p-4">
                    <div className="flex items-center justify-between space-x-3">
                      <div className="flex items-center space-x-3">
                        <UserCog className="w-5 h-5 text-muted-foreground" />
                        <div>
                          <div className="font-medium text-sm">User Mode</div>
                          <div className="text-xs text-muted-foreground">
                            {role === 'user' ? 'Regular User' : 'Administrator'}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <span className={`text-xs font-medium ${role === 'user' ? 'text-foreground' : 'text-muted-foreground'}`}>
                          User
                        </span>
                        <Switch
                          checked={role === 'admin'}
                          onCheckedChange={(checked) => setRole(checked ? 'admin' : 'user')}
                          data-testid="role-toggle-switch"
                        />
                        <span className={`text-xs font-medium ${role === 'admin' ? 'text-foreground' : 'text-muted-foreground'}`}>
                          Admin
                        </span>
                      </div>
                    </div>
                    
                    <div className="mt-3 pt-3 border-t border-border">
                      <div className="text-xs text-muted-foreground">
                        {role === 'user' ? (
                          <>
                            <strong>User Access:</strong> Trade on markets, manage portfolio, deposit/withdraw funds
                          </>
                        ) : (
                          <>
                            <strong>Admin Access:</strong> All user features + create markets, resolve markets, manage users, collect fees
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  {/* Navigation Items */}
                  <div className="flex flex-col space-y-2">
                    {navItems.map((item) => (
                      <Button
                        key={item.id}
                        variant="ghost"
                        className={`w-full justify-start ${
                          isActive(item.path)
                            ? "text-foreground"
                            : "text-muted-foreground"
                        }`}
                        data-testid={`nav-mobile-${item.id}`}
                        onClick={() => setIsOpen(false)}
                        asChild
                      >
                        <Link href={item.path}>
                          {item.label}
                        </Link>
                      </Button>
                    ))}
                  </div>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </div>
    </nav>
  );
}
