// Wallet integration with MetaMask and Phantom support
// Removed @gala-chain/connect import to fix browser compatibility warnings
import { ethers } from 'ethers';

// Token addresses on Ethereum Mainnet
export const TOKEN_ADDRESSES = {
  'USDC': '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  'USDT': '0xdAC17F958D2ee523a2206206994597C13D831ec7'
};

// Token decimals
export const TOKEN_DECIMALS = {
  'USDC': 6,
  'USDT': 6
};

// ERC20 ABI for transfers
export const ERC20_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function transfer(address to, uint256 amount) returns (bool)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)'
];

export interface WalletInfo {
  address: string;
  isConnected: boolean;
  balance: string;
  walletType: 'metamask' | 'phantom' | 'gala' | null;
}

export interface WalletConnection {
  connect(walletType?: 'metamask' | 'phantom' | 'gala'): Promise<WalletInfo>;
  disconnect(): Promise<void>;
  getBalance(): Promise<string>;
  sendPayment(params: {
    token: 'USDC' | 'USDT';
    amount: string;
    recipientAddress: string;
    customerID: string;
  }): Promise<string>;
}

// Real Ethereum wallet provider implementation (MetaMask & Phantom)
export class EthereumWalletProvider implements WalletConnection {
  private provider: ethers.BrowserProvider | null = null;
  private signer: ethers.JsonRpcSigner | null = null;
  private wallet: WalletInfo | null = null;

