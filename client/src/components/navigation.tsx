import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Menu, Plus, UserCog } from "lucide-react";
import { useUser } from "@/contexts/UserContext";
import { useRole } from "@/contexts/RoleContext";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export function Navigation() {
  const { user } = useUser();
  const { role, setRole, isAdmin } = useRole();
  const [location] = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const [isFaucetOpen, setIsFaucetOpen] = useState(false);
  const [faucetAmount, setFaucetAmount] = useState('100');
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const faucetMutation = useMutation({
    mutationFn: async (amount: string) => {
      if (!user?.id) throw new Error('User not authenticated');
      const response = await apiRequest('POST', `/api/users/${user.id}/faucet`, {
        amount: amount
      });
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Test USDC Added",
        description: data.message,
      });
      setIsFaucetOpen(false);
      setFaucetAmount('100');
      queryClient.invalidateQueries({ queryKey: ['/api/users', user?.id, 'balance'] });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to Add Test USDC",
        description: error.message || "Something went wrong. Please try again.",
        variant: "destructive",
      });
    },
  });

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
                <Link
                  key={item.id}
                  href={item.path}
                  data-testid={`nav-${item.id}`}
                >
                  <Button
                    variant="ghost"
                    className={`text-sm font-medium transition-colors ${
                      isActive(item.path)
                        ? "text-foreground"
                        : "text-muted-foreground hover:text-primary"
                    }`}
                  >
                    {item.label}
                  </Button>
                </Link>
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
              <Dialog open={isFaucetOpen} onOpenChange={setIsFaucetOpen}>
                <DialogTrigger asChild>
                  <Button
                    variant="default"
                    size="sm"
                    className="bg-accent hover:bg-accent/90 text-accent-foreground"
                    data-testid="add-test-usdc-btn"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Add Test USDC
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle>Add Test USDC</DialogTitle>
                    <DialogDescription>
                      Add test USDC to your balance for prediction market testing
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="faucet-amount">Amount (USDC)</Label>
                      <Input
                        id="faucet-amount"
                        type="number"
                        min="1"
                        max="1000"
                        placeholder="100"
                        value={faucetAmount}
                        onChange={(e) => setFaucetAmount(e.target.value)}
                        data-testid="faucet-amount-input"
                      />
                      <div className="text-xs text-muted-foreground mt-1">
                        Maximum: 1,000 USDC per request • Max balance: 10,000 USDC
                      </div>
                    </div>
                    <div className="flex justify-end space-x-3">
                      <Button
                        variant="outline" 
                        onClick={() => setIsFaucetOpen(false)}
                      >
                        Cancel
                      </Button>
                      <Button
                        onClick={() => faucetMutation.mutate(faucetAmount)}
                        disabled={!faucetAmount || parseFloat(faucetAmount) <= 0 || faucetMutation.isPending}
                        data-testid="faucet-confirm-btn"
                      >
                        {faucetMutation.isPending ? 'Adding...' : `Add $${faucetAmount || '0'}`}
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            )}
            
            <Button
              variant="outline"
              className="hidden sm:flex items-center space-x-2"
              data-testid="wallet-connect-btn"
              id="wallet-connect-trigger"
            >
              <div className={`w-2 h-2 rounded-full ${user ? 'bg-chart-1' : 'bg-destructive'}`}></div>
              <span className="text-sm font-medium">
                {user ? `${user.username || 'Guest'}` : 'Connect GalaChain'}
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
                      <Link
                        key={item.id}
                        href={item.path}
                        onClick={() => setIsOpen(false)}
                      >
                        <Button
                          variant="ghost"
                          className={`w-full justify-start ${
                            isActive(item.path)
                              ? "text-foreground"
                              : "text-muted-foreground"
                          }`}
                          data-testid={`nav-mobile-${item.id}`}
                        >
                          {item.label}
                        </Button>
                      </Link>
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
