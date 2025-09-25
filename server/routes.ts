import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertMarketSchema, createOrderSchema, insertUserSchema } from "@shared/schema";
import { z } from "zod";
import { IStorage } from "./storage";
import publicApiRouter from "./publicApi";

// Extend session interface to include userId and admin flag
declare module 'express-session' {
  interface SessionData {
    userId?: string;
    isAdmin?: boolean;
  }
}

// Authorization middleware
function requireAuth(req: any, res: any, next: any) {
  if (!req.session?.userId) {
    return res.status(401).json({ error: "Authentication required" });
  }
  next();
}

function requireOwnership(req: any, res: any, next: any) {
  if (!req.session?.userId || req.session.userId !== req.params.id) {
    return res.status(403).json({ error: "Access denied - can only modify your own account" });
  }
  next();
}

// Admin middleware with proper authorization
function requireAdmin(req: any, res: any, next: any) {
  if (!req.session?.userId) {
    return res.status(401).json({ error: "Authentication required" });
  }
  
  // For demo/testing: Allow admin access based on session flag
  // In production, this should check user.isAdmin from database
  if (!req.session.isAdmin) {
    // Check if user has admin role in session (set by role toggle)
    return res.status(403).json({ error: "Admin access required" });
  }
  
  next();
}

// Validation schemas
const faucetSchema = z.object({
  amount: z.string().regex(/^\d+(\.\d{1,2})?$/, "Invalid amount format").transform(val => {
    const num = parseFloat(val);
    if (num <= 0 || num > 1000) {
      throw new Error("Amount must be between 0.01 and 1000 USDC");
    }
    return num;
  })
});

// Helper function to update user positions
async function updateUserPosition(
  storage: IStorage,
  userId: string,
  marketId: string,
  outcome: 'yes' | 'no',
  shares: string,
  price: string,
  amount: string
) {
  const existingPosition = await storage.getPosition(userId, marketId, outcome);

  if (existingPosition) {
    const newShares = parseFloat(existingPosition.shares) + parseFloat(shares);
    const newTotalCost = parseFloat(existingPosition.totalCost) + parseFloat(amount);
    const newAvgPrice = newTotalCost / newShares;

    await storage.updatePosition(existingPosition.id, {
      shares: newShares.toString(),
      totalCost: newTotalCost.toString(),
      avgPrice: newAvgPrice.toString(),
    });
  } else {
    await storage.createPosition({
      userId,
      marketId,
      outcome,
      shares,
      avgPrice: price,
      totalCost: amount,
    });
  }
}

