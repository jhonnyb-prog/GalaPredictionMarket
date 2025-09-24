# Overview

Gala 8Ball is a modern prediction market platform built on the GalaChain blockchain. The application allows users to create, trade, and resolve prediction markets on various topics including cryptocurrency, politics, sports, technology, and entertainment. Users can buy and sell shares representing "YES" or "NO" positions on market outcomes, with prices determined by an automated market maker (AMM) system.

The platform features a full-stack TypeScript implementation with a React frontend and Express.js backend, integrated with PostgreSQL for data persistence and designed for future GalaChain blockchain integration.

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Frontend Architecture
The client uses **React 18** with **TypeScript** in a single-page application (SPA) architecture. The UI is built with **shadcn/ui components** based on **Radix UI primitives** and styled with **Tailwind CSS**. The application uses **wouter** for client-side routing instead of React Router, providing a lightweight navigation solution.

**TanStack Query** (React Query) handles all server state management, caching, and API interactions. The frontend follows a component-based architecture with reusable UI components, custom hooks for business logic, and TypeScript interfaces for type safety.

## Backend Architecture
The server implements a **REST API** using **Express.js** with TypeScript. The architecture follows a layered pattern with clear separation between routes, business logic, and data access. The storage layer is abstracted through an interface-based design, making it easy to swap implementations.

The API provides endpoints for markets, users, positions, orders, and trades, with comprehensive CRUD operations and real-time data access patterns.

## Database Layer
**PostgreSQL** serves as the primary database with **Drizzle ORM** providing type-safe database operations. The database schema supports complex prediction market operations including:
- User management with wallet address integration
- Market lifecycle management (creation, trading, resolution)
- Position tracking and portfolio management
- Order book and trade history
- Real-time price updates through AMM calculations

The schema uses PostgreSQL enums for type safety and includes proper foreign key relationships for data integrity.

## Automated Market Maker (AMM)
The platform implements a custom AMM system for price discovery and liquidity provision. The AMM calculates share prices based on supply and demand, handles slippage calculations, and manages liquidity pools for each market outcome.

## Build and Development System
The project uses **Vite** for fast development and building, with **ESBuild** for server bundling. The development setup includes hot module replacement, error overlays, and TypeScript checking. The build process creates optimized bundles for both client and server deployments.

## Authentication and Wallet Integration
The system is designed for **GalaChain wallet integration** with fallback support for MetaMask and WalletConnect. User authentication is tied to wallet addresses, providing a seamless Web3 experience. The current implementation includes mock wallet providers for development.

# External Dependencies

## Core Framework Dependencies
- **React 18** with TypeScript for the frontend user interface
- **Express.js** for the REST API server implementation
- **Vite** for development server and build tooling
- **Node.js** runtime environment

## Database and ORM
- **PostgreSQL** as the primary database system
- **Drizzle ORM** for type-safe database operations and migrations
- **@neondatabase/serverless** for database connectivity

## UI and Styling
- **Tailwind CSS** for utility-first styling
- **shadcn/ui** component library built on Radix UI primitives
- **Radix UI** for accessible, unstyled component primitives
- **Lucide React** for consistent iconography

## State Management and API
- **TanStack Query** for server state management and caching
- **React Hook Form** with **Zod** for form handling and validation
- **wouter** for lightweight client-side routing

## Development and Build Tools
- **TypeScript** for static type checking across the entire stack
- **ESBuild** for fast server bundling
- **PostCSS** with **Autoprefixer** for CSS processing

## Blockchain Integration (Planned)
- **GalaChain SDK** for blockchain connectivity (currently mocked)
- Wallet connection libraries for MetaMask and WalletConnect integration

## Chart and Visualization
- **Chart.js** for market price charts and data visualization
- **date-fns** for date formatting and manipulation

## Session and Security
- **connect-pg-simple** for PostgreSQL-based session storage
- Environment-based configuration for secure credential management