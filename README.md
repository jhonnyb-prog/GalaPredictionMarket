# Gala 8Ball - Prediction Market Platform

A modern, full-stack prediction market platform built on TypeScript with real cryptocurrency integration. Users can create, trade, and resolve prediction markets on various topics including cryptocurrency, politics, sports, technology, and entertainment.

## 🌟 Key Features

- **Real Wallet Integration**: MetaMask and Phantom wallet connections for USDC/USDT deposits
- **Automated Market Maker (AMM)**: Custom price discovery and liquidity provision system
- **Complete Trading Engine**: Market orders, limit orders, position tracking, and settlement
- **Admin Dashboard**: Full market lifecycle management with one-click resolution
- **Professional UI**: Polymarket-inspired design with dark/light theme support
- **Public API**: RESTful API with rate limiting and HMAC authentication
- **Real-time Updates**: Live market data and trade execution
- **Multi-category Markets**: Crypto, politics, sports, tech, and entertainment predictions

## 🏗️ Architecture Overview

### System Architecture

The application follows a modern full-stack architecture with clear separation of concerns:

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   React Client  │────│  Express.js API  │────│   PostgreSQL    │
│                 │    │                  │    │    Database     │
│ - TanStack Query│    │ - REST API       │    │                 │
│ - shadcn/ui     │    │ - Session Auth   │    │ - Drizzle ORM   │
│ - Wallet Connect│    │ - Rate Limiting  │    │ - Type Safety   │
└─────────────────┘    └──────────────────┘    └─────────────────┘
         │                        │                        │
         │                        │                        │
         ▼                        ▼                        ▼
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│ Ethereum Wallets│    │ Background Jobs  │    │ Fee Collection  │
│                 │    │                  │    │                 │
│ - MetaMask      │    │ - Market         │    │ - Trading Fees  │
│ - Phantom       │    │   Resolution     │    │ - Admin         │
│ - USDC/USDT     │    │ - Settlement     │    │   Withdrawals   │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

### Technology Stack

#### Backend
- **Express.js** - Web application framework
- **TypeScript** - Type-safe development
- **PostgreSQL** - Primary database with ACID transactions
- **Drizzle ORM** - Type-safe database operations and migrations
- **Neon Database** - Serverless PostgreSQL hosting
- **Express Session** - Session-based authentication
- **Rate Limiting** - API protection and abuse prevention
- **CORS** - Cross-origin resource sharing configuration

#### Frontend
- **React 18** - Modern UI library with concurrent features
- **TypeScript** - Type safety across the entire frontend
- **Vite** - Fast development server and build tool
- **TailwindCSS** - Utility-first CSS framework
- **shadcn/ui** - High-quality component library built on Radix UI
- **TanStack Query** - Server state management and caching
- **wouter** - Lightweight client-side routing
- **Chart.js** - Market price charts and data visualization

#### Blockchain Integration
- **ethers.js v6** - Ethereum interaction library
- **MetaMask & Phantom** - Wallet connection providers
- **USDC/USDT** - Stablecoin support on Ethereum mainnet
- **Real transactions** - Live blockchain deposits and settlements

#### Development & Deployment
- **Vite** - Development server with HMR
- **ESBuild** - Fast TypeScript compilation
- **Drizzle Kit** - Database migrations and schema management
- **Replit** - Cloud development and hosting platform

## 📊 Database Design

### Core Tables

The database uses PostgreSQL with a comprehensive schema designed for prediction markets:

#### Users Table
```sql
users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address TEXT UNIQUE,           -- Ethereum wallet address
  username TEXT UNIQUE,                 -- Optional display name
  email TEXT UNIQUE,                    -- For email authentication
  password_hash TEXT,                   -- Bcrypt hashed password
  email_verified BOOLEAN DEFAULT false,
  status user_status DEFAULT 'active', -- active, banned, deleted
  last_login TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
)
```

