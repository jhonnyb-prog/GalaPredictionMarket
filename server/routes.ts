import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { 
  insertMarketSchema, 
  createOrderSchema, 
  insertUserSchema, 
  userRegistrationSchema,
  userLoginSchema,
  passwordResetRequestSchema,
  passwordResetConfirmSchema,
  type DepositConfig 
} from "@shared/schema";
import bcrypt from 'bcrypt';
import nodemailer from 'nodemailer';
import { randomBytes } from 'node:crypto';
import rateLimit from 'express-rate-limit';
import { z } from "zod";
import { IStorage } from "./storage";
import publicApiRouter from "./publicApi";
import { ethers } from "ethers";
import cors from "cors";

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
// Rate limiting for authentication endpoints
const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per window
  message: { error: "Too many authentication attempts, please try again later" },
  standardHeaders: true,
  legacyHeaders: false,
});

const passwordResetRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // 3 password reset attempts per hour
  message: { error: "Too many password reset attempts, please try again later" },
  standardHeaders: true,
  legacyHeaders: false,
});

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

// CSRF protection middleware (check Origin header for state-changing requests)
function csrfProtection(req: any, res: any, next: any) {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
    return next();
  }
  
  const origin = req.get('Origin');
  const host = req.get('Host');
  
  if (!origin || !host) {
    return res.status(403).json({ error: "CSRF protection: Missing origin or host header" });
  }
  
  // SECURITY FIX: Use exact host matching instead of endsWith to prevent subdomain attacks
  try {
    const originHost = new URL(origin).host;
    if (originHost !== host) {
      return res.status(403).json({ error: "CSRF protection: Invalid origin" });
    }
  } catch (error) {
    return res.status(403).json({ error: "CSRF protection: Invalid origin URL" });
  }
  
  next();
}

