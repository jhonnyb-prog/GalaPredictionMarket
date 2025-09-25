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
export const apiKeyStatusEnum = pgEnum('api_key_status', ['active', 'suspended', 'revoked']);
export const apiKeyScopeEnum = pgEnum('api_key_scope', ['read', 'trade', 'admin']);
export const depositStatusEnum = pgEnum('deposit_status', ['pending', 'confirmed', 'failed']);
export const tokenTypeEnum = pgEnum('token_type', ['USDC', 'USDT']);
export const userStatusEnum = pgEnum('user_status', ['active', 'banned', 'deleted']);
export const authTokenTypeEnum = pgEnum('auth_token_type', ['email_verification', 'password_reset', 'session']);

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  walletAddress: text("wallet_address").unique(),
  username: text("username").unique(),
  email: text("email").unique(),
  passwordHash: text("password_hash"),
  emailVerified: boolean("email_verified").default(false),
  isAdmin: boolean("is_admin").default(false),
  status: userStatusEnum("status").default('active'),
  lastLogin: timestamp("last_login"),
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

// Table for API keys used by bots and market makers
export const apiKeys = pgTable("api_keys", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  signingSecret: text("signing_secret").notNull(), // Actual secret for HMAC signatures (encrypted at rest in production)
  label: text("label").notNull(), // User-friendly name for the key
  scopes: text("scopes").array().notNull(), // Array of scopes like ['read', 'trade']
  status: apiKeyStatusEnum("status").default('active'),
  rateLimitTier: integer("rate_limit_tier").default(1), // Rate limit tier (1 = basic, higher = more requests)
  lastUsedAt: timestamp("last_used_at"),
  expiresAt: timestamp("expires_at"), // Optional expiration
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Table for API key nonce tracking (prevents replay attacks)
export const apiKeyNonces = pgTable("api_key_nonces", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  keyId: varchar("key_id").references(() => apiKeys.id).notNull(),
  nonce: text("nonce").notNull(), // Unique nonce/timestamp combination
  createdAt: timestamp("created_at").defaultNow(),
});

// Authentication and activity tracking tables
export const authTokens = pgTable("auth_tokens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  token: text("token").unique().notNull(),
  type: authTokenTypeEnum("type").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  used: boolean("used").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const activityLogs = pgTable("activity_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id),
  actorId: varchar("actor_id").references(() => users.id), // Admin who performed the action
  action: text("action").notNull(),
  details: text("details"), // JSON string with additional details
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Table for tracking cryptocurrency deposits from on-ramp wallet
export const deposits = pgTable("deposits", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  transactionHash: text("transaction_hash").unique().notNull(), // Ethereum transaction hash
  walletAddress: text("wallet_address").notNull(), // Recipient wallet (ONRAMP_WALLET_ETH)
  tokenContract: text("token_contract").notNull(), // ERC-20 token contract address
  fromAddress: text("from_address").notNull(), // Sender wallet address
  tokenType: tokenTypeEnum("token_type").notNull(), // USDC or USDT
  amount: decimal("amount", { precision: 20, scale: 8 }).notNull(), // Amount deposited
  status: depositStatusEnum("status").default('pending'),
  userMessage: text("user_message"), // Encoded userID from transaction data
  chainId: integer("chain_id").default(1).notNull(), // Ethereum mainnet = 1
  blockNumber: integer("block_number"), // Ethereum block number for confirmation tracking
  confirmations: integer("confirmations").default(0).notNull(), // Number of block confirmations
  failureReason: text("failure_reason"), // Reason if deposit failed
  createdAt: timestamp("created_at").defaultNow(),
  confirmedAt: timestamp("confirmed_at"), // When blockchain confirmed the transaction
  creditedAt: timestamp("credited_at"), // When funds were credited to user balance (idempotency)
}, (table) => ({
  userIdIndex: sql`CREATE INDEX IF NOT EXISTS deposits_user_id_idx ON ${table} (${table.userId})`,
  statusIndex: sql`CREATE INDEX IF NOT EXISTS deposits_status_idx ON ${table} (${table.status})`,
  tokenWalletIndex: sql`CREATE INDEX IF NOT EXISTS deposits_token_wallet_idx ON ${table} (${table.tokenContract}, ${table.walletAddress})`,
}));

// Relations
export const usersRelations = relations(users, ({ many, one }) => ({
  positions: many(positions),
  orders: many(orders),
  trades: many(trades),
  balance: one(userBalances),
  deposits: many(deposits),
  authTokens: many(authTokens),
  activityLogs: many(activityLogs, { relationName: 'userActivities' }),
  adminActions: many(activityLogs, { relationName: 'adminActions' }),
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

export const apiKeysRelations = relations(apiKeys, ({ one, many }) => ({
  user: one(users, { fields: [apiKeys.userId], references: [users.id] }),
  nonces: many(apiKeyNonces),
}));

export const apiKeyNoncesRelations = relations(apiKeyNonces, ({ one }) => ({
  apiKey: one(apiKeys, { fields: [apiKeyNonces.keyId], references: [apiKeys.id] }),
}));

export const depositsRelations = relations(deposits, ({ one }) => ({
  user: one(users, { fields: [deposits.userId], references: [users.id] }),
}));

export const authTokensRelations = relations(authTokens, ({ one }) => ({
  user: one(users, { fields: [authTokens.userId], references: [users.id] }),
}));

export const activityLogsRelations = relations(activityLogs, ({ one }) => ({
  user: one(users, { fields: [activityLogs.userId], references: [users.id] }),
  actor: one(users, { fields: [activityLogs.actorId], references: [users.id] }),
}));

// Schemas
export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  lastLogin: true,
}).extend({
  username: z.string().min(3, "Username must be at least 3 characters").max(20, "Username too long").regex(/^[a-zA-Z0-9_]+$/, "Username can only contain letters, numbers, and underscores").optional(),
  email: z.string().email("Invalid email format").optional(),
  passwordHash: z.string().optional(),
});

// Email authentication schemas
export const insertAuthTokenSchema = createInsertSchema(authTokens).omit({
  id: true,
  createdAt: true,
});

export const insertActivityLogSchema = createInsertSchema(activityLogs).omit({
  id: true,
  createdAt: true,
});

// User registration schema for email auth
export const userRegistrationSchema = z.object({
  email: z.string().email("Invalid email format"),
  password: z.string().min(8, "Password must be at least 8 characters")
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, "Password must contain at least one lowercase letter, one uppercase letter, and one number"),
  username: z.string().min(3, "Username must be at least 3 characters").max(20, "Username too long").regex(/^[a-zA-Z0-9_]+$/, "Username can only contain letters, numbers, and underscores").optional(),
});

// User login schema
export const userLoginSchema = z.object({
  email: z.string().email("Invalid email format"),
  password: z.string().min(1, "Password is required"),
});

// Password reset schemas
export const passwordResetRequestSchema = z.object({
  email: z.string().email("Invalid email format"),
});

export const passwordResetConfirmSchema = z.object({
  token: z.string().min(1, "Token is required"),
  password: z.string().min(8, "Password must be at least 8 characters")
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, "Password must contain at least one lowercase letter, one uppercase letter, and one number"),
});