#### Markets Table
```sql
markets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question TEXT NOT NULL,               -- Market question
  description TEXT,                     -- Detailed description
  category market_category NOT NULL,    -- crypto, politics, sports, tech, entertainment
  status market_status DEFAULT 'active', -- active, resolved, disputed, cancelled
  oracle_type oracle_type DEFAULT 'manual', -- coingecko, sportradar, ap_elections, manual
  oracle_config TEXT,                   -- JSON config for oracle parameters
  end_date TIMESTAMP NOT NULL,          -- Market expiration
  resolution_source TEXT,               -- Data source for resolution
  yes_price DECIMAL(10,8) DEFAULT '0.50', -- Current YES price
  no_price DECIMAL(10,8) DEFAULT '0.50',  -- Current NO price
  volume DECIMAL(20,8) DEFAULT '0',     -- Total trading volume
  liquidity DECIMAL(20,8) DEFAULT '0',  -- Available liquidity
  trading_fee DECIMAL(5,4) DEFAULT '0.02', -- 2% trading fee
  created_at TIMESTAMP DEFAULT NOW(),
  resolved_at TIMESTAMP,
  resolved_outcome outcome              -- yes, no (after resolution)
)
```

#### Positions Table
```sql
positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  market_id UUID NOT NULL REFERENCES markets(id),
  outcome outcome NOT NULL,             -- yes, no
  shares DECIMAL(20,8) NOT NULL,        -- Number of shares owned
  avg_price DECIMAL(10,8) NOT NULL,     -- Average purchase price
  total_cost DECIMAL(20,8) NOT NULL,    -- Total amount invested
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
)
```

#### Orders Table
```sql
orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  market_id UUID NOT NULL REFERENCES markets(id),
  type order_type NOT NULL,             -- market, limit
  side order_side NOT NULL,             -- buy, sell
  outcome outcome NOT NULL,             -- yes, no
  amount DECIMAL(20,8) NOT NULL,        -- USD amount
  limit_price DECIMAL(10,8),            -- For limit orders
  max_slippage DECIMAL(5,4) DEFAULT '0.05', -- 5% max slippage
  shares DECIMAL(20,8) NOT NULL,        -- Shares to buy/sell
  filled_shares DECIMAL(20,8) DEFAULT '0', -- Shares filled
  avg_fill_price DECIMAL(10,8),        -- Average fill price
  status order_status DEFAULT 'pending', -- pending, partial, filled, cancelled, expired
  expires_at TIMESTAMP,                 -- Order expiration
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
)
```

#### Trades Table
```sql
trades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  buy_order_id UUID REFERENCES orders(id),
  sell_order_id UUID REFERENCES orders(id),
  market_id UUID NOT NULL REFERENCES markets(id),
  buyer_id UUID REFERENCES users(id),
  seller_id UUID REFERENCES users(id),
  outcome outcome NOT NULL,             -- yes, no
  shares DECIMAL(20,8) NOT NULL,        -- Shares traded
  price DECIMAL(10,8) NOT NULL,         -- Trade price
  amount DECIMAL(20,8) NOT NULL,        -- Total trade value
  created_at TIMESTAMP DEFAULT NOW()
)
```

#### User Balances Table
```sql
user_balances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  balance DECIMAL(20,8) DEFAULT '0',    -- USDC balance
  updated_at TIMESTAMP DEFAULT NOW()
)
```

#### Deposits Table
```sql
deposits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  transaction_hash TEXT UNIQUE NOT NULL, -- Ethereum transaction hash
  wallet_address TEXT NOT NULL,         -- Recipient wallet address
  token_contract TEXT NOT NULL,         -- ERC-20 token contract address
  from_address TEXT NOT NULL,           -- Sender wallet address
  token_type token_type NOT NULL,       -- USDC, USDT
  amount DECIMAL(20,8) NOT NULL,        -- Amount deposited
  status deposit_status DEFAULT 'pending', -- pending, confirmed, failed
  chain_id INTEGER DEFAULT 1 NOT NULL, -- Ethereum mainnet = 1
  block_number INTEGER,                 -- Ethereum block number
  confirmations INTEGER DEFAULT 0,     -- Block confirmations
  failure_reason TEXT,                  -- Error message if failed
  created_at TIMESTAMP DEFAULT NOW(),
  confirmed_at TIMESTAMP,              -- Blockchain confirmation time
  credited_at TIMESTAMP                -- User balance credit time
)
```

