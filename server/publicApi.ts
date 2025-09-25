import { Router } from 'express';
import { z } from 'zod';
import { readFileSync } from 'fs';
import { join } from 'path';
import { storage } from './storage';
import { apiKeyAuth, requireScope, rateLimit, verifyHmac, ipRateLimit, type ApiKeyRequest } from './publicApiMiddleware';

const router = Router();

// Validation schemas
const paginationSchema = z.object({
  limit: z.string().optional().transform(val => val ? Math.min(parseInt(val), 100) : 25),
  offset: z.string().optional().transform(val => val ? parseInt(val) : 0),
  since: z.string().optional().transform(val => val ? parseInt(val) : undefined),
});

const marketFiltersSchema = z.object({
  status: z.enum(['active', 'resolved', 'disputed', 'cancelled']).optional(),
  category: z.enum(['crypto', 'politics', 'sports', 'tech', 'entertainment']).optional(),
}).merge(paginationSchema);

const orderSchema = z.object({
  type: z.enum(['market', 'limit']),
  side: z.enum(['buy', 'sell']),
  outcome: z.enum(['yes', 'no']),
  amount: z.string().regex(/^\d+(\.\d{1,8})?$/, 'Invalid amount format'),
  limitPrice: z.string().regex(/^\d+(\.\d{1,8})?$/, 'Invalid price format').optional(),
  maxSlippage: z.string().regex(/^\d+(\.\d{1,4})?$/, 'Invalid slippage format').optional(),
});

// Error handler wrapper
const asyncHandler = (fn: Function) => (req: any, res: any, next: any) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// Middleware to parse and validate query parameters
const validateQuery = (schema: z.ZodSchema) => (req: any, res: any, next: any) => {
  try {
    req.validatedQuery = schema.parse(req.query);
    next();
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid query parameters',
          details: error.errors,
        },
      });
    }
    next(error);
  }
};

// ==========================================
// PUBLIC ENDPOINTS (No authentication required)
// ==========================================

/**
 * Health check endpoint
 */
router.get('/ping', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: 'v1',
  });
});

/**
 * Serve OpenAPI specification
 */
router.get('/openapi.json', (req, res) => {
  try {
    const openapiSpec = readFileSync(join(process.cwd(), 'server', 'openapi-spec.json'), 'utf8');
    const spec = JSON.parse(openapiSpec);
    res.json(spec);
  } catch (error) {
    console.error('Error serving OpenAPI spec:', error);
    res.status(500).json({
      error: {
        code: 'SPEC_ERROR',
        message: 'Unable to load API specification',
      },
    });
  }
});

/**
 * Get all active markets with filtering and pagination
 */
router.get('/markets', 
  ipRateLimit,
  validateQuery(marketFiltersSchema),
  asyncHandler(async (req: any, res: any) => {
    const { status, category, limit, offset } = req.validatedQuery;
    
    // For now, get all markets and filter in memory (can be optimized with DB queries)
    const allMarkets = await storage.getAllMarkets();
    
    let filteredMarkets = allMarkets;
    
    if (status) {
      filteredMarkets = filteredMarkets.filter(m => m.status === status);
    }
    
    if (category) {
      filteredMarkets = filteredMarkets.filter(m => m.category === category);
    }
    
    // Apply pagination
    const paginatedMarkets = filteredMarkets
      .slice(offset, offset + limit)
      .map(market => ({
        id: market.id,
        question: market.question,
        description: market.description,
        category: market.category,
        status: market.status,
        endDate: market.endDate,
        yesPrice: market.yesPrice,
        noPrice: market.noPrice,
        volume: market.volume,
        liquidity: market.liquidity,
        tradingFee: market.tradingFee,
        createdAt: market.createdAt,
        resolvedAt: market.resolvedAt,
        resolvedOutcome: market.resolvedOutcome,
      }));
    
    res.json({
      markets: paginatedMarkets,
      pagination: {
        limit,
        offset,
        total: filteredMarkets.length,
        hasMore: offset + limit < filteredMarkets.length,
      },
    });
  })
);