  async connect(preferredWallet?: 'metamask' | 'phantom' | 'gala'): Promise<WalletInfo> {
    try {
      if (!window.ethereum) {
        throw new Error('No Ethereum wallet detected. Please install MetaMask or Phantom.');
      }

      console.log('Ethereum provider found:', window.ethereum);
      
      let selectedProvider = window.ethereum;
      let walletType: 'metamask' | 'phantom' = 'metamask';

      // Handle multiple wallet detection
      if (window.ethereum.providers?.length) {
        console.log('Multiple wallets detected:', window.ethereum.providers);
        
        if (preferredWallet === 'metamask') {
          selectedProvider = window.ethereum.providers.find((p: any) => (p as any).isMetaMask);
          walletType = 'metamask';
        } else if (preferredWallet === 'phantom') {
          selectedProvider = window.ethereum.providers.find((p: any) => (p as any).isPhantom);
          walletType = 'phantom';
        } else {
          // Default to MetaMask if available, otherwise Phantom
          selectedProvider = window.ethereum.providers.find((p: any) => (p as any).isMetaMask) ||
                           window.ethereum.providers.find((p: any) => (p as any).isPhantom) ||
                           window.ethereum.providers[0];
          walletType = (selectedProvider as any).isMetaMask ? 'metamask' : 'phantom';
        }
        
        if (!selectedProvider) {
          throw new Error('No compatible wallet found.');
        }
      } else {
        // Single wallet
        if ((window.ethereum as any).isMetaMask) {
          walletType = 'metamask';
        } else if ((window.ethereum as any).isPhantom) {
          walletType = 'phantom';
        }
      }

      console.log(`Connecting to ${walletType}...`);

      // Request accounts
      const accounts = await selectedProvider.request({
        method: 'eth_requestAccounts'
      });

      if (!accounts || accounts.length === 0) {
        throw new Error('No accounts found. Please unlock your wallet.');
      }

      const userAddress = accounts[0];

      // Check and switch to Ethereum Mainnet if needed
      const chainId = await selectedProvider.request({ method: 'eth_chainId' });
      if (chainId !== '0x1') {
        console.log('Switching to Ethereum Mainnet...');
        try {
          await selectedProvider.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: '0x1' }],
          });
        } catch (switchError: any) {
          if (switchError.code === 4902) {
            // Chain not added
            await selectedProvider.request({
              method: 'wallet_addEthereumChain',
              params: [{
                chainId: '0x1',
                chainName: 'Ethereum Mainnet',
                nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
                rpcUrls: ['https://cloudflare-eth.com'],
                blockExplorerUrls: ['https://etherscan.io']
              }]
            });
          } else {
            throw new Error('Please switch to Ethereum Mainnet manually');
          }
        }
      }

      // Setup ethers provider and signer
      this.provider = new ethers.BrowserProvider(selectedProvider);
      this.signer = await this.provider.getSigner();

      // Get ETH balance
      const balance = await this.provider.getBalance(userAddress);
      const balanceFormatted = ethers.formatEther(balance);

      this.wallet = {
        address: userAddress,
        isConnected: true,
        balance: balanceFormatted,
        walletType
      };

      // Setup event listeners
      selectedProvider.on('accountsChanged', this.handleAccountsChanged.bind(this));
      (selectedProvider as any).on('chainChanged', this.handleChainChanged.bind(this));

      return this.wallet;
    } catch (error: any) {
      console.error('Wallet connection failed:', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (window.ethereum) {
      try {
        window.ethereum.removeListener('accountsChanged', this.handleAccountsChanged.bind(this));
        (window.ethereum as any).removeListener('chainChanged', this.handleChainChanged.bind(this));
      } catch (error) {
        console.warn('Error removing listeners:', error);
      }
    }
    this.provider = null;
    this.signer = null;
    this.wallet = null;
  }

  async getBalance(): Promise<string> {
    if (!this.wallet) throw new Error('Wallet not connected');
    return this.wallet.balance;
  }

  async sendPayment(params: {
    token: 'USDC' | 'USDT';
    amount: string;
    recipientAddress: string;
    customerID: string;
  }): Promise<string> {
    if (!this.signer || !this.wallet) {
      throw new Error('Wallet not connected');
    }

    const { token, amount, recipientAddress, customerID } = params;

    try {
      // Create contract instance
      const tokenContract = new ethers.Contract(
        TOKEN_ADDRESSES[token],
        ERC20_ABI,
        this.signer
      );

      // Check balance
      const balance = await tokenContract.balanceOf(this.wallet.address);
      const decimals = TOKEN_DECIMALS[token];
      const amountWei = ethers.parseUnits(amount, decimals);

      if (balance < amountWei) {
        const balanceFormatted = ethers.formatUnits(balance, decimals);
        throw new Error(`Insufficient funds. You have ${balanceFormatted} ${token}, but trying to send ${amount} ${token}`);
      }

      console.log(`Sending ${amount} ${token} to ${recipientAddress} for customer ${customerID}`);
      console.log(`From wallet: ${this.wallet.address}`);

      // Send standard ERC-20 transfer (no custom data to avoid compatibility issues)
      // Attribution will be handled by matching wallet address to customerID on the backend
      const tx = await tokenContract.transfer(recipientAddress, amountWei);

      console.log('Transaction submitted:', tx.hash);
      console.log('View on Etherscan:', `https://etherscan.io/tx/${tx.hash}`);

      // Wait for confirmation
      await tx.wait();

      return tx.hash;
    } catch (error: any) {
      console.error('Payment error:', error);
      if (error.code === 'ACTION_REJECTED' || error.code === 4001) {
        throw new Error('Transaction cancelled by user');
      } else if (error.code === -32000) {
        throw new Error('Insufficient funds for gas fees');
      } else if (error.message?.includes('insufficient funds')) {
        throw new Error('Insufficient ETH for gas fees');
      } else {
        throw new Error(error.message || 'Transaction failed');
      }
    }
  }

  private handleAccountsChanged(accounts: string[]) {
    if (accounts.length === 0) {
      // User disconnected
      this.disconnect();
    } else if (this.wallet && accounts[0] !== this.wallet.address) {
      // User switched accounts - refresh the connection
      window.location.reload();
    }
  }

  private handleChainChanged(chainId: string) {
    console.log('Chain changed to:', chainId);
    window.location.reload();
  }

  isConnected(): boolean {
    return this.wallet?.isConnected || false;
  }

  getAddress(): string | null {
    return this.wallet?.address || null;
  }

  getWalletType(): string | null {
    return this.wallet?.walletType || null;
  }
}

// Wallet provider instances
export const ethereumWalletProvider = new EthereumWalletProvider();

// Initialize wallet SDK
export async function initializeWallet() {
  try {
    console.log('Initializing wallet providers...');
    return ethereumWalletProvider;
  } catch (error) {
    console.error('Failed to initialize wallet:', error);
    return ethereumWalletProvider;
  }
}

// Helper function to detect available wallets
export function detectAvailableWallets() {
  const wallets = [];
  
  if (typeof window !== 'undefined' && window.ethereum) {
    if (window.ethereum.providers?.length) {
      // Multiple wallets
      window.ethereum.providers.forEach((provider: any) => {
        if ((provider as any).isMetaMask) wallets.push('metamask');
        if ((provider as any).isPhantom) wallets.push('phantom');
      });
    } else {
      // Single wallet
      if ((window.ethereum as any).isMetaMask) wallets.push('metamask');
      if ((window.ethereum as any).isPhantom) wallets.push('phantom');
    }
  }
  
  return wallets;
}