### Database Relationships

```mermaid
erDiagram
    USERS ||--o{ POSITIONS : owns
    USERS ||--o{ ORDERS : places
    USERS ||--o{ TRADES : executes
    USERS ||--o{ USER_BALANCES : has
    USERS ||--o{ DEPOSITS : makes
    MARKETS ||--o{ POSITIONS : contains
    MARKETS ||--o{ ORDERS : contains
    MARKETS ||--o{ TRADES : contains
    ORDERS ||--o{ TRADES : generates
    MARKETS ||--o{ COLLECTED_FEES : generates
    TRADES ||--|| COLLECTED_FEES : creates
```

### Indexes and Performance

Key database indexes for optimal performance:

```sql
-- User lookups
CREATE INDEX idx_users_wallet_address ON users(wallet_address);
CREATE INDEX idx_users_email ON users(email);

-- Market queries
CREATE INDEX idx_markets_status ON markets(status);
CREATE INDEX idx_markets_category ON markets(category);
CREATE INDEX idx_markets_end_date ON markets(end_date);

-- Trading lookups
CREATE INDEX idx_positions_user_market ON positions(user_id, market_id);
CREATE INDEX idx_orders_market_status ON orders(market_id, status);
CREATE INDEX idx_trades_market_time ON trades(market_id, created_at);

-- Deposit tracking
CREATE INDEX idx_deposits_user_status ON deposits(user_id, status);
CREATE INDEX idx_deposits_tx_hash ON deposits(transaction_hash);
```

## 🔐 Database Connection & Setup

### Environment Variables

The application requires the following environment variables:

```bash
# Database Connection
DATABASE_URL=postgresql://username:password@host:port/database

# Session Security
SESSION_SECRET=your-secure-session-secret-here

# Cryptocurrency Integration
ONRAMP_WALLET_ETH=0x... # Ethereum wallet for receiving deposits

# Email Service (Optional)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password

# Application Settings
NODE_ENV=development
PORT=5000
```

### Database Connection Configuration

The database connection is configured in `server/db.ts`:

```typescript
import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from "ws";
import * as schema from "@shared/schema";

// Configure WebSocket for Neon serverless
neonConfig.webSocketConstructor = ws;

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set. Did you forget to provision a database?");
}

// Create connection pool
export const pool = new Pool({ 
  connectionString: process.env.DATABASE_URL 
});

// Initialize Drizzle ORM with schema
export const db = drizzle({ 
  client: pool, 
  schema 
});
```

### Database Migrations

The project uses Drizzle Kit for schema management:

```bash
# Push schema changes to database (development)
npm run db:push

# Force push schema changes (when migrations conflict)
npm run db:push --force

# Generate migration files (production)
npx drizzle-kit generate

# Apply migrations (production)
npx drizzle-kit migrate
```

### Storage Interface

All database operations go through the `IStorage` interface defined in `server/storage.ts`:

```typescript
export interface IStorage {
  // User management
  getUser(id: string): Promise<User | undefined>;
  getUserByWalletAddress(walletAddress: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  // Market operations
  getAllMarkets(): Promise<Market[]>;
  createMarket(market: InsertMarket): Promise<Market>;
  updateMarket(id: string, updates: Partial<Market>): Promise<Market>;
  
  // Trading operations
  createOrder(order: InsertOrder): Promise<Order>;
  createTrade(trade: InsertTrade): Promise<Trade>;
  getUserPositions(userId: string): Promise<Position[]>;
  
  // Balance management
  getUserBalance(userId: string): Promise<UserBalance | undefined>;
  updateUserBalance(userId: string, balance: string): Promise<UserBalance>;
  
  // Deposit tracking
  createDeposit(depositData: InsertDeposit): Promise<Deposit>;
  getDepositByTransactionHash(txHash: string): Promise<Deposit | undefined>;
  
  // Analytics
  getMarketStats(): Promise<{
    totalVolume: string;
    activeMarkets: number;
    totalTrades: number;
    totalUsers: number;
  }>;
}
```

