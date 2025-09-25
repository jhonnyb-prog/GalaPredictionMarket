# 🎮 Gala 8Ball - Gaming Prediction Market Platform

A vibrant, gaming-themed binary prediction market platform built on modern web technologies with GalaChain blockchain integration. Create, trade, and resolve prediction markets across multiple categories with automated oracle support.

![Gaming Theme](https://img.shields.io/badge/Theme-Gaming-purple?style=for-the-badge)
![Tech Stack](https://img.shields.io/badge/Stack-React%20%2B%20Express-blue?style=for-the-badge)
![Oracle Integration](https://img.shields.io/badge/Oracles-CoinGecko%20%7C%20Sportradar%20%7C%20AP-green?style=for-the-badge)

## ✨ Features

### 🎯 Core Trading Features
- **Binary Prediction Markets** - YES/NO position trading with automated market maker (AMM)
- **Advanced Order Types** - Market orders, limit orders with slippage protection
- **Real-time Price Discovery** - Dynamic pricing based on supply and demand
- **Portfolio Management** - Track positions, P&L, and trading history
- **Liquidity Provision** - Integrated AMM system for continuous trading

### 🎮 Gaming Experience
- **Vibrant Neon Theme** - Purple, cyan, green, and yellow gaming aesthetics
- **Interactive UI** - Glow effects, hover animations, and gaming-styled cards
- **Emoji Integration** - Visual indicators throughout the interface
- **Gaming Typography** - Neon text effects and modern design elements

### 🔮 Oracle Integration
- **📈 CoinGecko API** - Real-time cryptocurrency price data for crypto markets
- **🏆 Sportradar API** - Sports data and results for sports prediction markets
- **📊 AP Elections API** - Election results and political data
- **✋ Manual Resolution** - Admin-controlled resolution for custom markets

### 📊 Market Categories
- **🪙 Crypto** - Cryptocurrency price predictions and market events
- **🗳️ Politics** - Election outcomes, policy predictions, political events
- **⚽ Sports** - Game results, tournament winners, player performances
- **💻 Tech** - Technology trends, product launches, industry developments
- **🎬 Entertainment** - Award shows, box office predictions, cultural events

## 🛠 Tech Stack

### Frontend
- **React 18** with TypeScript
- **Vite** for fast development and building
- **TailwindCSS** for utility-first styling
- **shadcn/ui** components built on Radix UI
- **TanStack Query** for server state management
- **wouter** for lightweight routing
- **Chart.js** for data visualization

### Backend
- **Express.js** with TypeScript
- **PostgreSQL** with Drizzle ORM (local or cloud)
- **Type-safe** API with Zod validation
- **Session management** with PostgreSQL storage
- **RESTful API** design
- **dotenv** for environment variable management

### Blockchain Integration
- **GalaChain SDK** for blockchain connectivity
- **Wallet Integration** - MetaMask, WalletConnect support
- **Future-ready** for on-chain trading and settlement

## 🚀 Quick Start

### Prerequisites

- **Node.js** 18+ and npm
- **PostgreSQL** 14+ database
- **Git** for version control

### Local Development Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/gala-8ball.git
   cd gala-8ball
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Install additional required packages**
   
   The application needs additional packages for local PostgreSQL support:
   ```bash
   npm install dotenv pg @types/pg drizzle-orm
   ```

4. **Set up environment variables**
   
   Create a `.env` file in the root directory:
   ```env
   # Database Configuration (replace 'your_username' with your actual PostgreSQL username)
   DATABASE_URL="postgresql://your_username@localhost:5432/gala8ball"
   
   # Session Security
   SESSION_SECRET="gala-prediction-market-dev-secret-change-in-production"
   
   # Development Settings
   NODE_ENV=development
   PORT=5000
   
   # Oracle API Keys (Optional - for production features)
   # COINGECKO_API_KEY="your-coingecko-api-key"
   # SPORTRADAR_API_KEY="your-sportradar-api-key"
   # AP_ELECTIONS_API_KEY="your-ap-elections-api-key"
   
   # Email Configuration (Optional - for email verification)
   # EMAIL_USER="your-email@gmail.com"
   # EMAIL_PASS="your-app-password"
   # EMAIL_FROM="noreply@gala8ball.com"
   # CLIENT_URL="http://localhost:5000"
   
   # Blockchain Configuration (Optional - for deposit verification)
   # ETHEREUM_RPC_URL="https://cloudflare-eth.com"
   # ONRAMP_WALLET_ETH="your-ethereum-wallet-address"
   
   # Google Analytics (Optional)
   # VITE_GA_MEASUREMENT_ID="your-ga-measurement-id"
   ```

5. **Set up the database**
   
   Create a PostgreSQL database:
   ```bash
   createdb gala8ball
   ```
   
   Push the database schema:
   ```bash
   npm run db:push
   ```

6. **Start the development server**
   ```bash
   npm run dev
   ```

7. **Open your browser**
   
   Navigate to `http://localhost:5000` to see the application.

### 🔧 **Important Configuration Notes**

- **Database Driver**: The application has been configured to use local PostgreSQL instead of Neon (serverless)
- **Environment Loading**: Added `dotenv` configuration to properly load environment variables
- **Server Binding**: Modified to use `localhost` instead of `0.0.0.0` for local development
- **Port**: Application runs on port 5000 (not 3000) to avoid conflicts

### 🚨 **Troubleshooting**

If you encounter issues:

1. **Database Connection Error**: Ensure PostgreSQL is running and the username in `DATABASE_URL` matches your system username
2. **Port Already in Use**: The application uses port 5000 by default. Change the `PORT` in `.env` if needed
3. **Environment Variables Not Loading**: Make sure the `.env` file is in the root directory and contains the correct `DATABASE_URL`
4. **Schema Push Fails**: Verify your PostgreSQL user has permission to create tables in the `gala8ball` database

## 📁 Project Structure

```
gala-8ball/
├── client/                 # React frontend
│   ├── src/
│   │   ├── components/     # Reusable UI components
│   │   │   ├── ui/        # shadcn/ui base components
│   │   │   ├── market-card.tsx
│   │   │   ├── navigation.tsx
│   │   │   ├── trading-interface.tsx
│   │   │   └── wallet-connection.tsx
│   │   ├── hooks/         # Custom React hooks
│   │   ├── lib/           # Utility functions and configs
│   │   ├── pages/         # Application pages/routes
│   │   ├── types/         # TypeScript type definitions
│   │   ├── App.tsx        # Main app component
│   │   ├── index.css      # Global styles with gaming theme
│   │   └── main.tsx       # App entry point
│   └── index.html         # HTML template
├── server/                # Express backend
│   ├── db.ts             # Database connection
│   ├── index.ts          # Server entry point
│   ├── routes.ts         # API route handlers
│   ├── storage.ts        # Data access layer
│   └── vite.ts           # Vite integration
├── shared/               # Shared types and schemas
│   └── schema.ts         # Database schema and validation
├── package.json          # Dependencies and scripts
├── tailwind.config.ts    # TailwindCSS configuration
├── tsconfig.json         # TypeScript configuration
└── vite.config.ts        # Vite configuration
```

## 🔧 Available Scripts

- **`npm run dev`** - Start development server (frontend + backend)
- **`npm run build`** - Build for production
- **`npm run start`** - Start production server
- **`npm run check`** - Type check with TypeScript
- **`npm run db:push`** - Push database schema changes

## 🌐 API Endpoints

### Markets
- `GET /api/markets` - Get all markets
- `GET /api/markets/:id` - Get specific market
- `POST /api/markets` - Create new market (admin)
- `PATCH /api/markets/:id` - Update market

### Trading
- `POST /api/orders` - Place buy/sell order
- `GET /api/orders/:userId` - Get user's orders
- `GET /api/trades` - Get trade history
- `GET /api/trades/:marketId` - Get market trades

### Users & Portfolio
- `POST /api/users` - Create/register user
- `GET /api/users/:id` - Get user profile
- `GET /api/positions/:userId` - Get user positions
- `GET /api/balances/:userId` - Get user balance

### Admin
- `POST /api/admin/resolve` - Resolve market outcome
- `GET /api/admin/stats` - Get platform statistics

## 🔮 Oracle Configuration

### CoinGecko API
For crypto markets, configure with coin IDs:
```json
{
  "coinId": "bitcoin",
  "priceThreshold": 100000,
  "comparison": "gte"
}
```

### Sportradar API
For sports markets, configure with event details:
```json
{
  "sportId": "sr:sport:1",
  "eventId": "sr:match:12345",
  "outcomeType": "winner"
}
```

### AP Elections API
For political markets, configure with race information:
```json
{
  "raceId": "2024-presidential",
  "candidate": "candidate-name",
  "state": "US"
}
```

## 🎨 Gaming Theme Customization

The application features a vibrant gaming theme with customizable colors in `client/src/index.css`:

```css
:root {
  --gaming-purple: #df00ff;
  --gaming-cyan: #00ffff;
  --gaming-green: #00ff00;
  --gaming-yellow: #ffff00;
  /* Add your custom gaming colors */
}
```

Gaming UI components include:
- `.gaming-card` - Glowing card containers
- `.glow-button` - Interactive buttons with hover effects
- `.neon-text` - Glowing text effects
- Category badges with emoji indicators

## 🚀 Deployment

### Production Build
```bash
npm run build
```

### Environment Setup
Set production environment variables:
- Use secure random `SESSION_SECRET`
- Configure production database connection
- Add oracle API keys for automated resolution
- Set `NODE_ENV=production`

### Database Migration
```bash
npm run db:push
```

## 🤝 Contributing

1. **Fork the repository**
2. **Create a feature branch** (`git checkout -b feature/amazing-feature`)
3. **Commit your changes** (`git commit -m 'Add amazing feature'`)
4. **Push to the branch** (`git push origin feature/amazing-feature`)
5. **Open a Pull Request**

### Development Guidelines

- Follow TypeScript best practices
- Use the existing component patterns
- Maintain the gaming theme aesthetics
- Add proper TypeScript types
- Include error handling
- Write meaningful commit messages

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🎮 Gaming Features

- **Neon Glow Effects** - Interactive elements with gaming-style lighting
- **Vibrant Color Scheme** - Purple, cyan, green, and yellow accents
- **Emoji Integration** - Visual indicators throughout the interface
- **Hover Animations** - Responsive UI elements with smooth transitions
- **Gaming Typography** - Custom fonts and text effects

## 🔗 Links

- **Live Demo** - [Coming Soon]
- **Documentation** - [API Docs](docs/api.md)
- **Issues** - [GitHub Issues](https://github.com/yourusername/gala-8ball/issues)
- **Discussions** - [GitHub Discussions](https://github.com/yourusername/gala-8ball/discussions)

---

Made with 💜 by the Gala 8Ball team - Where prediction meets gaming excitement!