import { sql, relations } from "drizzle-orm";
import { pgTable, text, varchar, decimal, timestamp, boolean, integer, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const marketStatusEnum = pgEnum('market_status', ['active', 'resolved', 'disputed', 'cancelled']);
export const marketCategoryEnum = pgEnum('market_category', ['crypto', 'politics', 'sports', 'tech', 'entertainment']);
export const oracleTypeEnum = pgEnum('oracle_type', ['coingecko', 'sportradar', 'ap_elections', 'manual']);
export const orderTypeEnum = pgEnum('order_type', ['market', 'limit']);
export const orderSideEnum = pgEnum('order_side', ['buy', 'sell']);
export const orderStatusEnum = pgEnum('order_status', ['pending', 'partial', 'filled', 'cancelled', 'expired']);
export const outcomeEnum = pgEnum('outcome', ['yes', 'no']);
export const feeWithdrawalStatusEnum = pgEnum('fee_withdrawal_status', ['pending', 'completed', 'failed', 'cancelled']);

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  walletAddress: text("wallet_address").unique(),
  username: text("username").unique(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const markets = pgTable("markets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  question: text("question").notNull(),
  description: text("description"),
  category: marketCategoryEnum("category").notNull(),
  status: marketStatusEnum("status").default('active'),
  oracleType: oracleTypeEnum("oracle_type").default('manual'),
  oracleConfig: text("oracle_config"), // JSON config for oracle parameters
  endDate: timestamp("end_date").notNull(),
  resolutionSource: text("resolution_source"),
  yesPrice: decimal("yes_price", { precision: 10, scale: 8 }).default('0.50'),
  noPrice: decimal("no_price", { precision: 10, scale: 8 }).default('0.50'),
  volume: decimal("volume", { precision: 20, scale: 8 }).default('0'),
  liquidity: decimal("liquidity", { precision: 20, scale: 8 }).default('0'),
  tradingFee: decimal("trading_fee", { precision: 5, scale: 4 }).default('0.02'),
  createdAt: timestamp("created_at").defaultNow(),
  resolvedAt: timestamp("resolved_at"),
  resolvedOutcome: outcomeEnum("resolved_outcome"),
});

export const positions = pgTable("positions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  marketId: varchar("market_id").references(() => markets.id).notNull(),
  outcome: outcomeEnum("outcome").notNull(),
  shares: decimal("shares", { precision: 20, scale: 8 }).notNull(),
  avgPrice: decimal("avg_price", { precision: 10, scale: 8 }).notNull(),
  totalCost: decimal("total_cost", { precision: 20, scale: 8 }).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const orders = pgTable("orders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  marketId: varchar("market_id").references(() => markets.id).notNull(),
  type: orderTypeEnum("type").notNull(),
  side: orderSideEnum("side").notNull(),
  outcome: outcomeEnum("outcome").notNull(),
  amount: decimal("amount", { precision: 20, scale: 8 }).notNull(),
  limitPrice: decimal("limit_price", { precision: 10, scale: 8 }),
  maxSlippage: decimal("max_slippage", { precision: 5, scale: 4 }).default('0.05'),
  minPrice: decimal("min_price", { precision: 10, scale: 8 }),
  maxPrice: decimal("max_price", { precision: 10, scale: 8 }),
  shares: decimal("shares", { precision: 20, scale: 8 }).notNull(),
  filledShares: decimal("filled_shares", { precision: 20, scale: 8 }).default('0'),
  avgFillPrice: decimal("avg_fill_price", { precision: 10, scale: 8 }),
  status: orderStatusEnum("status").default('pending'),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const trades = pgTable("trades", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  buyOrderId: varchar("buy_order_id").references(() => orders.id),
  sellOrderId: varchar("sell_order_id").references(() => orders.id),
  marketId: varchar("market_id").references(() => markets.id).notNull(),
  buyerId: varchar("buyer_id").references(() => users.id),
  sellerId: varchar("seller_id").references(() => users.id),
  outcome: outcomeEnum("outcome").notNull(),
  shares: decimal("shares", { precision: 20, scale: 8 }).notNull(),
  price: decimal("price", { precision: 10, scale: 8 }).notNull(),
  amount: decimal("amount", { precision: 20, scale: 8 }).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const userBalances = pgTable("user_balances", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  balance: decimal("balance", { precision: 20, scale: 8 }).default('0'),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Table to track collected trading fees
export const collectedFees = pgTable("collected_fees", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  marketId: varchar("market_id").references(() => markets.id).notNull(),
  tradeId: varchar("trade_id").references(() => trades.id).notNull(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  feeAmount: decimal("fee_amount", { precision: 20, scale: 8 }).notNull(),
  feeRate: decimal("fee_rate", { precision: 5, scale: 4 }).notNull(),
  originalAmount: decimal("original_amount", { precision: 20, scale: 8 }).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Table to track admin fee withdrawals
export const feeWithdrawals = pgTable("fee_withdrawals", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  adminUserId: varchar("admin_user_id").references(() => users.id).notNull(),
  toAddress: text("to_address").notNull(), // GalaChain wallet address
  amount: decimal("amount", { precision: 20, scale: 8 }).notNull(),
  status: feeWithdrawalStatusEnum("status").default('pending'),
  txId: text("tx_id"), // Transaction ID from GalaChain
  failureReason: text("failure_reason"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  completedAt: timestamp("completed_at"),
});

// Relations
export const usersRelations = relations(users, ({ many, one }) => ({
  positions: many(positions),
  orders: many(orders),
  trades: many(trades),
  balance: one(userBalances),
}));

export const marketsRelations = relations(markets, ({ many }) => ({
  positions: many(positions),
  orders: many(orders),
  trades: many(trades),
}));

export const positionsRelations = relations(positions, ({ one }) => ({
  user: one(users, { fields: [positions.userId], references: [users.id] }),
  market: one(markets, { fields: [positions.marketId], references: [markets.id] }),
}));

export const ordersRelations = relations(orders, ({ one }) => ({
  user: one(users, { fields: [orders.userId], references: [users.id] }),
  market: one(markets, { fields: [orders.marketId], references: [markets.id] }),
}));

export const tradesRelations = relations(trades, ({ one }) => ({
  buyOrder: one(orders, { fields: [trades.buyOrderId], references: [orders.id] }),
  market: one(markets, { fields: [trades.marketId], references: [markets.id] }),
  buyer: one(users, { fields: [trades.buyerId], references: [users.id] }),
  seller: one(users, { fields: [trades.sellerId], references: [users.id] }),
}));

export const userBalancesRelations = relations(userBalances, ({ one }) => ({
  user: one(users, { fields: [userBalances.userId], references: [users.id] }),
}));

export const collectedFeesRelations = relations(collectedFees, ({ one }) => ({
  market: one(markets, { fields: [collectedFees.marketId], references: [markets.id] }),
  trade: one(trades, { fields: [collectedFees.tradeId], references: [trades.id] }),
  user: one(users, { fields: [collectedFees.userId], references: [users.id] }),
}));

export const feeWithdrawalsRelations = relations(feeWithdrawals, ({ one }) => ({
  adminUser: one(users, { fields: [feeWithdrawals.adminUserId], references: [users.id] }),
}));

// Schemas
export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
});

export const insertMarketSchema = createInsertSchema(markets).omit({
  id: true,
  createdAt: true,
  resolvedAt: true,
  resolvedOutcome: true,
  volume: true,
  yesPrice: true,
  noPrice: true,
}).extend({
  endDate: z.string().transform((val) => new Date(val)),
});

export const insertPositionSchema = createInsertSchema(positions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertOrderSchema = createInsertSchema(orders).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  status: true,
  filledShares: true,
  avgFillPrice: true,
}).extend({
  expiresAt: z.string().transform((val) => val ? new Date(val) : undefined).optional(),
});

// Secure schema for creating orders (excludes userId - will be derived from session)
export const createOrderSchema = insertOrderSchema.omit({
  userId: true,
});

export const insertTradeSchema = createInsertSchema(trades).omit({
  id: true,
  createdAt: true,
});

export const insertFeeWithdrawalSchema = createInsertSchema(feeWithdrawals).omit({
  id: true,
  status: true,
  txId: true,
  failureReason: true,
  createdAt: true,
  updatedAt: true,
  completedAt: true,
}).extend({
  amount: z.string().regex(/^\d+(\.\d{1,8})?$/, "Invalid amount format").refine(val => {
    const num = parseFloat(val);
    return num > 0 && num <= 10000; // Max 10,000 USDC per withdrawal
  }, "Amount must be between 0.01 and 10,000 USDC"),
  toAddress: z.string().min(10, "Invalid GalaChain address").max(200, "Address too long"),
});

// Types
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;

export type Market = typeof markets.$inferSelect;
export type InsertMarket = z.infer<typeof insertMarketSchema>;

export type Position = typeof positions.$inferSelect;
export type InsertPosition = z.infer<typeof insertPositionSchema>;

export type Order = typeof orders.$inferSelect;
export type InsertOrder = z.infer<typeof insertOrderSchema>;

export type Trade = typeof trades.$inferSelect;
export type InsertTrade = z.infer<typeof insertTradeSchema>;

export type UserBalance = typeof userBalances.$inferSelect;
export type CollectedFee = typeof collectedFees.$inferSelect;
export type FeeWithdrawal = typeof feeWithdrawals.$inferSelect;
export type InsertFeeWithdrawal = z.infer<typeof insertFeeWithdrawalSchema>;