## 🚀 Development Setup

### Prerequisites

- Node.js 18+ and npm
- PostgreSQL database (or Neon account)
- MetaMask or Phantom wallet for testing

### Local Development

1. **Clone and Install Dependencies**
   ```bash
   git clone <repository-url>
   cd gala-8ball
   npm install
   ```

2. **Environment Setup**
   ```bash
   # Copy environment template
   cp .env.example .env
   
   # Edit .env with your database credentials
   DATABASE_URL=postgresql://username:password@localhost:5432/prediction_markets
   SESSION_SECRET=your-secure-random-secret
   ```

3. **Database Setup**
   ```bash
   # Create database tables
   npm run db:push
   
   # Verify schema was created correctly
   npx drizzle-kit studio
   ```

4. **Start Development Server**
   ```bash
   npm run dev
   ```
   
   The application will start on `http://localhost:5000`

### Production Deployment

1. **Build Application**
   ```bash
   npm run build
   ```

2. **Start Production Server**
   ```bash
   NODE_ENV=production npm start
   ```

### Database Connection Options

#### Option 1: Neon Database (Recommended)
- Serverless PostgreSQL with automatic scaling
- Zero-downtime deployments
- Built-in connection pooling

```bash
DATABASE_URL=postgresql://user:pass@ep-xxx.us-east-1.aws.neon.tech/dbname?sslmode=require
```

#### Option 2: Traditional PostgreSQL
- Self-hosted or cloud PostgreSQL instance
- Requires manual connection pooling setup

```bash
DATABASE_URL=postgresql://user:pass@localhost:5432/prediction_markets
```

#### Option 3: Docker PostgreSQL (Development)
```bash
docker run --name postgres-dev \
  -e POSTGRES_PASSWORD=password \
  -e POSTGRES_DB=prediction_markets \
  -p 5432:5432 \
  -d postgres:15
```

## 📡 API Reference

### Authentication

The API uses session-based authentication. Users authenticate via:

1. **Wallet Connection** - Connect MetaMask/Phantom wallet
2. **Email Authentication** - Traditional email/password (optional)

#### Wallet Authentication
```typescript
POST /api/auth/wallet-connect
{
  "walletAddress": "0x742d35Cc6e4C0532d98dC687fAB82a09fB0F3e12"
}
```

#### Session Management
```typescript
GET /api/auth/me          // Get current user
POST /api/auth/logout     // End session
```

### Markets API

#### Get All Markets
```typescript
GET /api/markets
Response: Market[]

interface Market {
  id: string;
  question: string;
  description: string;
  category: 'crypto' | 'politics' | 'sports' | 'tech' | 'entertainment';
  status: 'active' | 'resolved' | 'disputed' | 'cancelled';
  endDate: string;
  yesPrice: string;
  noPrice: string;
  volume: string;
  liquidity: string;
}
```

#### Create Market (Admin)
```typescript
POST /api/markets
{
  "question": "Will Bitcoin reach $100,000 by end of 2024?",
  "description": "Resolves YES if BTC trades at $100k+ on any major exchange",
  "category": "crypto",
  "endDate": "2024-12-31T23:59:59Z",
  "oracleType": "manual",
  "resolutionSource": "CoinGecko, Binance, Coinbase"
}
```

#### Resolve Market (Admin)
```typescript
POST /api/markets/:id/resolve
{
  "outcome": "yes" | "no",
  "resolutionSource": "Data source used for resolution"
}
```

### Trading API

#### Create Order
```typescript
POST /api/orders
{
  "marketId": "uuid",
  "type": "market" | "limit",
  "side": "buy" | "sell",
  "outcome": "yes" | "no",
  "amount": "100.00",        // USD amount
  "limitPrice": "0.65",      // For limit orders
  "maxSlippage": "0.05"      // 5% max slippage
}
```

#### Get User Positions
```typescript
GET /api/users/:userId/positions
Response: Position[]

interface Position {
  id: string;
  marketId: string;
  outcome: 'yes' | 'no';
  shares: string;
  avgPrice: string;
  totalCost: string;
  currentValue: string;      // Calculated field
  unrealizedPnL: string;     // Calculated field
}
```