/**
 * Get specific market details
 */
router.get('/markets/:id', 
  ipRateLimit,
  asyncHandler(async (req: any, res: any) => {
    const market = await storage.getMarket(req.params.id);
    
    if (!market) {
      return res.status(404).json({
        error: {
          code: 'MARKET_NOT_FOUND',
          message: 'Market not found',
        },
      });
    }
    
    res.json({
      id: market.id,
      question: market.question,
      description: market.description,
      category: market.category,
      status: market.status,
      oracleType: market.oracleType,
      endDate: market.endDate,
      resolutionSource: market.resolutionSource,
      yesPrice: market.yesPrice,
      noPrice: market.noPrice,
      volume: market.volume,
      liquidity: market.liquidity,
      tradingFee: market.tradingFee,
      createdAt: market.createdAt,
      resolvedAt: market.resolvedAt,
      resolvedOutcome: market.resolvedOutcome,
    });
  })
);

/**
 * Get market order book (current orders)
 */
router.get('/markets/:id/orderbook',
  ipRateLimit,
  asyncHandler(async (req: any, res: any) => {
    const market = await storage.getMarket(req.params.id);
    
    if (!market) {
      return res.status(404).json({
        error: {
          code: 'MARKET_NOT_FOUND',
          message: 'Market not found',
        },
      });
    }
    
    const orders = await storage.getMarketOrders(req.params.id);
    
    // Group orders by side and outcome
    const orderbook = {
      yes: {
        bids: orders
          .filter(o => o.outcome === 'yes' && o.side === 'buy' && o.status === 'pending')
          .map(o => ({
            price: o.limitPrice || o.minPrice,
            size: o.shares,
            orderId: o.id,
          }))
          .sort((a, b) => parseFloat(b.price || '0') - parseFloat(a.price || '0')),
        asks: orders
          .filter(o => o.outcome === 'yes' && o.side === 'sell' && o.status === 'pending')
          .map(o => ({
            price: o.limitPrice || o.maxPrice,
            size: o.shares,
            orderId: o.id,
          }))
          .sort((a, b) => parseFloat(a.price || '0') - parseFloat(b.price || '0')),
      },
      no: {
        bids: orders
          .filter(o => o.outcome === 'no' && o.side === 'buy' && o.status === 'pending')
          .map(o => ({
            price: o.limitPrice || o.minPrice,
            size: o.shares,
            orderId: o.id,
          }))
          .sort((a, b) => parseFloat(b.price || '0') - parseFloat(a.price || '0')),
        asks: orders
          .filter(o => o.outcome === 'no' && o.side === 'sell' && o.status === 'pending')
          .map(o => ({
            price: o.limitPrice || o.maxPrice,
            size: o.shares,
            orderId: o.id,
          }))
          .sort((a, b) => parseFloat(a.price || '0') - parseFloat(b.price || '0')),
      },
    };
    
    res.json({
      marketId: req.params.id,
      orderbook,
      timestamp: new Date().toISOString(),
    });
  })
);

/**
 * Get market trade history
 */
router.get('/markets/:id/trades',
  ipRateLimit,
  validateQuery(paginationSchema),
  asyncHandler(async (req: any, res: any) => {
    const market = await storage.getMarket(req.params.id);
    
    if (!market) {
      return res.status(404).json({
        error: {
          code: 'MARKET_NOT_FOUND',
          message: 'Market not found',
        },
      });
    }
    
    const { limit, since } = req.validatedQuery;
    let trades = await storage.getMarketTrades(req.params.id);
    
    // Filter by timestamp if 'since' is provided
    if (since) {
      const sinceDate = new Date(since);
      trades = trades.filter(t => t.createdAt && new Date(t.createdAt) >= sinceDate);
    }
    
    // Limit results
    const limitedTrades = trades
      .slice(0, limit)
      .map(trade => ({
        id: trade.id,
        outcome: trade.outcome,
        shares: trade.shares,
        price: trade.price,
        amount: trade.amount,
        timestamp: trade.createdAt,
      }));
    
    res.json({
      marketId: req.params.id,
      trades: limitedTrades,
      hasMore: trades.length > limit,
    });
  })
);