// Admin user management schemas  
export const adminUserActionSchema = z.object({
  userId: z.string().uuid("Invalid user ID"),
  reason: z.string().optional(),
  expiresAt: z.string().transform((val) => val ? new Date(val) : null).optional(),
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

export const insertApiKeySchema = createInsertSchema(apiKeys).omit({
  id: true,
  signingSecret: true, // Server-generated only, never from client
  lastUsedAt: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  scopes: z.array(z.enum(['read', 'trade', 'admin'])).min(1, "At least one scope is required"),
  label: z.string().min(1, "Label is required").max(100, "Label too long"),
  expiresAt: z.string().transform((val) => val ? new Date(val) : null).optional(),
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

export type ApiKey = typeof apiKeys.$inferSelect;
export type InsertApiKey = z.infer<typeof insertApiKeySchema>;
export type ApiKeyNonce = typeof apiKeyNonces.$inferSelect;

export type Deposit = typeof deposits.$inferSelect;

export const insertDepositSchema = createInsertSchema(deposits).omit({
  id: true,
  status: true,
  confirmations: true,
  confirmedAt: true,
  creditedAt: true,
  createdAt: true,
}).extend({
  amount: z.string().regex(/^\d+(\.\d{1,8})?$/, "Invalid amount format").refine(val => {
    const num = parseFloat(val);
    return num >= 1; // Minimum 1 USDC/USDT as requested
  }, "Amount must be at least 1 USDC or 1 USDT"),
});

export type InsertDeposit = z.infer<typeof insertDepositSchema>;
export type InsertApiKeyNonce = typeof apiKeyNonces.$inferInsert;

// Authentication types
export type AuthToken = typeof authTokens.$inferSelect;
export type InsertAuthToken = z.infer<typeof insertAuthTokenSchema>;

export type ActivityLog = typeof activityLogs.$inferSelect;  
export type InsertActivityLog = z.infer<typeof insertActivityLogSchema>;

export type UserRegistration = z.infer<typeof userRegistrationSchema>;
export type UserLogin = z.infer<typeof userLoginSchema>;
export type PasswordResetRequest = z.infer<typeof passwordResetRequestSchema>;
export type PasswordResetConfirm = z.infer<typeof passwordResetConfirmSchema>;
export type AdminUserAction = z.infer<typeof adminUserActionSchema>;

// Deposit configuration types for secure server-client communication
export interface DepositConfig {
  recipientAddress: string;
  allowedTokens: Record<string, { address: string; decimals: number }>;
  chainId: number;
  minAmount: number;
}