#### Get Market Trades
```typescript
GET /api/markets/:id/trades
Response: Trade[]

interface Trade {
  id: string;
  outcome: 'yes' | 'no';
  shares: string;
  price: string;
  amount: string;
  side: 'buy' | 'sell';
  username: string;
  createdAt: string;
}
```

### Deposit API

#### Get Deposit Configuration
```typescript
GET /api/deposits/config
Response: DepositConfig

interface DepositConfig {
  recipientAddress: string;  // Wallet to receive deposits
  allowedTokens: {
    USDC: { address: string; decimals: number };
    USDT: { address: string; decimals: number };
  };
  chainId: number;           // 1 = Ethereum mainnet
  minAmount: number;         // Minimum deposit amount
}
```

#### Submit Pending Deposit
```typescript
POST /api/deposits/pending
{
  "transactionHash": "0x...",
  "tokenType": "USDC" | "USDT",
  "amount": "100.00",
  "chainId": 1
}
```

### Public API (Rate Limited)

Public API endpoints require API key authentication:

```bash
# Get API key first
POST /api/api-keys
{
  "label": "Trading Bot",
  "scopes": ["read", "trade"],
  "expiresAt": "2025-12-31T23:59:59Z"
}

# Use in requests
curl -H "X-API-Key: your-api-key" \
     -H "X-Signature: hmac-signature" \
     -H "X-Timestamp: unix-timestamp" \
     -H "X-Nonce: unique-nonce" \
     https://api.your-domain.com/v1/markets
```

## 🎨 Frontend Architecture

### Component Structure

```
client/src/
├── components/
│   ├── ui/                 # shadcn/ui base components
│   │   ├── button.tsx
│   │   ├── dialog.tsx
│   │   ├── form.tsx
│   │   └── ...
│   ├── market-card.tsx     # Market display component
│   ├── navigation.tsx      # Main navigation with wallet
│   ├── trading-interface.tsx # Order placement UI
│   └── wallet-connection.tsx # Wallet integration
├── pages/
│   ├── home.tsx           # Market dashboard
│   ├── market.tsx         # Individual market page
│   ├── portfolio.tsx      # User positions and trades
│   └── admin.tsx          # Admin dashboard
├── hooks/
│   ├── use-toast.tsx      # Toast notifications
│   └── use-user.tsx       # User context hook
├── lib/
│   ├── queryClient.ts     # TanStack Query setup
│   ├── galachain.ts       # Wallet integration
│   └── utils.ts           # Utility functions
├── contexts/
│   ├── UserContext.tsx    # User authentication state
│   └── RoleContext.tsx    # Admin role management
└── types/
    └── index.ts           # Frontend type definitions
```

### State Management

The application uses TanStack Query for server state and React Context for client state:

```typescript
// Server state (TanStack Query)
const { data: markets } = useQuery({
  queryKey: ['/api/markets'],
  // Auto-fetched via default query function
});

const createOrderMutation = useMutation({
  mutationFn: (orderData) => apiRequest('POST', '/api/orders', orderData),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['/api/orders'] });
    toast({ title: "Order placed successfully!" });
  }
});

// Client state (React Context)
const { user, isLoading } = useUser();
const { role, setRole } = useRole(); // 'user' | 'admin'
```

### Wallet Integration

Real cryptocurrency wallet connections:

```typescript
// MetaMask/Phantom connection
import { ethereumWalletProvider } from '@/lib/galachain';

const connectWallet = async () => {
  const walletInfo = await ethereumWalletProvider.connect();
  // walletInfo: { address, walletType, balance, isConnected }
};

// Send USDC/USDT payment
const sendPayment = async () => {
  const txHash = await ethereumWalletProvider.sendPayment({
    token: 'USDC',
    amount: '100.00',
    recipientAddress: config.recipientAddress,
    customerID: user.id // Automatically included for attribution
  });
};
```

## 🔒 Security Considerations

