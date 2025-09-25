# Gala 8Ball Prediction Market - Architecture Documentation

## Overview

Gala 8Ball is a gaming-themed binary prediction market platform built on modern web technologies with GalaChain blockchain integration. The platform enables users to create, trade, and resolve prediction markets across multiple categories with automated oracle support and an integrated automated market maker (AMM) system.

## System Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Frontend (React)                        │
├─────────────────────────────────────────────────────────────────┤
│  • React 18 + TypeScript                                       │
│  • Vite for build tooling                                      │
│  • TailwindCSS + shadcn/ui components                          │
│  • TanStack Query for state management                         │
│  • wouter for routing                                          │
│  • Gaming-themed UI with neon effects                          │
└─────────────────────────────────────────────────────────────────┘
                                    │
                                    │ HTTP/WebSocket
                                    │
┌─────────────────────────────────────────────────────────────────┐
│                      Backend (Express.js)                      │
├─────────────────────────────────────────────────────────────────┤
│  • Express.js + TypeScript                                      │
│  • Session-based authentication                                │
│  • RESTful API + Public API for bots                           │
│  • Rate limiting & security middleware                         │
│  • Oracle integration (CoinGecko, Sportradar, AP Elections)   │
│  • AMM trading engine                                          │
└─────────────────────────────────────────────────────────────────┘
                                    │
                                    │ SQL
                                    │
┌─────────────────────────────────────────────────────────────────┐
│                    Database (PostgreSQL)                       │
├─────────────────────────────────────────────────────────────────┤
│  • Drizzle ORM with type-safe queries                          │
│  • Comprehensive schema for markets, users, trades             │
│  • Fee collection and withdrawal tracking                      │
│  • API key management                                          │
│  • Activity logging and audit trails                           │
└─────────────────────────────────────────────────────────────────┘
                                    │
                                    │ Blockchain Integration
                                    │
┌─────────────────────────────────────────────────────────────────┐
│                   Blockchain Layer                             │
├─────────────────────────────────────────────────────────────────┤
│  • Ethereum wallet integration (MetaMask, Phantom)             │
│  • USDC/USDT deposit verification                              │
│  • GalaChain SDK integration (future)                          │
│  • Transaction verification and settlement                     │
└─────────────────────────────────────────────────────────────────┘
```

## Core Components

### 1. Frontend Architecture

#### Technology Stack
- **React 18** with TypeScript for type safety
- **Vite** for fast development and optimized builds
- **TailwindCSS** for utility-first styling
- **shadcn/ui** components built on Radix UI primitives
- **TanStack Query** for server state management and caching
- **wouter** for lightweight client-side routing
- **Chart.js** for data visualization

#### Key Components

**Navigation & Layout**
- `Navigation` - Main navigation with wallet connection
- `Footer` - Site footer with links
- `WalletConnection` - Modal for wallet integration

**Trading Components**
- `MarketCard` - Display market information and prices
- `TradingInterface` - Order placement and execution
- `PriceChart` - Market price visualization
- `OrderHistory` - User's trading history

**UI Components**
- Comprehensive set of reusable components in `components/ui/`
- Gaming-themed styling with neon effects and animations
- Responsive design with mobile support

#### State Management
- **UserContext** - User authentication and profile data
- **RoleContext** - Admin/user role management
- **TanStack Query** - Server state caching and synchronization
- **Local state** - Component-level state with React hooks

### 2. Backend Architecture

#### Technology Stack
- **Express.js** with TypeScript
- **PostgreSQL** with Drizzle ORM
- **Session management** with PostgreSQL storage
- **Rate limiting** and security middleware
- **Public API** for bot integration

#### Core Services

**Authentication Service**
- Wallet-based authentication (MetaMask, Phantom)
- Email/password authentication with verification
- Session management with secure cookies
- Role-based access control (admin/user)

**Trading Engine**
- Automated Market Maker (AMM) implementation
- Order matching and execution
- Price discovery and slippage protection
- Fee collection and distribution

**Oracle Service**
- CoinGecko API integration for crypto markets
- Sportradar API for sports data
- AP Elections API for political markets
- Manual resolution for custom markets

**API Management**
- Public API for bots and market makers
- API key generation and management
- HMAC signature verification
- Rate limiting with tiered access

### 3. Database Schema

#### Core Tables

**Users & Authentication**
```sql
users - User accounts and profiles
auth_tokens - Email verification and password reset tokens
activity_logs - User activity tracking and audit trails
```

**Markets & Trading**
```sql
markets - Prediction market definitions
positions - User holdings in markets
orders - Trading orders (buy/sell)
trades - Executed trades
user_balances - User account balances
```

**Fee Management**
```sql
collected_fees - Trading fees collected
fee_withdrawals - Admin fee withdrawals to GalaChain
```

**API & Security**
```sql
api_keys - API key management for bots
api_key_nonces - Replay attack prevention
```

**Blockchain Integration**
```sql
deposits - Cryptocurrency deposits from users
```

#### Key Relationships
- Users have many positions, orders, and trades
- Markets have many positions, orders, and trades
- Trades link buyers and sellers with market data
- API keys belong to users with specific scopes

### 4. API Endpoints

#### Public API (No Authentication)
```
GET  /public/v1/ping                    - Health check
GET  /public/v1/openapi.json           - API specification
GET  /public/v1/markets                - List all markets
GET  /public/v1/markets/:id            - Get market details
GET  /public/v1/markets/:id/orderbook  - Market order book
GET  /public/v1/markets/:id/trades     - Market trade history
GET  /public/v1/ticker                 - Market ticker data
GET  /public/v1/stats                  - Platform statistics
```

#### Authenticated API (API Key Required)
```
GET  /public/v1/account/balance        - User balance
GET  /public/v1/account/positions      - User positions
GET  /public/v1/account/orders         - User orders
POST /public/v1/orders                 - Create order
POST /public/v1/orders/:id/cancel      - Cancel order
```

#### Web Application API
```
# Authentication
POST /api/auth/wallet-connect          - Connect wallet
POST /api/auth/signup                  - User registration
POST /api/auth/login                   - User login
POST /api/auth/logout                  - User logout
POST /api/auth/verify-email            - Email verification
POST /api/auth/password-reset/request  - Password reset request
POST /api/auth/password-reset/confirm  - Password reset confirmation

