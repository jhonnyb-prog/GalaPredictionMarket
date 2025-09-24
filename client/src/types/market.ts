export interface MarketData {
  id: string;
  question: string;
  description?: string;
  category: 'crypto' | 'politics' | 'sports' | 'tech' | 'entertainment';
  status: 'active' | 'resolved' | 'disputed' | 'cancelled';
  oracleType?: 'coingecko' | 'sportradar' | 'ap_elections' | 'manual';
  oracleConfig?: string;
  endDate: string;
  yesPrice: string;
  noPrice: string;
  volume: string;
  liquidity: string;
  tradingFee: string;
  createdAt: string;
}

export interface PositionData {
  id: string;
  userId: string;
  marketId: string;
  outcome: 'yes' | 'no';
  shares: string;
  avgPrice: string;
  totalCost: string;
  createdAt: string;
}

export interface OrderData {
  id: string;
  userId: string;
  marketId: string;
  type: 'buy' | 'sell';
  outcome: 'yes' | 'no';
  amount: string;
  price: string;
  shares: string;
  filled: boolean;
  createdAt: string;
}

export interface TradeData {
  id: string;
  marketId: string;
  buyerId: string;
  outcome: 'yes' | 'no';
  shares: string;
  price: string;
  amount: string;
  createdAt: string;
}