### Session Security
- CSRF protection with `sameSite: 'strict'`
- HTTP-only cookies prevent XSS attacks
- Secure session secrets in production

### Rate Limiting
- Authentication endpoints: 5 attempts per 15 minutes
- API endpoints: Configurable per user tier
- Public API: HMAC signature verification

### Database Security
- Parameterized queries prevent SQL injection
- UUID primary keys prevent enumeration
- User authorization on all protected endpoints

### Wallet Security
- Server-controlled deposit addresses
- Transaction attribution via wallet address matching
- No client-side private key handling

## 📈 Automated Market Maker (AMM)

The platform implements a custom AMM for price discovery:

### Price Calculation
```typescript
// Constant Product Market Maker (CPMM)
// For YES/NO shares: P_yes + P_no = 1
// Price discovery based on liquidity and demand

const calculatePrice = (yesShares: number, noShares: number, liquidity: number) => {
  const totalShares = yesShares + noShares;
  const yesPrice = (yesShares + liquidity/2) / (totalShares + liquidity);
  const noPrice = 1 - yesPrice;
  
  return { yesPrice, noPrice };
};
```

### Order Execution
1. Market orders execute immediately at current prices
2. Limit orders wait for favorable price movements
3. Slippage protection prevents unexpected execution prices
4. Partial fills supported for large orders

### Settlement Process
1. Market resolution triggers automatic settlement
2. Winning positions receive $1.00 per share
3. Losing positions receive $0.00 per share
4. Funds immediately credited to user balances

## 🛠️ Admin Features

### Market Management
- Create new prediction markets
- Set resolution sources and end dates
- Resolve markets with outcome verification
- Dispute handling for controversial outcomes

### User Management
- View all users and balances
- Suspend or ban problematic users
- Monitor trading activity and patterns
- Fee collection and withdrawal

### Analytics Dashboard
- Total platform volume and users
- Market performance metrics
- Trading fee collection tracking
- System health monitoring

## 🚢 Deployment

### Environment Configuration

**Production Environment Variables:**
```bash
NODE_ENV=production
DATABASE_URL=postgresql://... # Production database
SESSION_SECRET=crypto-secure-secret
ONRAMP_WALLET_ETH=0x... # Production wallet
PORT=5000
```

### Build Process
```bash
# Frontend build (Vite)
vite build
# Output: dist/public/

# Backend build (ESBuild)
esbuild server/index.ts --platform=node --packages=external --bundle --format=esm --outdir=dist
# Output: dist/index.js
```

### Health Checks
```bash
# Application health
GET /api/stats

# Database connectivity
GET /api/markets # Should return without errors

# Public API status
GET /v1/ping
```

### Monitoring

Key metrics to monitor in production:

- **Database Performance**: Query response times, connection pool usage
- **API Response Times**: 95th percentile latency for critical endpoints
- **Error Rates**: 4xx/5xx response rates by endpoint
- **Trading Volume**: Daily/weekly volume trends
- **User Activity**: Active traders, new signups, retention
- **Wallet Connections**: Successful vs failed wallet connections
- **Deposit Processing**: Blockchain confirmation times, failed deposits

## 🤝 Contributing

### Development Guidelines

1. **Type Safety**: All new code must use TypeScript with strict types
2. **Database Changes**: Use Drizzle schema migrations, never manual SQL
3. **API Design**: Follow RESTful conventions and include proper error handling
4. **Testing**: Test wallet integrations on testnet before mainnet
5. **Security**: Never expose private keys or secrets in client code

### Code Style

- Use ESLint and Prettier for consistent formatting
- Follow React Hook best practices
- Use semantic component and variable names
- Document complex business logic with comments

### Pull Request Process

1. Create feature branch from `main`
2. Implement changes with proper TypeScript types
3. Test wallet integration functionality
4. Update documentation for API changes
5. Submit PR with clear description and testing notes

## 📄 License

MIT License - see LICENSE file for details.

## 🆘 Support

For technical support or questions:

1. Check this documentation first
2. Review the codebase for implementation examples
3. Test on development environment before production changes
4. Ensure database migrations are properly tested

---

**Built with ❤️ for the prediction market community**