// Initialize blockchain provider for transaction verification
const getEthereumProvider = () => {
  // Use Infura, Alchemy, or other RPC provider for mainnet verification
  const rpcUrl = process.env.ETHEREUM_RPC_URL || 'https://cloudflare-eth.com'; // Free Cloudflare Ethereum RPC
  return new ethers.providers.JsonRpcProvider(rpcUrl);
};

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
  // Apply CSRF protection to all state-changing routes (critical security)
  app.use(csrfProtection);
  
  // Mount public API router for bots and market makers
  app.use('/public/v1', publicApiRouter);
  
  // OpenAPI specification is now served by the public API router at /public/v1/openapi.json
  
  // Authentication endpoints
  app.post("/api/auth/guest", async (req, res) => {
    try {
      const { username } = req.body;
      
      // Create or get guest user
      const userData = {
        username: username || `Guest${Date.now()}`,
        walletAddress: `guest_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      };
      
      const user = await storage.createUser(userData);
      
      // Set session
      req.session.userId = user.id;
      
      res.json({ user, message: "Guest session created" });
    } catch (error) {
      res.status(500).json({ error: "Failed to create guest session" });
    }
  });

  app.get("/api/auth/me", async (req, res) => {
    try {
      if (!req.session.userId) {
        // Return 401 for unauthenticated users - don't auto-create guests
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
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ error: "Failed to logout" });
      }
      res.json({ message: "Logged out successfully" });
    });
  });

  // DISABLED: Admin toggle endpoint - SECURITY RISK
  // This endpoint was allowing privilege escalation - any user could become admin
  // In production, admin access should be granted server-side based on database roles
  app.post("/api/auth/admin-toggle", requireAuth, async (req, res) => {
    return res.status(403).json({ 
      error: "Admin access modification disabled for security. Contact system administrator." 
    });
  });

  // Email/Password Authentication Endpoints

  // Email service configuration
  const createEmailTransporter = () => {
    if (process.env.NODE_ENV === 'production') {
      // Production email configuration (placeholder)
      return nodemailer.createTransport({
        service: 'gmail', // or your email service
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASS,
        },
      });
    } else {
      // Development: create test account or use console logging
      return {
        async sendMail(mailOptions: any) {
          console.log('📧 Email would be sent:', {
            to: mailOptions.to,
            subject: mailOptions.subject,
            html: mailOptions.html,
          });
          return { messageId: 'dev-test-id' };
        }
      };
    }
  };

  const sendVerificationEmail = async (email: string, token: string) => {
    const transporter = createEmailTransporter();
    const verificationUrl = `${process.env.CLIENT_URL || 'http://localhost:5000'}/verify-email?token=${token}`;
    
    await transporter.sendMail({
      from: process.env.EMAIL_FROM || 'noreply@gala8ball.com',
      to: email,
      subject: 'Verify Your Email - Gala 8Ball',
      html: `
        <h2>Welcome to Gala 8Ball!</h2>
        <p>Please click the link below to verify your email address:</p>
        <a href="${verificationUrl}" style="background: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Verify Email</a>
        <p>This link will expire in 24 hours.</p>
        <p>If you didn't create an account, you can safely ignore this email.</p>
      `,
    });
  };

  const sendPasswordResetEmail = async (email: string, token: string) => {
    const transporter = createEmailTransporter();
    const resetUrl = `${process.env.CLIENT_URL || 'http://localhost:5000'}/reset-password?token=${token}`;
    
    await transporter.sendMail({
      from: process.env.EMAIL_FROM || 'noreply@gala8ball.com',
      to: email,
      subject: 'Password Reset - Gala 8Ball',
      html: `
        <h2>Password Reset Request</h2>
        <p>Click the link below to reset your password:</p>
        <a href="${resetUrl}" style="background: #dc3545; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Reset Password</a>
        <p>This link will expire in 1 hour.</p>
        <p>If you didn't request a password reset, you can safely ignore this email.</p>
      `,
    });
  };

  // User Registration with Email Verification
  app.post("/api/auth/signup", authRateLimit, async (req, res) => {
    try {
      const validatedData = userRegistrationSchema.parse(req.body);
      
      // Check if user already exists
      const existingUser = await storage.getUserByEmail(validatedData.email);
      if (existingUser) {
        return res.status(409).json({ error: "User already exists with this email" });
      }
      
      // Hash password
      const saltRounds = 12;
      const passwordHash = await bcrypt.hash(validatedData.password, saltRounds);
      
      // Create user account
      const user = await storage.createUser({
        email: validatedData.email,
        passwordHash,
        username: validatedData.username || `user_${Date.now()}`,
        emailVerified: false,
        status: 'active',
      });
      
      // Generate email verification token (24h expiry)
      const verificationToken = randomBytes(32).toString('hex');
      await storage.createAuthToken({
        userId: user.id,
        token: verificationToken,
        type: 'email_verification',
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
      });
      
      // Log registration activity
      await storage.createActivityLog({
        userId: user.id,
        action: 'user_registered',
        details: JSON.stringify({ email: validatedData.email }),
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
      });
      
      // Send verification email
      await sendVerificationEmail(user.email, verificationToken);
      
      res.status(201).json({ 
        message: "Registration successful. Please check your email to verify your account.",
        user: {
          id: user.id,
          email: user.email,
          username: user.username,
          emailVerified: user.emailVerified,
        }
      });
    } catch (error: any) {
      if (error.name === 'ZodError') {
        return res.status(400).json({ error: "Validation failed", details: error.errors });
      }
      console.error('Registration error:', error);
      res.status(500).json({ error: "Registration failed" });
    }
  });

  // User Login with Email/Password
  app.post("/api/auth/login", authRateLimit, async (req, res) => {
    try {
      const validatedData = userLoginSchema.parse(req.body);
      
      // Find user by email
      const user = await storage.getUserByEmail(validatedData.email);
      if (!user || !user.passwordHash) {
        return res.status(401).json({ error: "Invalid email or password" });
      }
      
      // Check user status
      if (user.status === 'banned') {
        return res.status(403).json({ error: "Account has been banned. Contact support." });
      }
      if (user.status === 'deleted') {
        return res.status(403).json({ error: "Account not found" });
      }
      
      // Verify password
      const isValidPassword = await bcrypt.compare(validatedData.password, user.passwordHash);
      if (!isValidPassword) {
        return res.status(401).json({ error: "Invalid email or password" });
      }
      
      // Update last login
      await storage.updateUserLastLogin(user.id);
      
      // Log login activity
      await storage.createActivityLog({
        userId: user.id,
        action: 'user_login',
        details: JSON.stringify({ method: 'email_password' }),
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
      });
      
      // Create session
      req.session.userId = user.id;
      
      res.json({ 
        message: "Login successful",
        user: {
          id: user.id,
          email: user.email,
          username: user.username,
          emailVerified: user.emailVerified,
          status: user.status,
        }
      });
    } catch (error: any) {
      if (error.name === 'ZodError') {
        return res.status(400).json({ error: "Validation failed", details: error.errors });
      }
      console.error('Login error:', error);
      res.status(500).json({ error: "Login failed" });
    }
  });

  // Email Verification
  app.post("/api/auth/verify-email", authRateLimit, async (req, res) => {
    try {
      const { token } = req.body;
      if (!token) {
        return res.status(400).json({ error: "Verification token is required" });
      }
      
      // Find and validate token with expiry and used status check
      const authToken = await storage.getAuthToken(token);
      if (!authToken || authToken.type !== 'email_verification') {
        return res.status(400).json({ error: "Invalid or expired verification token" });
      }
      
      // CRITICAL: Check token expiry and used status
      if (authToken.used || new Date(authToken.expiresAt) < new Date()) {
        return res.status(400).json({ error: "Invalid or expired verification token" });
      }
      
      // Mark email as verified
      await storage.updateUserEmailVerification(authToken.userId, true);
      
      // Mark token as used
      await storage.markAuthTokenUsed(authToken.id);
      
      // Log verification activity
      await storage.createActivityLog({
        userId: authToken.userId,
        action: 'email_verified',
        details: JSON.stringify({ token_type: 'email_verification' }),
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
      });
      
      res.json({ message: "Email verified successfully" });
    } catch (error) {
      console.error('Email verification error:', error);
      res.status(500).json({ error: "Email verification failed" });
    }
  });

  // Password Reset Request
  app.post("/api/auth/password-reset/request", passwordResetRateLimit, async (req, res) => {
    try {
      const validatedData = passwordResetRequestSchema.parse(req.body);
      
      // Find user (always return success for security)
      const user = await storage.getUserByEmail(validatedData.email);
      
      if (user && user.status === 'active') {
        // Generate reset token (1h expiry)
        const resetToken = randomBytes(32).toString('hex');
        await storage.createAuthToken({
          userId: user.id,
          token: resetToken,
          type: 'password_reset',
          expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
        });
        
        // Log password reset request
        await storage.createActivityLog({
          userId: user.id,
          action: 'password_reset_requested',
          details: JSON.stringify({ email: validatedData.email }),
          ipAddress: req.ip,
          userAgent: req.get('User-Agent'),
        });
        
        // Send password reset email
        await sendPasswordResetEmail(user.email, resetToken);
      }
      
      // Always return success (security best practice)
      res.json({ message: "If your email exists, you'll receive a reset link." });
    } catch (error: any) {
      if (error.name === 'ZodError') {
        return res.status(400).json({ error: "Validation failed", details: error.errors });
      }
      console.error('Password reset request error:', error);
      res.status(500).json({ error: "Password reset request failed" });
    }
  });

  // Password Reset Confirmation
  app.post("/api/auth/password-reset/confirm", authRateLimit, async (req, res) => {
    try {
      const validatedData = passwordResetConfirmSchema.parse(req.body);
      
      // Find and validate reset token with expiry and used status check
      const authToken = await storage.getAuthToken(validatedData.token);
      if (!authToken || authToken.type !== 'password_reset') {
        return res.status(400).json({ error: "Invalid or expired reset token" });
      }
      
      // CRITICAL: Check token expiry and used status
      if (authToken.used || new Date(authToken.expiresAt) < new Date()) {
        return res.status(400).json({ error: "Invalid or expired reset token" });
      }
      
      // Hash new password
      const saltRounds = 12;
      const passwordHash = await bcrypt.hash(validatedData.password, saltRounds);
      
      // Update password
      await storage.updateUserPassword(authToken.userId, passwordHash);
      
      // Mark token as used
      await storage.markAuthTokenUsed(authToken.id);
      
      // Log password reset completion
      await storage.createActivityLog({
        userId: authToken.userId,
        action: 'password_reset_completed',
        details: JSON.stringify({ token_type: 'password_reset' }),
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
      });
      
      res.json({ message: "Password reset successful. You can now login with your new password." });
    } catch (error: any) {
      if (error.name === 'ZodError') {
        return res.status(400).json({ error: "Validation failed", details: error.errors });
      }
      console.error('Password reset confirmation error:', error);
      res.status(500).json({ error: "Password reset confirmation failed" });
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

  // Test USDC Faucet endpoints
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

  // User positions
  app.get("/api/users/:id/positions", requireAuth, requireOwnership, async (req, res) => {
    try {
      const positions = await storage.getUserPositions(req.params.id);
      res.json(positions);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch positions" });
    }
  });

  // User orders
  app.get("/api/users/:id/orders", requireAuth, requireOwnership, async (req, res) => {
    try {
      const orders = await storage.getUserOrders(req.params.id);
      res.json(orders);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch orders" });
    }
  });

  // User trades
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

  // API key management endpoints for users
  app.get("/api/users/:userId/api-keys", requireAuth, async (req, res) => {
    try {
      const userId = req.params.userId;
      
      // Users can only access their own API keys (or admin can access any)
      if (req.session.userId !== userId && req.session.role !== 'admin') {
        return res.status(403).json({ error: "Access denied" });
      }
      
      const apiKeys = await storage.getUserApiKeys(userId);
      res.json(apiKeys);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch API keys" });
    }
  });

  app.post("/api/users/:userId/api-keys", requireAuth, async (req, res) => {
    try {
      const userId = req.params.userId;
      
      // Users can only create API keys for themselves (or admin can create for any)
      if (req.session.userId !== userId && req.session.role !== 'admin') {
        return res.status(403).json({ error: "Access denied" });
      }

      const { label, scopes } = req.body;
      
      if (!label || !scopes || !Array.isArray(scopes)) {
        return res.status(400).json({ error: "Label and scopes are required" });
      }

      // Validate scopes
      const validScopes = ['read', 'trade', 'admin'];
      const invalidScopes = scopes.filter(scope => !validScopes.includes(scope));
      if (invalidScopes.length > 0) {
        return res.status(400).json({ error: `Invalid scopes: ${invalidScopes.join(', ')}` });
      }

      // Generate secure signing secret using the cryptographically secure function
      const { generateApiKey } = await import('./publicApiMiddleware.js');
      const signingSecret = generateApiKey();
      
      const apiKey = await storage.createApiKey({
        userId,
        label,
        scopes,
        signingSecret,
        status: 'active',
        rateLimitTier: 1,
      });

      res.status(201).json({
        id: apiKey.id,
        label: apiKey.label,
        scopes: apiKey.scopes,
        status: apiKey.status,
        rateLimitTier: apiKey.rateLimitTier,
        createdAt: apiKey.createdAt,
        message: `API key created successfully. Your key ID is: ${apiKey.id}`
      });
    } catch (error) {
      console.error('API key creation error:', error);
      res.status(500).json({ error: "Failed to create API key" });
    }
  });

  app.delete("/api/users/:userId/api-keys/:keyId", requireAuth, async (req, res) => {
    try {
      const { userId, keyId } = req.params;
      
      // Users can only delete their own API keys (or admin can delete any)
      if (req.session.userId !== userId && req.session.role !== 'admin') {
        return res.status(403).json({ error: "Access denied" });
      }

      // Verify the API key belongs to the user
      const apiKey = await storage.getApiKey(keyId);
      if (!apiKey) {
        return res.status(404).json({ error: "API key not found" });
      }
      
      if (apiKey.userId !== userId) {
        return res.status(403).json({ error: "Access denied" });
      }

      await storage.deleteApiKey(keyId);
      res.json({ message: "API key deleted successfully" });
    } catch (error) {
      console.error('API key deletion error:', error);
      res.status(500).json({ error: "Failed to delete API key" });
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

  // Cryptocurrency deposit configuration endpoint
  app.get("/api/deposits/config", requireAuth, async (req, res) => {
    try {
      // Server-controlled configuration to prevent client manipulation
      const config: DepositConfig = {
        recipientAddress: process.env.ONRAMP_WALLET_ETH!,
        allowedTokens: {
          'USDC': {
            address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
            decimals: 6
          },
          'USDT': {
            address: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
            decimals: 6
          }
        },
        chainId: 1, // Ethereum mainnet only
        minAmount: 1
      };

      if (!config.recipientAddress) {
        return res.status(500).json({ error: "Deposit configuration not available" });
      }

      res.json(config);
    } catch (error) {
      console.error('Config fetch error:', error);
      res.status(500).json({ error: "Failed to fetch deposit configuration" });
    }
  });

  // SECURE cryptocurrency deposit endpoint with blockchain verification
  app.post("/api/deposits/pending", requireAuth, csrfProtection, async (req, res) => {
    try {
      if (!req.session.userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      // Server configuration (NEVER trust client for security-critical data)
      const recipientAddress = process.env.ONRAMP_WALLET_ETH;
      const allowedTokens = {
        'USDC': '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        'USDT': '0xdAC17F958D2ee523a2206206994597C13D831ec7'
      } as const;

      if (!recipientAddress) {
        return res.status(500).json({ error: "Deposit configuration not available" });
      }

      // Strict validation with Zod (security-first approach)
      const depositSchema = z.object({
        transactionHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/, "Invalid transaction hash"),
        tokenType: z.enum(['USDC', 'USDT'], { required_error: "Invalid token type" }),
        amount: z.string().regex(/^\d+(\.\d+)?$/, "Invalid amount format"),
        chainId: z.number().refine(val => val === 1, "Only Ethereum mainnet allowed")
      });

      const validatedData = depositSchema.parse(req.body);

      // Prevent replay attacks - check for duplicate transaction
      const existingDeposit = await storage.getDepositByTransactionHash(validatedData.transactionHash);
      if (existingDeposit) {
        return res.status(409).json({ error: "Transaction already processed" });
      }

      // CRITICAL SECURITY: Verify transaction on blockchain (don't trust client)
      const provider = getEthereumProvider();
      
      try {
        const receipt = await provider.getTransactionReceipt(validatedData.transactionHash);
        
        if (!receipt) {
          return res.status(400).json({ error: "Transaction not found on blockchain" });
        }

        if (receipt.status !== 1) {
          return res.status(400).json({ error: "Transaction failed on blockchain" });
        }

        // CRITICAL: Verify Ethereum mainnet using provider network (receipt.chainId doesn't exist in ethers v5)
        const network = await provider.getNetwork();
        if (network.chainId !== 1) {
          return res.status(400).json({ error: "Invalid chain - Ethereum mainnet required" });
        }

        // Decode ERC-20 Transfer events for verification
        const expectedTokenAddress = allowedTokens[validatedData.tokenType];
        const transferTopic = ethers.utils.id("Transfer(address,address,uint256)");
        
        const transferLog = receipt.logs.find(log => 
          log.address.toLowerCase() === expectedTokenAddress.toLowerCase() &&
          log.topics[0] === transferTopic
        );

        if (!transferLog) {
          return res.status(400).json({ error: "Valid token transfer not found" });
        }

        // Decode and verify transfer details
        const decodedLog = ethers.utils.defaultAbiCoder.decode(['uint256'], transferLog.data);
        const transferAmount = decodedLog[0];
        
        // Verify recipient is our wallet
        const transferTo = ethers.utils.getAddress('0x' + transferLog.topics[2].slice(26));
        if (transferTo.toLowerCase() !== recipientAddress.toLowerCase()) {
          return res.status(400).json({ error: "Transfer not sent to correct wallet" });
        }

        // CRITICAL: Verify blockchain amount matches client claim and meets minimum
        const decimals = 6; // Both USDC and USDT use 6 decimals
        const expectedAmount = ethers.utils.parseUnits(validatedData.amount, decimals);
        
        // Exact match required - prevent under/over-crediting attacks
        if (!transferAmount.eq(expectedAmount)) {
          return res.status(400).json({ 
            error: "Transfer amount mismatch", 
            details: `Expected: ${ethers.utils.formatUnits(expectedAmount, decimals)}, Got: ${ethers.utils.formatUnits(transferAmount, decimals)}` 
          });
        }

        // Server-enforced minimum amount check
        const minAmount = ethers.utils.parseUnits('1', decimals);
        if (transferAmount.lt(minAmount)) {
          return res.status(400).json({ error: "Amount below minimum deposit of 1 USDC/USDT" });
        }

        // Extract sender address from blockchain
        const fromAddress = ethers.utils.getAddress('0x' + transferLog.topics[1].slice(26));

        // Create VERIFIED deposit record (all data from blockchain)
        const deposit = await storage.createDeposit({
          userId: req.session.userId,
          transactionHash: validatedData.transactionHash,
          walletAddress: recipientAddress, // Server-verified
          tokenContract: expectedTokenAddress, // Server-validated
          fromAddress: fromAddress, // Blockchain-verified
          tokenType: validatedData.tokenType,
          amount: validatedData.amount,
          userMessage: '', // Not needed for identification
          status: 'pending',
          chainId: 1, // Server-enforced mainnet
          blockNumber: receipt.blockNumber,
          confirmations: receipt.confirmations || 0
        });

        res.status(201).json(deposit);
        
      } catch (blockchainError: any) {
        console.error('Blockchain verification error:', blockchainError);
        return res.status(400).json({ 
          error: "Transaction verification failed", 
          details: blockchainError.message 
        });
      }

    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid request data", details: error.errors });
      }
      console.error('Deposit creation error:', error);
      res.status(500).json({ error: "Failed to process deposit" });
    }
  });

  app.get("/api/users/:userId/deposits", requireAuth, async (req, res) => {
    try {
      const userId = req.params.userId;
      
      // Users can only access their own deposits (or admin can access any)
      if (req.session.userId !== userId && req.session.role !== 'admin') {
        return res.status(403).json({ error: "Access denied" });
      }
      
      const deposits = await storage.getUserDeposits(userId);
      res.json(deposits);
    } catch (error) {
      console.error('Get deposits error:', error);
      res.status(500).json({ error: "Failed to fetch deposits" });
    }
  });


  const httpServer = createServer(app);
  return httpServer;
}
