import { 
  users, markets, positions, orders, trades, userBalances, collectedFees, feeWithdrawals, apiKeys, apiKeyNonces, deposits,
  type User, type InsertUser,
  type Market, type InsertMarket,
  type Position, type InsertPosition,
  type Order, type InsertOrder,
  type Trade, type InsertTrade,
  type UserBalance,
  type CollectedFee,
  type FeeWithdrawal,
  type InsertFeeWithdrawal,
  type ApiKey,
  type InsertApiKey,
  type ApiKeyNonce,
  type Deposit,
  type InsertDeposit
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, sql } from "drizzle-orm";

export interface IStorage {
  // Users
  getUser(id: string): Promise<User | undefined>;
  getUserByWalletAddress(walletAddress: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  getAllUsers(): Promise<User[]>;
  getAllUsersWithBalances(): Promise<(User & { balance?: string })[]>;
  updateUser(userId: string, userData: Partial<User>): Promise<User>;
  
  // Markets
  getAllMarkets(): Promise<Market[]>;
  getMarket(id: string): Promise<Market | undefined>;
  createMarket(market: InsertMarket): Promise<Market>;
  updateMarket(id: string, updates: Partial<Market>): Promise<Market>;
  
  // Positions
  getUserPositions(userId: string): Promise<Position[]>;
  getPosition(userId: string, marketId: string, outcome: 'yes' | 'no'): Promise<Position | undefined>;
  createPosition(position: InsertPosition): Promise<Position>;
  updatePosition(id: string, updates: Partial<Position>): Promise<Position>;
  
  // Orders
  getMarketOrders(marketId: string): Promise<Order[]>;
  getUserOrders(userId: string): Promise<Order[]>;
  createOrder(order: InsertOrder): Promise<Order>;
  updateOrder(id: string, updates: Partial<Order>): Promise<Order>;
  
  // Trades
  getMarketTrades(marketId: string): Promise<Trade[]>;
  getUserTrades(userId: string): Promise<Trade[]>;
  createTrade(trade: InsertTrade): Promise<Trade>;
  
  // User Balances
  getUserBalance(userId: string): Promise<UserBalance | undefined>;
  updateUserBalance(userId: string, balance: string): Promise<UserBalance>;
  
  // Fee collection
  createCollectedFee(fee: { marketId: string, tradeId: string, userId: string, feeAmount: string, feeRate: string, originalAmount: string }): Promise<CollectedFee>;
  getTotalCollectedFees(): Promise<{ totalFees: string }>;
  
  // Fee withdrawals
  getFeeTotals(): Promise<{ totalCollected: string, totalWithdrawn: string, totalPending: string, available: string }>;
  listFeeWithdrawals(limit?: number): Promise<FeeWithdrawal[]>;
  createFeeWithdrawalPending(withdrawal: { adminUserId: string, toAddress: string, amount: string }): Promise<FeeWithdrawal>;
  markFeeWithdrawalCompleted(id: string, txId: string): Promise<FeeWithdrawal>;
  markFeeWithdrawalFailed(id: string, failureReason: string): Promise<FeeWithdrawal>;
  
  // Order history
  getMarketOrderHistory(marketId: string, limit?: number, offset?: number): Promise<{
    id: string;
    outcome: string;
    shares: string;
    price: string;
    amount: string;
    side: 'buy' | 'sell';
    username: string;
    createdAt: Date;
  }[]>;
  
  // Analytics
  getMarketStats(): Promise<{
    totalVolume: string;
    activeMarkets: number;
    totalTrades: number;
    totalUsers: number;
  }>;

  // API Keys
  createApiKey(apiKey: InsertApiKey & { signingSecret: string }): Promise<ApiKey>;
  getApiKey(id: string): Promise<ApiKey | undefined>;
  getApiKeyBySigningSecret(signingSecret: string): Promise<(ApiKey & { user: User }) | undefined>;
  getApiKeyWithUser(keyId: string): Promise<(ApiKey & { user: User }) | undefined>;
  getUserApiKeys(userId: string): Promise<ApiKey[]>;
  updateApiKey(id: string, updates: Partial<ApiKey>): Promise<ApiKey>;
  deleteApiKey(id: string): Promise<void>;
  updateApiKeyLastUsed(id: string): Promise<void>;

  // API Key Nonces (for replay attack prevention)
  checkAndStoreNonce(keyId: string, nonce: string): Promise<boolean>;
  cleanupExpiredNonces(): Promise<void>;

  // Deposit management
  createDeposit(depositData: InsertDeposit): Promise<Deposit>;
  getUserDeposits(userId: string): Promise<Deposit[]>;
  getDeposit(id: string): Promise<Deposit | undefined>;
  updateDeposit(id: string, updateData: Partial<Deposit>): Promise<Deposit>;
  getDepositByTransactionHash(txHash: string): Promise<Deposit | undefined>;
  getPendingDeposits(): Promise<Deposit[]>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByWalletAddress(walletAddress: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.walletAddress, walletAddress));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    
    // Create initial balance
    await db.insert(userBalances).values({
      userId: user.id,
      balance: '1000', // Give new users 1000 USDC to start
    });
    
