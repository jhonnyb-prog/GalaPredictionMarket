// Simple Automated Market Maker calculations
export function calculatePrice(
  yesShares: number,
  noShares: number,
  k: number = 10000 // Constant product
): { yesPrice: number; noPrice: number } {
  const totalShares = yesShares + noShares;
  if (totalShares === 0) {
    return { yesPrice: 0.5, noPrice: 0.5 };
  }
  
  const yesPrice = noShares / totalShares;
  const noPrice = yesShares / totalShares;
  
  return {
    yesPrice: Math.max(0.01, Math.min(0.99, yesPrice)),
    noPrice: Math.max(0.01, Math.min(0.99, noPrice))
  };
}

export function calculateSharesFromAmount(
  amount: number,
  price: number
): number {
  return amount / price;
}

export function calculateAmountFromShares(
  shares: number,
  price: number
): number {
  return shares * price;
}

export function calculatePotentialReturn(
  shares: number,
  buyPrice: number
): number {
  // Maximum return is when price goes to $1
  const maxReturn = shares * 1;
  const cost = shares * buyPrice;
  return maxReturn - cost;
}

export function calculateSlippage(
  amount: number,
  currentPrice: number,
  liquidity: number
): number {
  // Simple slippage calculation based on trade size vs liquidity
  const tradeImpact = amount / liquidity;
  return Math.min(0.1, tradeImpact * 0.5); // Max 10% slippage
}