/**
 * Get ticker data for all markets
 */
router.get('/ticker',
  ipRateLimit,
  asyncHandler(async (req: any, res: any) => {
    const markets = await storage.getAllMarkets();
    
    const ticker = markets
      .filter(m => m.status === 'active')
      .map(market => ({
        marketId: market.id,
        question: market.question,
        category: market.category,
        yesPrice: market.yesPrice,
        noPrice: market.noPrice,
        volume: market.volume,
        volume24h: market.volume, // TODO: Calculate 24h volume when we have time-based queries
        change24h: '0', // TODO: Calculate price change when we have historical data
      }));
    
    res.json({
      ticker,
      timestamp: new Date().toISOString(),
    });
  })
);

/**
 * Get platform statistics
 */
router.get('/stats',
  ipRateLimit,
  asyncHandler(async (req: any, res: any) => {
    const stats = await storage.getMarketStats();
    
    res.json({
      totalVolume: stats.totalVolume,
      activeMarkets: stats.activeMarkets,
      totalTrades: stats.totalTrades,
      totalUsers: stats.totalUsers,
    });
  })
);

// ==========================================
// AUTHENTICATED ENDPOINTS (API key required)
// ==========================================

/**
 * Get account balance
 */
router.get('/account/balance',
  rateLimit,
  apiKeyAuth,
  requireScope('read'),
  asyncHandler(async (req: ApiKeyRequest, res: any) => {
    if (!req.apiUser) {
      return res.status(401).json({
        error: {
          code: 'USER_NOT_FOUND',
          message: 'Associated user not found',
        },
      });
    }
    
    const balance = await storage.getUserBalance(req.apiUser.id);
    
    res.json({
      userId: req.apiUser.id,
      username: req.apiUser.username,
      balance: balance?.balance || '0',
      updatedAt: balance?.updatedAt,
    });
  })
);

/**
 * Get user positions
 */
router.get('/account/positions',
  rateLimit,
  apiKeyAuth,
  requireScope('read'),
  asyncHandler(async (req: ApiKeyRequest, res: any) => {
    if (!req.apiUser) {
      return res.status(401).json({
        error: {
          code: 'USER_NOT_FOUND',
          message: 'Associated user not found',
        },
      });
    }
    
    const positions = await storage.getUserPositions(req.apiUser.id);
    
    const formattedPositions = positions.map(position => ({
      id: position.id,
      marketId: position.marketId,
      outcome: position.outcome,
      shares: position.shares,
      avgPrice: position.avgPrice,
      totalCost: position.totalCost,
      createdAt: position.createdAt,
      updatedAt: position.updatedAt,
    }));
    
    res.json({
      positions: formattedPositions,
    });
  })
);

/**
 * Get user orders
 */
router.get('/account/orders',
  rateLimit,
  apiKeyAuth,
  requireScope('read'),
  asyncHandler(async (req: ApiKeyRequest, res: any) => {
    if (!req.apiUser) {
      return res.status(401).json({
        error: {
          code: 'USER_NOT_FOUND',
          message: 'Associated user not found',
        },
      });
    }
    
    const orders = await storage.getUserOrders(req.apiUser.id);
    
    const formattedOrders = orders.map(order => ({
      id: order.id,
      marketId: order.marketId,
      type: order.type,
      side: order.side,
      outcome: order.outcome,
      amount: order.amount,
      limitPrice: order.limitPrice,
      shares: order.shares,
      filledShares: order.filledShares,
      avgFillPrice: order.avgFillPrice,
      status: order.status,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
    }));
    
    res.json({
      orders: formattedOrders,
    });
  })
);