// Helper function to update market prices with AMM logic
async function updateMarketPrices(
  storage: IStorage,
  marketId: string,
  outcome: 'yes' | 'no',
  side: 'buy' | 'sell',
  tradeAmount: number
) {
  const market = await storage.getMarket(marketId);
  if (!market) return;

  const newVolume = parseFloat(market.volume) + tradeAmount;
  
  // Enhanced AMM logic - larger trades have more price impact
  const baseImpact = 0.01;
  const volumeMultiplier = Math.min(tradeAmount / 1000, 0.05); // Cap at 5% impact
  const priceImpact = baseImpact + volumeMultiplier;
  
  // CRITICAL FIX: Consider both outcome and side for price impact direction
  // BUY YES or SELL NO = increases YES price
  // SELL YES or BUY NO = decreases YES price
  let yesPrice = parseFloat(market.yesPrice);
  
  if ((outcome === 'yes' && side === 'buy') || (outcome === 'no' && side === 'sell')) {
    // Increases YES price
    yesPrice = Math.min(0.95, yesPrice + priceImpact);
  } else {
    // Decreases YES price  
    yesPrice = Math.max(0.05, yesPrice - priceImpact);
  }
  
  await storage.updateMarket(marketId, {
    volume: newVolume.toString(),
    yesPrice: yesPrice.toString(),
    noPrice: (1 - yesPrice).toString(),
  });
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Mount public API router for bots and market makers
  app.use('/public/v1', publicApiRouter);
  
  // OpenAPI specification is now served by the public API router at /public/v1/openapi.json
  
  // Authentication endpoints
  app.post("/api/auth/guest", async (req, res) => {
    try {
      const { username } = req.body;
      
      // Regenerate session to prevent fixation attacks
      req.session.regenerate((err) => {
        if (err) {
          return res.status(500).json({ error: "Session regeneration failed" });
        }
        
        // Create guest user with minimal balance for testing
        const userData = {
          username: username || `Guest${Date.now()}`,
          walletAddress: `guest_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        };
        
        storage.createUser(userData).then(async (user) => {
          // Initialize with small test balance (100 USDC)
          await storage.updateUserBalance(user.id, '100');
          
          // Set session after regeneration
          req.session.userId = user.id;
          req.session.save((saveErr) => {
            if (saveErr) {
              return res.status(500).json({ error: "Session save failed" });
            }
            res.json({ user, message: "Guest session created with test balance" });
          });
        }).catch(() => {
          res.status(500).json({ error: "Failed to create guest user" });
        });
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to create guest session" });
    }
  });

  app.get("/api/auth/me", async (req, res) => {
    try {
      if (!req.session.userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const user = await storage.getUser(req.session.userId);
      if (!user) {
        req.session.userId = undefined;
        return res.status(401).json({ error: "User not found" });
      }
      
      res.json({ user });
    } catch (error) {
      res.status(500).json({ error: "Failed to get user session" });
    }
  });

  app.post("/api/auth/logout", async (req, res) => {
    // Clear session data before destroying
    req.session.userId = undefined;
    req.session.isAdmin = undefined;
    
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ error: "Failed to logout" });
      }
      
      // Clear the cookie on client side  
      res.clearCookie('sessionId', { 
        path: '/', 
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        sameSite: 'strict'
      });
      
      res.json({ message: "Logged out successfully" });
    });
  });

  // Admin toggle endpoint - RESTRICTED to development only  
  app.post("/api/auth/admin-toggle", requireAuth, async (req, res) => {
    try {
      // CRITICAL SECURITY: Only allow in development mode
      if (process.env.NODE_ENV === 'production') {
        return res.status(403).json({ 
          error: "Admin toggle disabled in production for security" 
        });
      }
      
      const { enable } = req.body;
      
      // Preserve userId before regeneration
      const prevUserId = req.session.userId;
      
      // Regenerate session when changing privileges (security best practice)
      req.session.regenerate((err) => {
        if (err) {
          return res.status(500).json({ error: "Session regeneration failed" });
        }
        
        // Restore identity and set admin flag in new session
        req.session.userId = prevUserId;
        req.session.isAdmin = !!enable;
        
        req.session.save((saveErr) => {
          if (saveErr) {
            return res.status(500).json({ error: "Session save failed" });
          }
          
          res.json({ 
            success: true, 
            isAdmin: req.session.isAdmin,
            message: `Admin access ${req.session.isAdmin ? 'enabled' : 'disabled'} (DEV MODE ONLY)`
          });
        });
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to toggle admin access" });
    }
  });

  // Markets
  app.get("/api/markets", async (req, res) => {
    try {
      const markets = await storage.getAllMarkets();
      res.json(markets);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch markets" });
    }
  });

  app.get("/api/markets/:id", async (req, res) => {
    try {
      const market = await storage.getMarket(req.params.id);
      if (!market) {
        return res.status(404).json({ error: "Market not found" });
      }
      res.json(market);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch market" });
    }
  });

  app.post("/api/markets", async (req, res) => {
    try {
      const validatedData = insertMarketSchema.parse(req.body);
      const market = await storage.createMarket(validatedData);
      res.status(201).json(market);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid market data", details: error.errors });
      }
      res.status(500).json({ error: "Failed to create market" });
    }
  });

  app.patch("/api/markets/:id", requireAdmin, async (req, res) => {
    try {
      const updateData = z.object({
        question: z.string().min(10).optional(),
        description: z.string().optional(),
        status: z.enum(['active', 'resolved', 'disputed', 'cancelled']).optional(),
        resolvedOutcome: z.enum(['yes', 'no']).optional(),
        resolutionSource: z.string().optional()
      }).strict().parse(req.body);

      const market = await storage.updateMarket(req.params.id, updateData);
      res.json(market);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid market data", details: error.errors });
      }
      res.status(500).json({ error: "Failed to update market" });
    }
  });

  // Market orders
  app.get("/api/markets/:id/orders", async (req, res) => {
    try {
      const orders = await storage.getMarketOrders(req.params.id);
      res.json(orders);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch orders" });
    }
  });

  // Market trades
  app.get("/api/markets/:id/trades", async (req, res) => {
    try {
      const trades = await storage.getMarketTrades(req.params.id);
      res.json(trades);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch trades" });
    }
  });

  // Secure /api/me/faucet route
  app.post("/api/me/faucet", requireAuth, async (req, res) => {
    try {
      const validatedData = faucetSchema.parse(req.body);
      const userId = req.session.userId!; // Safe after requireAuth
      
      // Get current balance
      const currentBalance = await storage.getUserBalance(userId);
      if (!currentBalance) {
        return res.status(404).json({ error: "User balance not found" });
      }
      
      const current = parseFloat(currentBalance.balance);
      const newBalance = current + validatedData.amount;
      
      // Set max balance (10000 USDC)
      if (newBalance > 10000) {
        return res.status(400).json({ error: "Maximum balance of 10,000 USDC reached. Reset your balance to continue testing." });
      }
      
      const updatedBalance = await storage.updateUserBalance(userId, newBalance.toString());
      res.json({ 
        balance: updatedBalance,
        message: `Added ${validatedData.amount} test USDC to your balance`
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid request data", details: error.errors });
      }
      res.status(500).json({ error: "Failed to add test USDC" });
    }
  });

  // Test USDC Faucet endpoints (backward compatibility)
  app.post("/api/users/:id/faucet", requireAuth, requireOwnership, async (req, res) => {
    try {
      const validatedData = faucetSchema.parse(req.body);
      const userId = req.params.id;
      
      // Get current balance
      const currentBalance = await storage.getUserBalance(userId);
      if (!currentBalance) {
        return res.status(404).json({ error: "User balance not found" });
      }
      
      const current = parseFloat(currentBalance.balance);
      const newBalance = current + validatedData.amount;
      
      // Set max balance (10000 USDC)
      if (newBalance > 10000) {
        return res.status(400).json({ error: "Maximum balance of 10,000 USDC reached. Reset your balance to continue testing." });
      }
      
      const updatedBalance = await storage.updateUserBalance(userId, newBalance.toString());
      res.json({ 
        balance: updatedBalance,
        message: `Added ${validatedData.amount} test USDC to your balance`
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid request data", details: error.errors });
      }
      res.status(500).json({ error: "Failed to add test USDC" });
    }
  });

  // Secure /api/me/withdraw route
  app.post("/api/me/withdraw", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!; // Safe after requireAuth
      const withdrawData = z.object({
        amount: z.string().refine((val) => !isNaN(parseFloat(val)) && parseFloat(val) > 0, {
          message: "Amount must be a positive number"
        }),
        address: z.string().min(10, "GalaChain address must be at least 10 characters")
      }).strict().parse(req.body);

      const amount = parseFloat(withdrawData.amount);
      
      // Get current balance
      const currentBalance = await storage.getUserBalance(userId);
      if (!currentBalance) {
        return res.status(400).json({ error: "User balance not found" });
      }
      
      const currentAmount = parseFloat(currentBalance.balance);
      
      if (amount > currentAmount) {
        return res.status(400).json({ error: "Insufficient balance" });
      }
      
      if (amount < 1) {
        return res.status(400).json({ error: "Minimum withdrawal amount is $1 USDC" });
      }

      // Update balance (demo implementation - just reduces balance)
      const newBalance = currentAmount - amount;
      await storage.updateUserBalance(userId, newBalance.toString());
      
      res.json({ 
        message: `Successfully withdrew $${amount.toFixed(2)} USDC to ${withdrawData.address.slice(0, 10)}...`,
        balance: newBalance.toString(),
        transactionId: `demo-tx-${Date.now()}` // Demo transaction ID
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid withdrawal data", details: error.errors });
      }
      res.status(500).json({ error: "Failed to process withdrawal" });
    }
  });

  // Withdraw (backward compatibility)
  app.post("/api/users/:id/withdraw", requireAuth, requireOwnership, async (req, res) => {
    try {
      const userId = req.params.id;
      const withdrawData = z.object({
        amount: z.string().refine((val) => !isNaN(parseFloat(val)) && parseFloat(val) > 0, {
          message: "Amount must be a positive number"
        }),
        address: z.string().min(10, "GalaChain address must be at least 10 characters")
      }).strict().parse(req.body);

      const amount = parseFloat(withdrawData.amount);
      
      // Get current balance
      const currentBalance = await storage.getUserBalance(userId);
      if (!currentBalance) {
        return res.status(400).json({ error: "User balance not found" });
      }
      
      const currentAmount = parseFloat(currentBalance.balance);
      
      if (amount > currentAmount) {
        return res.status(400).json({ error: "Insufficient balance" });
      }
      
      if (amount < 1) {
        return res.status(400).json({ error: "Minimum withdrawal amount is $1 USDC" });
      }

      // Update balance (demo implementation - just reduces balance)
      const newBalance = currentAmount - amount;
      await storage.updateUserBalance(userId, newBalance.toString());
      
      res.json({ 
        message: `Successfully withdrew $${amount.toFixed(2)} USDC to ${withdrawData.address.slice(0, 10)}...`,
        balance: newBalance.toString(),
        transactionId: `demo-tx-${Date.now()}` // Demo transaction ID
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid withdrawal data", details: error.errors });
      }
      res.status(500).json({ error: "Failed to process withdrawal" });
    }
  });

  // Secure /api/me/reset-balance route
  app.post("/api/me/reset-balance", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!; // Safe after requireAuth
      const updatedBalance = await storage.updateUserBalance(userId, '1000');
      
      res.json({ 
        balance: updatedBalance,
        message: "Balance reset to 1000 test USDC" 
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to reset balance" });
    }
  });

  // Reset balance (backward compatibility)
  app.post("/api/users/:id/reset-balance", requireAuth, requireOwnership, async (req, res) => {
    try {
      const userId = req.params.id;
      const updatedBalance = await storage.updateUserBalance(userId, '1000');
      res.json({ 
        balance: updatedBalance,
        message: "Balance reset to 1000 test USDC"
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to reset balance" });
    }
  });

  // Users
  app.post("/api/users", async (req, res) => {
    try {
      const validatedData = insertUserSchema.parse(req.body);
      const existingUser = await storage.getUserByWalletAddress(validatedData.walletAddress!);
      
      if (existingUser) {
        return res.json(existingUser);
      }

      const user = await storage.createUser(validatedData);
      res.status(201).json(user);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid user data", details: error.errors });
      }
      res.status(500).json({ error: "Failed to create user" });
    }
  });

  // Secure /api/me/balance route
  app.get("/api/me/balance", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!; // Safe after requireAuth
      const balance = await storage.getUserBalance(userId);
      if (!balance) {
        return res.status(404).json({ error: "User balance not found" });
      }
      res.json(balance);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch user balance" });
    }
  });

  // Keep original for backward compatibility
  app.get("/api/users/:id/balance", requireAuth, requireOwnership, async (req, res) => {
    try {
      const balance = await storage.getUserBalance(req.params.id);
      if (!balance) {
        return res.status(404).json({ error: "User balance not found" });
      }
      res.json(balance);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch user balance" });
    }
  });

  // DISABLED: Direct balance modification - use faucet/reset endpoints instead for security
  // app.patch("/api/users/:id/balance", requireAuth, requireOwnership, async (req, res) => {
  //   return res.status(410).json({ error: "Direct balance modification disabled. Use /faucet or /reset-balance endpoints." });
  // });

  // Secure /api/me/positions route  
  app.get("/api/me/positions", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!; // Safe after requireAuth
      const positions = await storage.getUserPositions(userId);
      res.json(positions || []);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch user positions" });
    }
  });

  // User positions (backward compatibility)
  app.get("/api/users/:id/positions", requireAuth, requireOwnership, async (req, res) => {
    try {
      const positions = await storage.getUserPositions(req.params.id);
      res.json(positions);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch positions" });
    }
  });

  // Secure /api/me/orders route
  app.get("/api/me/orders", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!; // Safe after requireAuth
      const orders = await storage.getUserOrders(userId);
      res.json(orders || []);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch user orders" });
    }
  });

  // User orders (backward compatibility)
  app.get("/api/users/:id/orders", requireAuth, requireOwnership, async (req, res) => {
    try {
      const orders = await storage.getUserOrders(req.params.id);
      res.json(orders);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch orders" });
    }
  });

  // Secure /api/me/trades route
  app.get("/api/me/trades", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!; // Safe after requireAuth
      const trades = await storage.getUserTrades(userId);
      res.json(trades || []);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch user trades" });
    }
  });

  // User trades (backward compatibility)
  app.get("/api/users/:id/trades", requireAuth, requireOwnership, async (req, res) => {
    try {
      const trades = await storage.getUserTrades(req.params.id);
      res.json(trades);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch trades" });
    }
  });

  // Trading
  app.post("/api/orders", requireAuth, async (req, res) => {
    try {
      const validatedData = createOrderSchema.parse(req.body);
      // SECURITY: Use userId from session, not client input
      const userId = req.session.userId!;
      
      const market = await storage.getMarket(validatedData.marketId);
      if (!market) {
        return res.status(404).json({ error: "Market not found" });
      }

      // Get user balance and position for validation
      const userBalance = await storage.getUserBalance(userId);
      if (!userBalance) {
        return res.status(404).json({ error: "User balance not found" });
      }

      // CRITICAL FIX: Only check cash balance for BUY orders
      if (validatedData.side === 'buy' && parseFloat(userBalance.balance) < parseFloat(validatedData.amount)) {
        return res.status(400).json({ error: "Insufficient balance" });
      }

      // Calculate current price first for validation
      const currentPrice = validatedData.outcome === 'yes' 
        ? parseFloat(market.yesPrice) 
        : parseFloat(market.noPrice);

      // For SELL orders, check shares availability upfront
      if (validatedData.side === 'sell') {
        const existingPosition = await storage.getPosition(
          userId,
          validatedData.marketId,
          validatedData.outcome
        );
        const actualAmount = parseFloat(validatedData.amount);
        const requiredShares = actualAmount / currentPrice;
        
        if (!existingPosition || parseFloat(existingPosition.shares) < requiredShares) {
          return res.status(400).json({ 
            error: "Insufficient shares to sell",
            available: existingPosition?.shares || '0',
            required: requiredShares.toString()
          });
        }
      }

      // Calculate execution parameters based on order type

      let executionPrice = currentPrice;
      let canExecute = false;

      if (validatedData.type === 'market') {
        // Market orders execute immediately at current price
        canExecute = true;
        
        // Apply slippage protection for market orders
        const maxSlippage = parseFloat(validatedData.maxSlippage || '0.05');
        const slippageLimit = validatedData.side === 'buy' 
          ? currentPrice * (1 + maxSlippage)
          : currentPrice * (1 - maxSlippage);

        if (validatedData.maxPrice && executionPrice > parseFloat(validatedData.maxPrice)) {
          return res.status(400).json({ 
            error: "Price exceeds maximum limit",
            currentPrice: executionPrice,
            maxPrice: validatedData.maxPrice
          });
        }

        if (validatedData.minPrice && executionPrice < parseFloat(validatedData.minPrice)) {
          return res.status(400).json({ 
            error: "Price below minimum limit",
            currentPrice: executionPrice,
            minPrice: validatedData.minPrice
          });
        }
      } else if (validatedData.type === 'limit') {
        // Limit orders only execute if price conditions are met
        const limitPrice = parseFloat(validatedData.limitPrice!);
        
        if (validatedData.side === 'buy') {
          // Buy limit: execute if market price <= limit price
          canExecute = currentPrice <= limitPrice;
          executionPrice = Math.min(currentPrice, limitPrice);
        } else {
          // Sell limit: execute if market price >= limit price
          canExecute = currentPrice >= limitPrice;
          executionPrice = Math.max(currentPrice, limitPrice);
        }
      }

      // CRITICAL FIX: Override client-provided shares with server-calculated ones
      const actualAmount = parseFloat(validatedData.amount);
      const actualShares = actualAmount / executionPrice;
      
      // Calculate trading fee
      const tradingFeeRate = parseFloat(market.tradingFee);
      const feeAmount = actualAmount * tradingFeeRate;
      const netAmount = actualAmount - feeAmount; // Amount after fee deduction
      const netShares = netAmount / executionPrice; // Shares after fee deduction
      
      const validatedDataWithServerShares = {
        ...validatedData,
        shares: netShares.toString(), // Use net shares after fee
        amount: netAmount.toString()  // Use net amount after fee
      };

      // Create the order with server-calculated shares and session userId
      const order = await storage.createOrder({ ...validatedDataWithServerShares, userId });

      // CRITICAL FIX: Declare trade variable in proper scope
      let trade = null;

      if (canExecute) {

        // CRITICAL FIX: Enforce slippage protection
        const maxSlippage = parseFloat(validatedData.maxSlippage || '0.05');
        const slippageBound = validatedData.side === 'buy' 
          ? currentPrice * (1 + maxSlippage)
          : currentPrice * (1 - maxSlippage);
        
        if (validatedData.side === 'buy' && executionPrice > slippageBound) {
          return res.status(400).json({ 
            error: "Price exceeds slippage tolerance",
            currentPrice,
            executionPrice,
            maxSlippage: `${(maxSlippage * 100).toFixed(1)}%`
          });
        }

        if (validatedData.side === 'sell' && executionPrice < slippageBound) {
          return res.status(400).json({ 
            error: "Price below slippage tolerance", 
            currentPrice,
            executionPrice,
            maxSlippage: `${(maxSlippage * 100).toFixed(1)}%`
          });
        }

        // CRITICAL FIX: Handle BUY vs SELL properly
        if (validatedData.side === 'buy') {
          // BUY: Deduct full amount (including fee), add net shares
          trade = await storage.createTrade({
            buyOrderId: order.id,
            marketId: validatedData.marketId,
            buyerId: userId,
            outcome: validatedData.outcome,
            shares: netShares.toString(),
            price: executionPrice.toString(),
            amount: netAmount.toString(), // Trade record shows net amount
          });

          // Deduct FULL amount (including fee) from balance
          const newBalance = (parseFloat(userBalance.balance) - actualAmount).toString();
          await storage.updateUserBalance(userId, newBalance);

          // Record the collected trading fee
          await storage.createCollectedFee({
            marketId: validatedData.marketId,
            tradeId: trade.id,
            userId: userId,
            feeAmount: feeAmount.toString(),
            feeRate: tradingFeeRate.toString(),
            originalAmount: actualAmount.toString()
          });

          // Update or create position (add NET shares after fee)
          await updateUserPosition(
            storage,
            userId,
            validatedData.marketId,
            validatedData.outcome,
            netShares.toString(),
            executionPrice.toString(),
            netAmount.toString()
          );
        } else {
          // SELL: Verify shares available, reduce shares, credit balance
          const existingPosition = await storage.getPosition(
            userId,
            validatedData.marketId,
            validatedData.outcome
          );

          if (!existingPosition || parseFloat(existingPosition.shares) < actualShares) {
            return res.status(400).json({ 
              error: "Insufficient shares to sell",
              available: existingPosition?.shares || '0',
              requested: actualShares.toString()
            });
          }

          trade = await storage.createTrade({
            sellOrderId: order.id,
            marketId: validatedData.marketId,
            sellerId: userId,
            outcome: validatedData.outcome,
            shares: actualShares.toString(), // Trade record shows gross shares sold
            price: executionPrice.toString(),
            amount: actualAmount.toString(), // Trade record shows gross amount
          });

          // Credit NET amount (after fee) to balance
          const newBalance = (parseFloat(userBalance.balance) + netAmount).toString();
          await storage.updateUserBalance(userId, newBalance);

          // Record the collected trading fee
          await storage.createCollectedFee({
            marketId: validatedData.marketId,
            tradeId: trade.id,
            userId: userId,
            feeAmount: feeAmount.toString(),
            feeRate: tradingFeeRate.toString(),
            originalAmount: actualAmount.toString()
          });

          // CRITICAL FIX: Reduce ACTUAL shares from position with proper cost basis math
          const newShares = parseFloat(existingPosition.shares) - actualShares;
          if (newShares <= 0) {
            // Position fully closed
            await storage.updatePosition(existingPosition.id, {
              shares: '0',
              totalCost: '0',
              avgPrice: existingPosition.avgPrice,
            });
          } else {
            // CRITICAL FIX: Reduce cost basis proportionally by average price
            const avgPrice = parseFloat(existingPosition.avgPrice);
            const costReduction = actualShares * avgPrice;
            const newTotalCost = parseFloat(existingPosition.totalCost) - costReduction;
            
            await storage.updatePosition(existingPosition.id, {
              shares: newShares.toString(),
              totalCost: Math.max(0, newTotalCost).toString(),
              avgPrice: existingPosition.avgPrice, // Keep original avg price
            });
          }
        }

        // Update market with AMM logic
        await updateMarketPrices(storage, validatedData.marketId, validatedData.outcome, validatedData.side, actualAmount);

        // Mark order as filled
        await storage.updateOrder(order.id, { 
          status: 'filled',
          filledShares: actualShares.toString(),
          avgFillPrice: executionPrice.toString()
        });

        res.status(201).json({ 
          order: { ...order, status: 'filled' }, 
          trade,
          executed: true,
          executionPrice,
          message: `Successfully ${validatedData.side} ${actualShares.toFixed(1)} ${validatedData.outcome.toUpperCase()} shares at $${executionPrice.toFixed(3)}`
        });
      } else {
        // Order created but not executed (pending limit order)
        res.status(201).json({ 
          order: { ...order, status: 'pending' }, 
          executed: false,
          message: `Limit order created. Will execute when price ${validatedData.side === 'buy' ? 'drops to' : 'rises to'} ${validatedData.limitPrice}`
        });
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid order data", details: error.errors });
      }
      res.status(500).json({ error: "Failed to create order" });
    }
  });

  // SIMPLE TEST ROUTE TO DEBUG
  app.get("/api/debug", (req, res) => {
    res.json({ message: "Debug route working", timestamp: Date.now() });
  });

  // WORKING FEES ENDPOINT - using existing pattern
  app.get("/api/fees-new", async (req, res) => {
    try {
      const feesData = await storage.getTotalCollectedFees();
      res.json(feesData);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch collected fees" });
    }
  });

  // Market order history endpoint
  app.get("/api/markets/:marketId/history", async (req, res) => {
    try {
      const { marketId } = req.params;
      const { limit = "50", offset = "0" } = req.query;
      
      // Get order history for this market
      const history = await storage.getMarketOrderHistory(
        marketId, 
        parseInt(limit as string), 
        parseInt(offset as string)
      );
      
      res.json(history);
    } catch (error) {
      console.error("Failed to get market history:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Analytics with integrated fee data
  app.get("/api/stats", async (req, res) => {
    try {
      const stats = await storage.getMarketStats();
      
      // Include fee collection data in stats response
      let totalFees = '0';
      try {
        const feesResult = await storage.getTotalCollectedFees();
        totalFees = feesResult?.totalFees || '0';
      } catch (feeError) {
        console.error('Fee collection error:', feeError);
        totalFees = '0';
      }
      
      res.json({
        totalVolume: stats.totalVolume || '0',
        activeMarkets: stats.activeMarkets?.toString() || '0',
        totalTrades: stats.totalTrades?.toString() || '0', 
        totalUsers: stats.totalUsers?.toString() || '0',
        totalFees: totalFees
      });
    } catch (error) {
      console.error('Stats endpoint error:', error);
      res.status(500).json({ error: "Failed to fetch stats" });
    }
  });

  // Admin endpoints for user management
  app.get("/api/admin/users", requireAdmin, async (req, res) => {
    try {
      const users = await storage.getAllUsersWithBalances();
      res.json(users);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch users" });
    }
  });

  // Admin fee management endpoints
  app.get("/api/admin/fees/summary", requireAdmin, async (req, res) => {
    try {
      const feeTotals = await storage.getFeeTotals();
      res.json(feeTotals);
    } catch (error) {
      console.error("Fee summary error:", error);
      res.status(500).json({ error: "Failed to fetch fee summary" });
    }
  });

  app.get("/api/admin/fees/withdrawals", requireAdmin, async (req, res) => {
    try {
      const withdrawals = await storage.listFeeWithdrawals();
      res.json(withdrawals);
    } catch (error) {
      console.error("Fee withdrawals error:", error);
      res.status(500).json({ error: "Failed to fetch fee withdrawals" });
    }
  });

  app.post("/api/admin/fees/withdraw", requireAdmin, async (req, res) => {
    try {
      const validatedData = z.object({
        toAddress: z.string().min(10, "Invalid GalaChain address").max(200, "Address too long"),
        amount: z.string().regex(/^\d+(\.\d{1,8})?$/, "Invalid amount format").refine(val => {
          const num = parseFloat(val);
          return num > 0.01 && num <= 10000; // Min 0.01, Max 10,000 USDC per withdrawal
        }, "Amount must be between 0.01 and 10,000 USDC")
      }).parse(req.body);

      const adminUserId = req.session.userId!;

      // Create pending withdrawal
      const withdrawal = await storage.createFeeWithdrawalPending({
        adminUserId,
        toAddress: validatedData.toAddress,
        amount: validatedData.amount
      });

      // TODO: Implement actual GalaChain transfer
      // For now, immediately mark as completed for testing
      const completedWithdrawal = await storage.markFeeWithdrawalCompleted(
        withdrawal.id, 
        `mock_tx_${Date.now()}`
      );

      res.status(201).json({
        success: true,
        withdrawal: completedWithdrawal,
        message: `Successfully initiated withdrawal of ${validatedData.amount} USDC to ${validatedData.toAddress}`
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid withdrawal data", details: error.errors });
      }
      console.error("Fee withdrawal error:", error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to process withdrawal" 
      });
    }
  });

  app.patch("/api/admin/users/:id", requireAdmin, async (req, res) => {
    try {
      const userId = req.params.id;
      const updateData = z.object({
        username: z.string().min(2).optional()
      }).strict().parse(req.body);
      
      // Validate that user exists
      const existingUser = await storage.getUser(userId);
      if (!existingUser) {
        return res.status(404).json({ error: "User not found" });
      }

      const updatedUser = await storage.updateUser(userId, updateData);
      res.json(updatedUser);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid update data", details: error.errors });
      }
      res.status(500).json({ error: "Failed to update user" });
    }
  });

  app.get("/api/admin/users/:id/activity", requireAdmin, async (req, res) => {
    try {
      const userId = req.params.id;
      
      // Admin can access any user's activity data
      const [balance, positions, orders, trades] = await Promise.all([
        storage.getUserBalance(userId),
        storage.getUserPositions(userId),
        storage.getUserOrders(userId), 
        storage.getUserTrades(userId)
      ]);

      res.json({
        balance,
        positions,
        orders,
        trades,
        stats: {
          totalPositions: positions.length,
          totalOrders: orders.length,
          totalTrades: trades.length,
          portfolioValue: balance?.balance || '0'
        }
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch user activity" });
    }
  });

  // Test endpoint to debug admin issues
  app.get("/api/test/fees", async (req, res) => {
    try {
      const feesData = await storage.getTotalCollectedFees();
      res.json(feesData);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch collected fees" });
    }
  });

  // Admin endpoint to view total collected fees
  app.get("/api/admin/fees", async (req, res) => {
    try {
      const feesData = await storage.getTotalCollectedFees();
      res.json(feesData);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch collected fees" });
    }
  });

  // API Key Management Endpoints
  app.post("/api/admin/apikeys", requireAdmin, async (req, res) => {
    try {
      const { generateApiKey, generateSigningSecret } = await import("./publicApiMiddleware");
      
      // Validate input using the schema
      const validatedData = insertApiKeySchema.parse(req.body);
      
      // Generate secure keys
      const keyId = generateApiKey();
      const signingSecret = generateSigningSecret();
      
      // Create API key in database
      const newApiKey = await storage.createApiKey({
        ...validatedData,
        id: keyId,
        signingSecret: signingSecret,
      });
      
      // Return API key details (including the signing secret for one-time display)
      res.status(201).json({
        success: true,
        apiKey: {
          id: newApiKey.id,
          userId: newApiKey.userId,
          label: newApiKey.label,
          scopes: newApiKey.scopes,
          status: newApiKey.status,
          rateLimitTier: newApiKey.rateLimitTier,
          expiresAt: newApiKey.expiresAt,
          createdAt: newApiKey.createdAt,
          signingSecret: signingSecret, // IMPORTANT: Only shown once
        },
        message: "API key created successfully. Please save the signing secret as it will not be shown again."
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          error: "Invalid API key data", 
          details: error.errors 
        });
      }
      console.error("API key creation error:", error);
      res.status(500).json({ error: "Failed to create API key" });
    }
  });

  app.get("/api/admin/apikeys", requireAdmin, async (req, res) => {
    try {
      const { userId } = req.query;
      
      if (userId) {
        // Get API keys for specific user
        const apiKeys = await storage.getUserApiKeys(userId as string);
        res.json({ apiKeys });
      } else {
        // Get all API keys (admin view) - this requires a new storage method
        // For now, return error suggesting to use userId parameter
        res.status(400).json({ 
          error: "userId parameter is required",
          message: "Use ?userId=USER_ID to get API keys for a specific user"
        });
      }
    } catch (error) {
      console.error("API key listing error:", error);
      res.status(500).json({ error: "Failed to retrieve API keys" });
    }
  });

  app.patch("/api/admin/apikeys/:id", requireAdmin, async (req, res) => {
    try {
      const keyId = req.params.id;
      const updateData = z.object({
        status: z.enum(['active', 'suspended', 'revoked']).optional(),
        label: z.string().min(1).max(100).optional(),
        rateLimitTier: z.number().int().min(1).max(10).optional(),
        expiresAt: z.string().transform(val => val ? new Date(val) : null).optional(),
      }).strict().parse(req.body);
      
      const updatedApiKey = await storage.updateApiKey(keyId, updateData);
      
      res.json({
        success: true,
        apiKey: {
          id: updatedApiKey.id,
          userId: updatedApiKey.userId,
          label: updatedApiKey.label,
          scopes: updatedApiKey.scopes,
          status: updatedApiKey.status,
          rateLimitTier: updatedApiKey.rateLimitTier,
          expiresAt: updatedApiKey.expiresAt,
          lastUsedAt: updatedApiKey.lastUsedAt,
          createdAt: updatedApiKey.createdAt,
          updatedAt: updatedApiKey.updatedAt,
        }
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          error: "Invalid update data", 
          details: error.errors 
        });
      }
      console.error("API key update error:", error);
      res.status(500).json({ error: "Failed to update API key" });
    }
  });

  app.delete("/api/admin/apikeys/:id", requireAdmin, async (req, res) => {
    try {
      const keyId = req.params.id;
      await storage.deleteApiKey(keyId);
      
      res.json({
        success: true,
        message: "API key deleted successfully"
      });
    } catch (error) {
      console.error("API key deletion error:", error);
      res.status(500).json({ error: "Failed to delete API key" });
    }
  });

  // User API Key Management (Non-Admin)
  app.post("/api/me/apikeys", requireAuth, async (req, res) => {
    try {
      const { generateApiKey, generateSigningSecret } = await import("./publicApiMiddleware");
      
      // Use default values for user-generated API keys
      const keyData = {
        userId: req.session.userId,
        label: req.body.label || `API Key ${new Date().toLocaleDateString()}`,
        scopes: ['read', 'trade'], // Users get read and trade by default
        rateLimitTier: 1, // Basic tier for regular users
        expiresAt: null, // No expiration by default
      };
      
      // Validate input
      const validatedData = insertApiKeySchema.parse(keyData);
      
      // Generate secure keys
      const keyId = generateApiKey();
      const signingSecret = generateSigningSecret();
      
      // Create API key in database
      const newApiKey = await storage.createApiKey({
        ...validatedData,
        id: keyId,
        signingSecret: signingSecret,
      });
      
      // Return API key details (including the signing secret for one-time display)
      res.status(201).json({
        success: true,
        apiKey: {
          id: newApiKey.id,
          label: newApiKey.label,
          scopes: newApiKey.scopes,
          status: newApiKey.status,
          rateLimitTier: newApiKey.rateLimitTier,
          expiresAt: newApiKey.expiresAt,
          createdAt: newApiKey.createdAt,
          signingSecret: signingSecret, // IMPORTANT: Only shown once
        },
        message: "API key created successfully. Please save the signing secret as it will not be shown again."
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          error: "Invalid API key data", 
          details: error.errors 
        });
      }
      console.error("User API key creation error:", error);
      res.status(500).json({ error: "Failed to create API key" });
    }
  });

  app.get("/api/me/apikeys", requireAuth, async (req, res) => {
    try {
      // Get API keys for current user (without signing secrets)
      const apiKeys = await storage.getUserApiKeys(req.session.userId);
      
      // Remove signing secrets from response for security
      const safeApiKeys = apiKeys.map(key => ({
        id: key.id,
        label: key.label,
        scopes: key.scopes,
        status: key.status,
        rateLimitTier: key.rateLimitTier,
        expiresAt: key.expiresAt,
        lastUsedAt: key.lastUsedAt,
        createdAt: key.createdAt,
        updatedAt: key.updatedAt,
      }));
      
      res.json({ apiKeys: safeApiKeys });
    } catch (error) {
      console.error("User API key listing error:", error);
      res.status(500).json({ error: "Failed to retrieve API keys" });
    }
  });

  app.delete("/api/me/apikeys/:id", requireAuth, async (req, res) => {
    try {
      const keyId = req.params.id;
      
      // Verify the API key belongs to the current user
      const apiKey = await storage.getApiKey(keyId);
      if (!apiKey || apiKey.userId !== req.session.userId) {
        return res.status(404).json({ error: "API key not found" });
      }
      
      await storage.deleteApiKey(keyId);
      
      res.json({
        success: true,
        message: "API key deleted successfully"
      });
    } catch (error) {
      console.error("User API key deletion error:", error);
      res.status(500).json({ error: "Failed to delete API key" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
