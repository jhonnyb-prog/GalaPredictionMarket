import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { galaChainProvider } from "@/lib/galachain";
import { apiRequest } from "@/lib/queryClient";
import { useQueryClient } from "@tanstack/react-query";

export function WalletConnection() {
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const { toast } = useToast();

  // Listen for wallet connection trigger
  useEffect(() => {
    const button = document.getElementById('wallet-connect-trigger');
    if (button) {
      const handleClick = () => setIsOpen(true);
      button.addEventListener('click', handleClick);
      return () => button.removeEventListener('click', handleClick);
    }
  }, []);

  const walletOptions = [
    {
      id: 'gala',
      name: 'Gala Wallet',
      description: 'Official GalaChain wallet',
      icon: 'G',
      color: 'bg-accent'
    },
    {
      id: 'metamask',
      name: 'MetaMask',
      description: 'Connect using MetaMask',
      icon: 'M',
      color: 'bg-orange-500'
    },
    {
      id: 'walletconnect',
      name: 'WalletConnect',
      description: 'Connect with WalletConnect',
      icon: 'W',
      color: 'bg-blue-500'
    }
  ];

  const connectWallet = async (walletType: string) => {
    setIsConnecting(true);
    try {
      // Connect to GalaChain (mock for now)
      const wallet = await galaChainProvider.connect();
      
      // Create or get user
      const response = await apiRequest('POST', '/api/users', {
        walletAddress: wallet.address,
        username: `user_${wallet.address.slice(-6)}`
      });
      
      const user = await response.json();
      
      // Invalidate user query to refresh the user context
      queryClient.invalidateQueries({ queryKey: ['/api/auth/me'] });
      setIsOpen(false);
      
      toast({
        title: "Wallet Connected",
        description: `Connected to ${walletType} wallet successfully`,
      });
    } catch (error) {
      console.error('Wallet connection failed:', error);
      toast({
        title: "Connection Failed",
        description: "Failed to connect wallet. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsConnecting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Connect to GalaChain</DialogTitle>
          <DialogDescription>
            Choose your preferred wallet to connect to GalaChain network
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-3">
          {walletOptions.map((wallet) => (
            <Button
              key={wallet.id}
              variant="outline"
              className="w-full flex items-center space-x-3 p-4 h-auto justify-start"
              onClick={() => connectWallet(wallet.name)}
              disabled={isConnecting}
              data-testid={`wallet-option-${wallet.id}`}
            >
              <div className={`w-8 h-8 ${wallet.color} rounded-lg flex items-center justify-center text-white font-bold text-sm`}>
                {wallet.icon}
              </div>
              <div className="flex-1 text-left">
                <div className="font-medium text-foreground">{wallet.name}</div>
                <div className="text-sm text-muted-foreground">{wallet.description}</div>
              </div>
            </Button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