    return user;
  }

  async getAllUsers(): Promise<User[]> {
    return await db.select().from(users).orderBy(desc(users.createdAt));
  }

  async getAllUsersWithBalances(): Promise<(User & { balance?: string })[]> {
    const allUsers = await db.select().from(users).orderBy(desc(users.createdAt));
    
    // Fetch balances for all users
    const usersWithBalances = await Promise.all(
      allUsers.map(async (user) => {
        const balance = await this.getUserBalance(user.id);
        return {
          ...user,
          balance: balance?.balance || '0'
        };
      })
    );
    
    return usersWithBalances;
  }

  async updateUser(userId: string, userData: Partial<User>): Promise<User> {
    const [user] = await db
      .update(users)
      .set(userData as any)
      .where(eq(users.id, userId))
      .returning();
    return user;
  }

  async getAllMarkets(): Promise<Market[]> {
    return await db.select().from(markets).orderBy(desc(markets.createdAt));
  }

  async getMarket(id: string): Promise<Market | undefined> {
    const [market] = await db.select().from(markets).where(eq(markets.id, id));
    return market || undefined;
  }

  async createMarket(insertMarket: InsertMarket): Promise<Market> {
    const [market] = await db.insert(markets).values({
      ...insertMarket,
      yesPrice: '0.50',
      noPrice: '0.50',
      volume: '0',
      liquidity: '1000', // Initial liquidity
    }).returning();
    return market;
  }

  async updateMarket(id: string, updates: Partial<Market>): Promise<Market> {
    const [market] = await db
      .update(markets)
      .set(updates as any)
      .where(eq(markets.id, id))
      .returning();
    return market;
  }

  async getUserPositions(userId: string): Promise<Position[]> {
    return await db.select().from(positions).where(eq(positions.userId, userId));
  }

  async getPosition(userId: string, marketId: string, outcome: 'yes' | 'no'): Promise<Position | undefined> {
    const [position] = await db
      .select()
      .from(positions)
      .where(
        and(
          eq(positions.userId, userId),
          eq(positions.marketId, marketId),
          eq(positions.outcome, outcome)
        )
      );
    return position || undefined;
  }

  async createPosition(insertPosition: InsertPosition): Promise<Position> {
    const [position] = await db.insert(positions).values(insertPosition).returning();
    return position;
  }

  async updatePosition(id: string, updates: Partial<Position>): Promise<Position> {
    const [position] = await db
      .update(positions)
      .set({ ...updates, updatedAt: new Date() } as any)
      .where(eq(positions.id, id))
      .returning();
    return position;
  }

  async getMarketOrders(marketId: string): Promise<Order[]> {
    return await db
      .select()
      .from(orders)
      .where(and(eq(orders.marketId, marketId), eq(orders.status, 'pending')))
      .orderBy(desc(orders.createdAt));
  }

  async getUserOrders(userId: string): Promise<Order[]> {
    return await db
      .select()
      .from(orders)
      .where(eq(orders.userId, userId))
      .orderBy(desc(orders.createdAt));
  }

  async createOrder(insertOrder: InsertOrder): Promise<Order> {
    const [order] = await db.insert(orders).values(insertOrder).returning();
    return order;
  }

  async updateOrder(id: string, updates: Partial<Order>): Promise<Order> {
    const [order] = await db
      .update(orders)
      .set(updates as any)
      .where(eq(orders.id, id))
      .returning();
    return order;
  }

  async getMarketTrades(marketId: string): Promise<Trade[]> {
    return await db
      .select()
      .from(trades)
      .where(eq(trades.marketId, marketId))
      .orderBy(desc(trades.createdAt));
  }

  async getUserTrades(userId: string): Promise<Trade[]> {
    return await db
      .select()
      .from(trades)
      .where(eq(trades.buyerId, userId))
      .orderBy(desc(trades.createdAt));
  }

  async createTrade(insertTrade: InsertTrade): Promise<Trade> {
    const [trade] = await db.insert(trades).values(insertTrade).returning();
    return trade;
  }

  async getUserBalance(userId: string): Promise<UserBalance | undefined> {
    const [balance] = await db.select().from(userBalances).where(eq(userBalances.userId, userId));
    return balance || undefined;
  }

  async updateUserBalance(userId: string, balance: string): Promise<UserBalance> {
    const [userBalance] = await db
      .update(userBalances)
      .set({ balance, updatedAt: new Date() })
      .where(eq(userBalances.userId, userId))
      .returning();
    return userBalance;
  }

  async createCollectedFee(fee: { marketId: string, tradeId: string, userId: string, feeAmount: string, feeRate: string, originalAmount: string }): Promise<CollectedFee> {
    const [collectedFee] = await db.insert(collectedFees).values({
      marketId: fee.marketId,
      tradeId: fee.tradeId,
      userId: fee.userId,
      feeAmount: fee.feeAmount,
      feeRate: fee.feeRate,
      originalAmount: fee.originalAmount,
    }).returning();
    return collectedFee;
  }

  async getTotalCollectedFees(): Promise<{ totalFees: string }> {
    const result = await db
      .select({
        totalFees: sql<string>`COALESCE(SUM(${collectedFees.feeAmount}), '0')`
      })
      .from(collectedFees);
    
    return result[0] || { totalFees: '0' };
  }

  async getFeeTotals(): Promise<{ totalCollected: string, totalWithdrawn: string, totalPending: string, available: string }> {
    // Get total collected fees
    const [collectedResult] = await db
      .select({
        totalCollected: sql<string>`COALESCE(SUM(${collectedFees.feeAmount}), '0')`
      })
      .from(collectedFees);

    // Get total withdrawn fees (completed)
    const [withdrawnResult] = await db
      .select({
        totalWithdrawn: sql<string>`COALESCE(SUM(${feeWithdrawals.amount}), '0')`
      })
      .from(feeWithdrawals)
      .where(eq(feeWithdrawals.status, 'completed'));

    // Get total pending fees
    const [pendingResult] = await db
      .select({
        totalPending: sql<string>`COALESCE(SUM(${feeWithdrawals.amount}), '0')`
      })
      .from(feeWithdrawals)
      .where(eq(feeWithdrawals.status, 'pending'));

    const totalCollected = parseFloat(collectedResult.totalCollected);
    const totalWithdrawn = parseFloat(withdrawnResult.totalWithdrawn);
    const totalPending = parseFloat(pendingResult.totalPending);
    const available = totalCollected - (totalWithdrawn + totalPending);

    return {
      totalCollected: totalCollected.toFixed(8),
      totalWithdrawn: totalWithdrawn.toFixed(8),
      totalPending: totalPending.toFixed(8),
      available: Math.max(0, available).toFixed(8)
    };
  }

  async listFeeWithdrawals(limit: number = 100): Promise<FeeWithdrawal[]> {
    return await db
      .select()
      .from(feeWithdrawals)
      .orderBy(desc(feeWithdrawals.createdAt))
      .limit(limit);
  }

  async createFeeWithdrawalPending(withdrawal: { adminUserId: string, toAddress: string, amount: string }): Promise<FeeWithdrawal> {
    return await db.transaction(async (tx) => {
      // Check available funds
      const totals = await this.getFeeTotals();
      const requestedAmount = parseFloat(withdrawal.amount);
      const availableAmount = parseFloat(totals.available);

      if (requestedAmount > availableAmount) {
        throw new Error(`Insufficient funds. Available: ${totals.available} USDC, Requested: ${withdrawal.amount} USDC`);
      }

      // Create withdrawal record
      const [feeWithdrawal] = await tx.insert(feeWithdrawals).values({
        adminUserId: withdrawal.adminUserId,
        toAddress: withdrawal.toAddress,
        amount: withdrawal.amount,
        status: 'pending'
      }).returning();

      return feeWithdrawal;
    });
  }

  async markFeeWithdrawalCompleted(id: string, txId: string): Promise<FeeWithdrawal> {
    const [withdrawal] = await db
      .update(feeWithdrawals)
      .set({
        status: 'completed',
        txId: txId,
        completedAt: new Date(),
        updatedAt: new Date()
      })
      .where(eq(feeWithdrawals.id, id))
      .returning();
    
    return withdrawal;
  }

  async markFeeWithdrawalFailed(id: string, failureReason: string): Promise<FeeWithdrawal> {
    const [withdrawal] = await db
      .update(feeWithdrawals)
      .set({
        status: 'failed',
        failureReason: failureReason,
        updatedAt: new Date()
      })
      .where(eq(feeWithdrawals.id, id))
      .returning();
    
    return withdrawal;
  }

  async getMarketOrderHistory(marketId: string, limit = 50, offset = 0): Promise<{
    id: string;
    outcome: string;
    shares: string;
    price: string;
    amount: string;
    side: 'buy' | 'sell';
    username: string;
    createdAt: Date;
  }[]> {
    // Use UNION to create proper order history entries for both buyers and sellers
    // Proper SQL with outer SELECT and column aliasing for correct pagination
    const query = sql`
      SELECT * FROM (
        (
          SELECT 
            ${trades.id}::text || '-buy' as id,
            ${trades.outcome} as outcome,
            ${trades.shares} as shares,
            ${trades.price} as price,
            ${trades.amount} as amount,
            'buy' as side,
            ${users.username} as username,
            ${trades.createdAt} as created_at
          FROM ${trades}
          LEFT JOIN ${users} ON ${trades.buyerId} = ${users.id}
          WHERE ${trades.marketId} = ${marketId} AND ${trades.buyerId} IS NOT NULL
        )
        UNION ALL
        (
          SELECT 
            ${trades.id}::text || '-sell' as id,
            ${trades.outcome} as outcome,
            ${trades.shares} as shares,
            ${trades.price} as price,
            ${trades.amount} as amount,
            'sell' as side,
            ${users.username} as username,
            ${trades.createdAt} as created_at
          FROM ${trades}
          LEFT JOIN ${users} ON ${trades.sellerId} = ${users.id}
          WHERE ${trades.marketId} = ${marketId} AND ${trades.sellerId} IS NOT NULL
        )
      ) t 
      ORDER BY t.created_at DESC
      LIMIT ${limit}
      OFFSET ${offset}
    `;

    const result = await db.execute(query);
    
    return result.rows.map((row: any) => ({
      id: row.id,
      outcome: row.outcome,
      shares: row.shares,
      price: row.price,
      amount: row.amount,
      side: row.side as 'buy' | 'sell',
      username: row.username || 'Unknown',
      createdAt: new Date(row.created_at)
    }));
  }

  async getMarketStats(): Promise<{
    totalVolume: string;
    activeMarkets: number;
    totalTrades: number;
    totalUsers: number;
  }> {
    const [volumeResult] = await db
      .select({ totalVolume: sql<string>`COALESCE(SUM(${markets.volume}), 0)` })
      .from(markets);
    
    const [activeMarketsResult] = await db
      .select({ activeMarkets: sql<number>`COUNT(*)` })
      .from(markets)
      .where(eq(markets.status, 'active'));
    
    const [totalTradesResult] = await db
      .select({ totalTrades: sql<number>`COUNT(*)` })
      .from(trades);
    
    const [totalUsersResult] = await db
      .select({ totalUsers: sql<number>`COUNT(*)` })
      .from(users);

    return {
      totalVolume: volumeResult.totalVolume,
      activeMarkets: activeMarketsResult.activeMarkets,
      totalTrades: totalTradesResult.totalTrades,
      totalUsers: totalUsersResult.totalUsers,
    };
  }

  // API Key methods implementation
  async createApiKey(apiKey: InsertApiKey & { signingSecret: string }): Promise<ApiKey> {
    const [newKey] = await db.insert(apiKeys).values({
      ...apiKey,
      updatedAt: new Date(),
    }).returning();
    return newKey;
  }

  async getApiKey(id: string): Promise<ApiKey | undefined> {
    const [apiKey] = await db.select().from(apiKeys).where(eq(apiKeys.id, id));
    return apiKey;
  }

  async getApiKeyBySigningSecret(signingSecret: string): Promise<(ApiKey & { user: User }) | undefined> {
    const [result] = await db
      .select()
      .from(apiKeys)
      .leftJoin(users, eq(apiKeys.userId, users.id))
      .where(and(eq(apiKeys.signingSecret, signingSecret), eq(apiKeys.status, 'active')));
    
    if (!result || !result.users) {
      return undefined;
    }

    return {
      ...result.api_keys,
      user: result.users,
    };
  }

  async getApiKeyWithUser(keyId: string): Promise<(ApiKey & { user: User }) | undefined> {
    const [result] = await db
      .select()
      .from(apiKeys)
      .leftJoin(users, eq(apiKeys.userId, users.id))
      .where(and(eq(apiKeys.id, keyId), eq(apiKeys.status, 'active')));
    
    if (!result || !result.users) {
      return undefined;
    }

    return {
      ...result.api_keys,
      user: result.users,
    };
  }

  async getUserApiKeys(userId: string): Promise<ApiKey[]> {
    return await db.select().from(apiKeys).where(eq(apiKeys.userId, userId)).orderBy(desc(apiKeys.createdAt));
  }

  async updateApiKey(id: string, updates: Partial<ApiKey>): Promise<ApiKey> {
    const [updatedKey] = await db.update(apiKeys).set({
      ...updates,
      updatedAt: new Date(),
    }).where(eq(apiKeys.id, id)).returning();
    return updatedKey;
  }

  async deleteApiKey(id: string): Promise<void> {
    await db.delete(apiKeys).where(eq(apiKeys.id, id));
  }

  async updateApiKeyLastUsed(id: string): Promise<void> {
    await db.update(apiKeys).set({
      lastUsedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(apiKeys.id, id));
  }

  async checkAndStoreNonce(keyId: string, nonce: string): Promise<boolean> {
    // Check if nonce already exists (replay protection)
    const [existing] = await db
      .select()
      .from(apiKeyNonces)
      .where(and(eq(apiKeyNonces.keyId, keyId), eq(apiKeyNonces.nonce, nonce)));

    if (existing) {
      return false; // Nonce already used (potential replay attack)
    }

    // Store the nonce
    await db.insert(apiKeyNonces).values({
      keyId,
      nonce,
    });

    return true;
  }

  async cleanupExpiredNonces(): Promise<void> {
    // Clean up nonces older than 1 hour (prevent table from growing indefinitely)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    await db.delete(apiKeyNonces).where(sql`${apiKeyNonces.createdAt} < ${oneHourAgo}`);
  }

  // Deposit management implementation
  async createDeposit(depositData: InsertDeposit): Promise<Deposit> {
    const [deposit] = await db.insert(deposits).values(depositData).returning();
    return deposit;
  }

  async getUserDeposits(userId: string): Promise<Deposit[]> {
    return await db
      .select()
      .from(deposits)
      .where(eq(deposits.userId, userId))
      .orderBy(desc(deposits.createdAt));
  }

  async getDeposit(id: string): Promise<Deposit | undefined> {
    const [deposit] = await db.select().from(deposits).where(eq(deposits.id, id));
    return deposit || undefined;
  }

  async updateDeposit(id: string, updateData: Partial<Deposit>): Promise<Deposit> {
    const [updatedDeposit] = await db
      .update(deposits)
      .set(updateData as any)
      .where(eq(deposits.id, id))
      .returning();
    return updatedDeposit;
  }

  async getDepositByTransactionHash(txHash: string): Promise<Deposit | undefined> {
    const [deposit] = await db
      .select()
      .from(deposits)
      .where(eq(deposits.transactionHash, txHash));
    return deposit || undefined;
  }

  async getPendingDeposits(): Promise<Deposit[]> {
    return await db
      .select()
      .from(deposits)
      .where(eq(deposits.status, 'pending'))
      .orderBy(deposits.createdAt);
  }
}

export const storage = new DatabaseStorage();
