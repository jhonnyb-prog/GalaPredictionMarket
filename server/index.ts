import express, { type Request, Response, NextFunction } from "express";
import session from "express-session";
import MemoryStore from "memorystore";
import { createClient } from 'redis';
import csrf from 'csurf';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";

const app = express();

// Configure proxy trust for production deployments
app.set('trust proxy', 1);

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Session storage configuration - production-safe
async function createSessionStore() {
  if (process.env.NODE_ENV === 'production') {
    // Production: Require Redis for durable sessions
    if (!process.env.REDIS_URL && !process.env.REDIS_HOST) {
      throw new Error('REDIS_URL or REDIS_HOST required for production session storage');
    }
    
    const connectRedis = (await import('connect-redis')).default;
    const RedisStore = connectRedis(session);
    
    const redisClient = createClient({
      url: process.env.REDIS_URL || `redis://${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || 6379}`
    });
    
    await redisClient.connect();
    log('Connected to Redis for session storage');
    
    return new RedisStore({
      client: redisClient,
      prefix: 'gala_session:',
      ttl: 2 * 60 * 60, // 2 hours in seconds
    });
  } else {
    // Development: Use memory store
    const MemoryStoreSession = MemoryStore(session);
    return new MemoryStoreSession({
      checkPeriod: 86400000 // prune expired entries every 24h
    });
  }
}

// Require SESSION_SECRET in production
if (process.env.NODE_ENV === 'production' && !process.env.SESSION_SECRET) {
  throw new Error('SESSION_SECRET environment variable is required in production');
}

// Configure session middleware after async initialization
async function setupSessions(app: express.Application) {
  const sessionStore = await createSessionStore();
  
  app.use(session({
    store: sessionStore,
    secret: process.env.SESSION_SECRET || 'gala-prediction-market-dev-secret-only',
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === 'production', // HTTPS-only in production
      httpOnly: true, // Prevent XSS access to cookies
      sameSite: 'strict', // CSRF protection
      maxAge: 2 * 60 * 60 * 1000, // 2 hours (secure for financial app)
    },
    name: 'sessionId', // Custom session name
    proxy: true, // Trust proxy headers in production
  }));
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  // Setup session storage before registering routes
  await setupSessions(app);
  
  // Cookie parser required for CSRF cookie-based tokens
  app.use(cookieParser());
  
  // CORS configuration - secure but functional
  app.use(cors({
    origin: function (origin, callback) {
      // In development, be more permissive for functionality
      if (process.env.NODE_ENV === 'development') {
        // Allow localhost and replit.dev origins in development
        if (!origin || 
            origin.includes('localhost') || 
            origin.includes('127.0.0.1') || 
            origin.includes('0.0.0.0') ||
            origin.includes('replit.dev') ||
            origin.includes('repl.co')) {
          return callback(null, true);
        }
      }
      
      // Production: strict whitelist
      const allowedOrigins = [
        'http://localhost:5000',
        'https://localhost:5000'
      ];
      
      if (process.env.NODE_ENV === 'production' && process.env.FRONTEND_URL) {
        allowedOrigins.push(process.env.FRONTEND_URL);
      }
      
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        console.warn(`CORS rejected origin: ${origin}`);
        callback(new Error('Not allowed by CORS'), false);
      }
    },
    credentials: true, // Required for cookies and authentication
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token'],
    exposedHeaders: ['X-CSRF-Token']
  }));
  
  // CSRF protection for state-changing operations
  const csrfProtection = csrf({
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict'
    }
  });
  
  // Apply CSRF protection to ALL /api routes (csurf handles safe methods automatically)
  app.use('/api', csrfProtection);
  
  // CSRF token endpoint (now has access to req.csrfToken() via middleware)
  app.get('/api/csrf-token', (req, res) => {
    res.json({ csrfToken: req.csrfToken() });
  });
  
  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || '5000', 10);
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, () => {
    log(`serving on port ${port}`);
  });
})();