/**
 * Create a new order (buy/sell shares)
 */
router.post('/orders',
  rateLimit,
  apiKeyAuth,
  requireScope('trade'),
  verifyHmac,
  asyncHandler(async (req: ApiKeyRequest, res: any) => {
    if (!req.apiUser) {
      return res.status(401).json({
        error: {
          code: 'USER_NOT_FOUND',
          message: 'Associated user not found',
        },
      });
    }
    
    try {
      const validatedOrder = orderSchema.parse(req.body);
      
      // Check if market exists and is active
      const market = await storage.getMarket(req.body.marketId);
      if (!market) {
        return res.status(404).json({
          error: {
            code: 'MARKET_NOT_FOUND',
            message: 'Market not found',
          },
        });
      }
      
      if (market.status !== 'active') {
        return res.status(400).json({
          error: {
            code: 'MARKET_INACTIVE',
            message: 'Cannot trade on inactive market',
          },
        });
      }
      
      // Check if user has sufficient balance
      const userBalance = await storage.getUserBalance(req.apiUser.id);
      const currentBalance = parseFloat(userBalance?.balance || '0');
      const requiredAmount = parseFloat(validatedOrder.amount);
      
      if (currentBalance < requiredAmount) {
        return res.status(400).json({
          error: {
            code: 'INSUFFICIENT_BALANCE',
            message: `Insufficient balance. Required: ${requiredAmount}, Available: ${currentBalance}`,
          },
        });
      }
      
      // Create the order
      const newOrder = await storage.createOrder({
        userId: req.apiUser.id,
        marketId: req.body.marketId,
        type: validatedOrder.type,
        side: validatedOrder.side,
        outcome: validatedOrder.outcome,
        amount: validatedOrder.amount,
        limitPrice: validatedOrder.limitPrice,
        maxSlippage: validatedOrder.maxSlippage || '0.05',
        shares: '0', // Will be calculated by the matching engine
      });
      
      res.status(201).json({
        orderId: newOrder.id,
        status: newOrder.status,
        message: 'Order created successfully',
      });
      
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid order data',
            details: error.errors,
          },
        });
      }
      throw error;
    }
  })
);

/**
 * Cancel an order
 */
router.post('/orders/:orderId/cancel',
  rateLimit,
  apiKeyAuth,
  requireScope('trade'),
  verifyHmac,
  asyncHandler(async (req: ApiKeyRequest, res: any) => {
    if (!req.apiUser) {
      return res.status(401).json({
        error: {
          code: 'USER_NOT_FOUND',
          message: 'Associated user not found',
        },
      });
    }
    
    // Get the order to verify ownership
    const orders = await storage.getUserOrders(req.apiUser.id);
    const order = orders.find(o => o.id === req.params.orderId);
    
    if (!order) {
      return res.status(404).json({
        error: {
          code: 'ORDER_NOT_FOUND',
          message: 'Order not found or does not belong to this user',
        },
      });
    }
    
    if (order.status !== 'pending' && order.status !== 'partial') {
      return res.status(400).json({
        error: {
          code: 'CANNOT_CANCEL_ORDER',
          message: 'Can only cancel pending or partially filled orders',
        },
      });
    }
    
    // Cancel the order
    const cancelledOrder = await storage.updateOrder(req.params.orderId, {
      status: 'cancelled',
      updatedAt: new Date(),
    });
    
    res.json({
      orderId: cancelledOrder.id,
      status: cancelledOrder.status,
      message: 'Order cancelled successfully',
    });
  })
);

// Global error handler for the public API
router.use((err: any, req: any, res: any, next: any) => {
  console.error('Public API error:', err);
  
  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An internal server error occurred',
    },
  });
});

export default router;