# Markets
GET  /api/markets                      - List markets
GET  /api/markets/:id                  - Get market
POST /api/markets                      - Create market (admin)
PATCH /api/markets/:id                 - Update market (admin)

# Trading
POST /api/orders                       - Place order
GET  /api/orders/:userId               - Get user orders
GET  /api/trades                       - Get trade history

# User Management
GET  /api/users/:id/balance            - Get user balance
GET  /api/users/:id/positions          - Get user positions
POST /api/users/:id/faucet             - Add test USDC
POST /api/users/:id/withdraw           - Withdraw funds
POST /api/users/:id/reset-balance      - Reset balance

# Admin
GET  /api/admin/users                  - List all users
GET  /api/admin/fees/summary           - Fee collection summary
POST /api/admin/fees/withdraw          - Withdraw collected fees
PATCH /api/admin/users/:id             - Update user

# Deposits
GET  /api/deposits/config              - Deposit configuration
POST /api/deposits/pending             - Submit deposit
GET  /api/users/:userId/deposits       - Get user deposits
```

## Key Features

### 1. Binary Prediction Markets
- YES/NO position trading with automated market maker
- Real-time price discovery based on supply and demand
- Multiple market categories (crypto, politics, sports, tech, entertainment)
- Automated resolution via oracle integration

### 2. Trading System
- **Market Orders** - Immediate execution at current price
- **Limit Orders** - Execute when price conditions are met
- **Slippage Protection** - Configurable maximum slippage
- **Fee Collection** - 2% trading fee with admin withdrawal capability

### 3. Wallet Integration
- **MetaMask** and **Phantom** wallet support
- **USDC/USDT** deposit verification via blockchain
- **Ethereum Mainnet** integration
- **GalaChain** SDK ready for future integration

### 4. Oracle System
- **CoinGecko API** - Cryptocurrency price data
- **Sportradar API** - Sports results and data
- **AP Elections API** - Political election results
- **Manual Resolution** - Admin-controlled market resolution

### 5. Security Features
- **CSRF Protection** - Origin header validation
- **Rate Limiting** - IP and API key based limits
- **HMAC Signatures** - API request verification
- **Session Security** - Secure cookie configuration
- **Input Validation** - Zod schema validation

### 6. Admin Features
- **User Management** - View and manage user accounts
- **Fee Withdrawal** - Withdraw collected fees to GalaChain
- **Market Management** - Create and resolve markets
- **Activity Monitoring** - User activity logs and audit trails

## Data Flow

### 1. User Registration & Authentication
```
1. User connects wallet (MetaMask/Phantom)
2. Backend creates user account automatically
3. Session established with secure cookies
4. User receives 1000 test USDC balance
```

### 2. Market Trading Flow
```
1. User views market details and current prices
2. User places order (buy/sell YES/NO shares)
3. AMM calculates execution price and slippage
4. Order executed if conditions met
5. User balance and positions updated
6. Trading fees collected and recorded
7. Market prices updated based on trade
```

### 3. Market Resolution Flow
```
1. Market end date reached or oracle data available
2. Admin resolves market with outcome (YES/NO)
3. Settlement process calculates payouts
4. Winning positions credited to user balances
5. Losing positions cleared (shares = 0)
6. Market status updated to 'resolved'
```

### 4. Deposit Flow
```
1. User initiates USDC/USDT deposit
2. User sends tokens to platform wallet
3. Backend verifies transaction on blockchain
4. Deposit recorded in database
5. User balance credited
6. Confirmation sent to user
```

## Security Considerations

### 1. Authentication & Authorization
- Session-based authentication with secure cookies
- Role-based access control (admin/user)
- API key authentication for bots
- HMAC signature verification for write operations

### 2. Input Validation & Sanitization
- Zod schema validation for all inputs
- SQL injection prevention via Drizzle ORM
- XSS protection through React's built-in escaping
- CSRF protection via origin header validation

### 3. Rate Limiting & DDoS Protection
- IP-based rate limiting for public endpoints
- API key-based rate limiting with tiers
- Request size limits and timeout handling
- Nonce-based replay attack prevention

### 4. Blockchain Security
- Transaction verification on Ethereum mainnet
- Exact amount matching to prevent manipulation
- Minimum deposit requirements
- Secure wallet address validation

## Deployment Architecture

### Development Environment
- **Local PostgreSQL** database
- **Vite dev server** for frontend
- **Express server** with hot reload
- **Environment variables** for configuration

### Production Considerations
- **PostgreSQL** with connection pooling
- **Redis** for session storage and rate limiting
- **CDN** for static asset delivery
- **Load balancer** for high availability
- **SSL/TLS** encryption for all communications
- **Environment-specific** configuration management

## Future Enhancements

### 1. Blockchain Integration
- **GalaChain** smart contract deployment
- **On-chain** trading and settlement
- **Cross-chain** asset support
- **DeFi** protocol integration

### 2. Advanced Trading Features
- **Advanced order types** (stop-loss, take-profit)
- **Portfolio analytics** and reporting
- **Social trading** features
- **Market creation** by users

### 3. Oracle Expansion
- **Custom oracle** integration
- **Real-time data** feeds
- **Multi-source** verification
- **Dispute resolution** mechanisms

### 4. Platform Features
- **Mobile application** development
- **Push notifications** for market updates
- **Advanced analytics** dashboard
- **API marketplace** for third-party integrations

## Development Guidelines

### 1. Code Organization
- **Monorepo** structure with shared types
- **TypeScript** for type safety across the stack
- **ESLint** and **Prettier** for code formatting
- **Component-driven** development approach

### 2. Testing Strategy
- **Unit tests** for business logic
- **Integration tests** for API endpoints
- **E2E tests** for critical user flows
- **Performance testing** for trading engine

### 3. Monitoring & Observability
- **Application logging** with structured data
- **Performance metrics** and monitoring
- **Error tracking** and alerting
- **User analytics** and behavior tracking

This architecture provides a solid foundation for a scalable prediction market platform with comprehensive trading features, security measures, and extensibility for future enhancements.
